// Teste de ponta a ponta: cadastro, edição e exclusão das 3 entidades pela tela. Executado por scripts/e2e.js (npm run test:e2e).
// Etapas: 1 (cadastra/edita) e 2 (reabre, confere e exclui).
// Dados 100% fictícios; pastas isoladas definidas pelo executor.
const path = require("node:path");
const fs = require("node:fs");
const raiz = process.argv[process.argv.length - 1];
const { app, BrowserWindow } = require("electron");
const saida = process.env.FENIX_E2E_SAIDA || path.join(__dirname, "saida-crud");
fs.mkdirSync(saida, { recursive: true });

require(path.join(raiz, "electron", "main.js"));

const etapa = process.env.ETAPA;
const log = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (_ev, ...a) => log.push("[console] " + JSON.stringify(a.slice(0, 2))));
  win.webContents.once("did-finish-load", async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const foto = async (nome) => fs.writeFileSync(path.join(saida, nome + ".png"), (await win.webContents.capturePage()).toPNG());
    const check = (nome, cond, info) => { log.push(`${cond ? "OK  " : "FALHA"} ${nome}${info ? " :: " + info : ""}`); };
    try {
      await espera(800);
      if (etapa === "1") {
        await js(`sessao.primeiroAcesso({nome:"Admin Fictício",email:"admin@exemplo.invalid",senha:"SenhaAdmin#2026"}).then(r=>entrarNoSistema(r.data.usuario))`);
      } else {
        await js(`document.getElementById("email").value="admin@exemplo.invalid";document.getElementById("password").value="SenhaAdmin#2026";signIn()`);
      }
      await espera(1800);
      await js(`Swal.isVisible() && Swal.close()`); // lembrete semanal de pendrive
      await espera(400);
      check("login abre o sistema", await js(`!document.getElementById("app-shell").classList.contains("hidden")`));

      if (etapa === "1") {
        // DOADOR
        await js(`showPage("doador");
          doadorNome.value="doador fictício alfa"; doadorEmail.value="alfa@exemplo.invalid";
          doadorTelefone.value="(11) 90000-0001"; doadorCpf.value="000.000.000-01"; doadorEndereco.value="Rua Teste, 1";
          addDoador()`);
        await espera(800);
        // validação: CPF inválido não grava
        await js(`doadorNome.value="Invalido"; doadorCpf.value="123"; addDoador()`);
        await espera(800);
        let d = await js(`doadoresData.map(x=>({id:x.id_doador,nome:x.nome}))`);
        check("cadastra doador (1ª letra maiúscula) e recusa CPF inválido", d.length === 1 && d[0].nome === "Doador fictício alfa", JSON.stringify(d));
        // XSS: nome com HTML vira texto
        await js(`fecharModal("modalNovoDoador","formNovoDoador"); doadorNome.value='Beta <img src=x onerror="window.__xss=1">'; doadorCpf.value=""; doadorSemContato.checked=true; addDoador()`);
        await espera(1000);
        check("HTML no nome é exibido como texto (sem executar)", (await js(`window.__xss===undefined && document.querySelector("#doadorTable tbody").textContent.includes("<img")`)));
        const id = d[0].id;
        await js(`updateDoador(${id}); editDoadorNome.value="Doador Fictício Alfa Editado"; salvarEdicaoDoador()`);
        await espera(1000);
        check("edita doador", (await js(`doadoresData.find(x=>x.id_doador===${id}).nome`)) === "Doador Fictício Alfa Editado");

        // DOAÇÃO
        await js(`fecharModal("modalEditarDoador","formEditarDoador"); showPage("doacao");
          bootstrap.Modal.getOrCreateInstance(document.getElementById("modalNovaDoacao")).show();`);
        await espera(600);
        await js(`choicesDoador.setChoiceByValue("${id}"); doacaoValor.value="250.75"; doacaoForma.value="Pix"; addDoacao()`);
        await espera(1200);
        let doacoes = await js(`doacoesData`);
        check("cadastra doação", doacoes.length === 1 && doacoes[0].valor === 250.75 && doacoes[0].status === "Pendente", JSON.stringify(doacoes[0]));
        await js(`updateDoacao(${doacoes[0].id_doacao}); editDoacaoStatus.value="Pago"; salvarEdicaoDoacao()`);
        await espera(1200);
        check("edita doação (status Pago)", (await js(`doacoesData[0].status`)) === "Pago");
        await js(`fecharModal("modalEditarDoacao","formEditarDoacao")`);

        // INTERAÇÃO
        await js(`showPage("interacao"); bootstrap.Modal.getOrCreateInstance(document.getElementById("modalNovaInteracao")).show();`);
        await espera(600);
        await js(`choicesDoadorInteracao.setChoiceByValue("${id}"); tipoInteracao.value="Ligação"; observacoes.value="Contato de teste"; addInteracaoNova()`);
        await espera(1200);
        let inter = await js(`interacoesData`);
        check("cadastra interação (com o usuário da sessão)", inter.length === 1 && inter[0].tipo_interacao === "Ligação" && inter[0].id_usuario === "1", JSON.stringify(inter[0]));
        await js(`updateInteracaoNova(${inter[0].id_interacao}); editTipoInteracao.value="E-mail"; salvarEdicaoInteracao()`);
        await espera(1200);
        check("edita interação", (await js(`interacoesData[0].tipo_interacao`)) === "E-mail");
        await js(`fecharModal("modalEditarInteracao","formEditarInteracao")`);
        await espera(600);

        // WhatsApp obrigatório (a não ser que marque "ainda sem informações de contato")
        await js(`showPage("doador"); doadorNome.value="Sem Whatsapp"; doadorTelefone.value=""; doadorSemContato.checked=false; addDoador(); 0`);
        await espera(800);
        const zap = { n: await js(`doadoresData.length`), titulo: await js(`Swal.getTitle() ? Swal.getTitle().textContent : ""`) };
        check("exige WhatsApp quando não marca 'sem contato'", zap.n === 2 && zap.titulo.includes("WhatsApp"), JSON.stringify(zap));
        await js(`fecharModal("modalNovoDoador","formNovoDoador")`);
        await espera(500);
        check("selo 'Sem contato' na lista", (await js(`document.querySelector("#doadorTable tbody").textContent.includes("Sem contato")`)));

        // Data futura: só com status Pendente
        const futura = await js(`(()=>{const d=new Date();d.setDate(d.getDate()+10);return d.toISOString().slice(0,10)})()`);
        const idDoacao = await js(`doacoesData[0].id_doacao`);
        await js(`updateDoacao(${idDoacao}); editDoacaoStatus.value="Pago"; editDoacaoData.value="${futura}"; salvarEdicaoDoacao()`);
        await espera(1000);
        check("recusa data futura com status Pago", (await js(`doacoesData[0].data_doacao`)) !== futura);
        await js(`editDoacaoStatus.value="Pendente"; editDoacaoData.value="${futura}"; salvarEdicaoDoacao()`);
        await espera(1200);
        check("aceita data futura com status Pendente (promessa)", (await js(`doacoesData[0].data_doacao`)) === futura);
        await js(`updateDoacao(${idDoacao}); editDoacaoStatus.value="Pago"; editDoacaoData.value=hojeISO(); salvarEdicaoDoacao()`);
        await espera(1200);
        await js(`fecharModal("modalEditarDoacao","formEditarDoacao")`);
        await espera(500);

        // Interação com pessoa não registrada (lead) e com doação relacionada
        await js(`showPage("interacao"); bootstrap.Modal.getOrCreateInstance(document.getElementById("modalNovaInteracao")).show();`);
        await espera(600);
        await js(`choicesDoadorInteracao.setChoiceByValue("nao-registrada"); ajustarCamposInteracao("")`);
        check("lead: mostra campos de pessoa não registrada", await js(`!grupoPessoa.classList.contains("hidden") && grupoDoacao.classList.contains("hidden")`));
        await js(`tipoInteracao.value="Mensagem"; pessoaNome.value=""; addInteracaoNova()`);
        await espera(800);
        check("lead: exige o nome da pessoa", (await js(`interacoesData.length`)) === 1);
        await js(`pessoaNome.value="Lead Fictício"; pessoaContato.value="(11) 90000-0099"; addInteracaoNova()`);
        await espera(1200);
        check("lead: grava interação sem doador", await js(`interacoesData.some(i => i.id_doador === null && i.pessoa_nome === "Lead Fictício")`));
        check("lead: tabela mostra 'Não registrado'", await js(`document.querySelector("#interacaoTable tbody").textContent.includes("Não registrado")`));
        await js(`bootstrap.Modal.getOrCreateInstance(document.getElementById("modalNovaInteracao")).show();`);
        await espera(600);
        await js(`choicesDoadorInteracao.setChoiceByValue("${id}"); ajustarCamposInteracao("")`);
        check("doação relacionada: lista as doações do doador", (await js(`doacaoInteracao.options.length`)) === 2);
        await js(`doacaoInteracao.value=String(${idDoacao}); tipoInteracao.value="E-mail"; addInteracaoNova()`);
        await espera(1200);
        check("doação relacionada: grava o vínculo", await js(`interacoesData.some(i => i.id_doacao === ${idDoacao})`), JSON.stringify({ idDoacao, inter: await js(`interacoesData.map(i=>[i.id_doador,i.id_doacao,i.tipo_interacao])`), titulo: await js(`Swal.getTitle() ? Swal.getTitle().textContent : ""`), escolha: await js(`idDoadorInteracao.value`), sel: await js(`doacaoInteracao.value`) }));
        // volta ao estado esperado pela etapa 2 (1 interação)
        await js(`Promise.all(interacoesData.filter(i => i.pessoa_nome || i.id_doacao).map(i => dados.excluir("interacao_nova", i.id_interacao))).then(() => loadInteracoes())`);
        await espera(800);

        // regra: doador com vínculo não é excluído
        await js(`deleteDoador(${id})`);
        await espera(800);
        check("bloqueia excluir doador com vínculos", (await js(`doadoresData.length`)) === 2);
        await espera(2500);
        await js(`showPage("dashboard")`);
        await espera(500);
        check("dashboard soma doações", (await js(`statTotalArrecadado.textContent`)).includes("250,75"), await js(`statTotalArrecadado.textContent`));
        await foto("1-dashboard");
        await js(`showPage("doador")`); await espera(300); await foto("1-doadores");
        await js(`showPage("doacao")`); await espera(300); await foto("1-doacoes");
      }

      if (etapa === "2") {
        const n = await js(`[doadoresData.length, doacoesData.length, interacoesData.length]`);
        check("dados persistem após reiniciar (2 doadores, 1 doação, 1 interação)", JSON.stringify(n) === "[2,1,1]", JSON.stringify(n));
        await js(`showPage("interacao")`); await espera(300); await foto("2-interacoes-apos-reiniciar");
        const excluir = async (fn, id) => { await js(`${fn}(${id})`); await espera(500); await js(`Swal.clickConfirm()`); await espera(1500); };
        await excluir("deleteInteracaoNova", await js(`interacoesData[0].id_interacao`));
        check("exclui interação", (await js(`interacoesData.length`)) === 0);
        await excluir("deleteDoacao", await js(`doacoesData[0].id_doacao`));
        check("exclui doação", (await js(`doacoesData.length`)) === 0);
        for (const id of await js(`doadoresData.map(x=>x.id_doador)`)) await excluir("deleteDoador", id);
        check("exclui doadores", (await js(`doadoresData.length`)) === 0);
        await js(`showPage("doador")`); await espera(300); await foto("2-doadores-vazio");
      }
    } catch (e) {
      log.push("ERRO " + e.stack);
    }
    fs.writeFileSync(path.join(saida, `log-etapa${etapa}.txt`), log.join("\n"));
    app.quit();
  });
});
