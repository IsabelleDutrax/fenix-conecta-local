// Captura as telas do manual no programa real, com dados FICTÍCIOS.
// Executado por scripts/gerar-manual.js (npm run manual). Não usar direto.
// Env: FENIX_PASTA_DADOS, FENIX_PASTA_BACKUP, FENIX_TESTE_DIALOGO, FENIX_MANUAL_IMG, ETAPA=A|B
const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");

const raiz = process.argv[process.argv.length - 1];
// Rodando por "electron script.js", app.getVersion() devolveria a versão do Electron.
app.setVersion(require(path.join(raiz, "package.json")).version);
const destino = process.env.FENIX_MANUAL_IMG;
const etapa = process.env.ETAPA;
fs.mkdirSync(destino, { recursive: true });
require(path.join(raiz, "electron", "main.js"));

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

const hoje = new Date();
const dia = (delta) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const DOADORES = [
  { nome: "Ana Exemplo", email: "ana@example.org", telefone: "(11) 90000-0001", cpf_cnpj: "000.000.000-01", endereco: "Rua Exemplo, 100" },
  { nome: "Bruno Exemplo", email: "bruno@example.org", telefone: "(11) 90000-0002", cpf_cnpj: "000.000.000-02", endereco: "Av. Modelo, 200" },
  { nome: "Carla Exemplo", email: "carla@example.org", telefone: "(11) 90000-0003", cpf_cnpj: "000.000.000-03", endereco: "Rua Fictícia, 300" },
  { nome: "Empresa Exemplo Ltda", email: "contato@example.org", telefone: "(11) 3000-0004", cpf_cnpj: "00.000.000/0001-00", endereco: "Av. Teste, 400" },
  { nome: "Fernanda Exemplo", email: "", telefone: "(11) 90000-0005", cpf_cnpj: "", endereco: "" },
];

app.on("browser-window-created", (_e, win) => {
  win.webContents.once("did-finish-load", async () => {
    const js = (c) => win.webContents.executeJavaScript(c);
    const foto = async (nome) => {
      await espera(700); // animações (modais, alertas)
      fs.writeFileSync(path.join(destino, nome + ".png"), (await win.webContents.capturePage()).toPNG());
      log.push("capturada " + nome);
    };
    const swalVisivel = async (ms = 3000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await js(`Swal.isVisible()`)) return true;
        await espera(150);
      }
      return false;
    };
    const fecharTudo = async () => {
      await js(`Swal.isVisible() && Swal.close(); document.querySelectorAll(".modal.show").forEach(m=>bootstrap.Modal.getInstance(m)?.hide());`);
      await espera(600);
    };
    try {
      win.setSize(1280, 860); // altura suficiente para a tela de primeiro acesso sem barra de rolagem
      await espera(1500);

      if (etapa === "A") {
        // 1. Primeiro acesso
        await js(`paNome.value="Responsável Exemplo"; paEmail.value="responsavel@example.org"; paSenha.value="SenhaExemplo#2026"; paSenha2.value="SenhaExemplo#2026"`);
        await foto("01-primeiro-acesso");
        await js(`document.querySelector("#painel-primeiro-acesso button.btn-block").click()`);
        await espera(1500);
        await foto("02-chave-recuperacao");
        await js(`chaveGuardada.click(); btnConcluirChave.click()`);
        await espera(1500);
        if (await swalVisivel()) await foto("14-lembrete-pendrive");
        await js(`Swal.isVisible() && Swal.clickCancel()`); // "Lembrar amanhã"
        await espera(800);

        // Dados fictícios
        await js(`(async () => {
          const doadores = ${JSON.stringify(DOADORES)};
          const ids = [];
          for (const d of doadores) ids.push((await dados.inserir("doador_novo", d)).data.id_doador);
          const doacoes = [
            [0, 150, ${JSON.stringify(dia(-40))}, "Pix", "Pago"], [0, 150, ${JSON.stringify(dia(-10))}, "Pix", "Pago"],
            [1, 80.5, ${JSON.stringify(dia(-20))}, "Boleto", "Pago"], [2, 200, ${JSON.stringify(dia(-5))}, "Transferência", "Pendente"],
            [3, 1500, ${JSON.stringify(dia(-3))}, "Transferência", "Pago"], [4, 50, ${JSON.stringify(dia(-1))}, "Dinheiro em espécie", "Não Pago"],
            [2, 200, ${JSON.stringify(dia(12))}, "Pix", "Pendente"],
          ];
          for (const [i, valor, data_doacao, forma_pagamento, status] of doacoes)
            await dados.inserir("doacao_nova", { id_doador: ids[i], valor, data_doacao, forma_pagamento, status });
          const interacoes = [
            [0, "Mensagem", "Agradecimento pela doação", ${JSON.stringify(dia(-9))}],
            [1, "Ligação", "Confirmou doação mensal", ${JSON.stringify(dia(-15))}],
            [3, "E-mail", "Envio do recibo", ${JSON.stringify(dia(-2))}],
            [2, "Visita presencial", "Visitou a sede", ${JSON.stringify(dia(-4))}],
          ];
          for (const [i, tipo_interacao, observacoes, data_interacao] of interacoes)
            await dados.inserir("interacao_nova", { id_doador: ids[i], tipo_interacao, observacoes, data_interacao });
          await usuarios.criar({ nome: "Voluntário Exemplo", email: "voluntario@example.org", senha: "SenhaVoluntario#2026", nivel_acesso: 1 });
          await loadData();
        })()`);
        await espera(1200);

        // 4. Dashboard
        await js(`showPage("dashboard")`);
        await foto("04-dashboard");

        // 5-6. Doadores
        await js(`showPage("doador")`);
        await foto("05-doadores");
        await js(`document.querySelector('#doador-section [data-bs-target="#modalNovoDoador"]').click()`);
        await espera(400);
        await js(`doadorNome.value="Gabriel Exemplo"; doadorEmail.value="gabriel@example.org"; doadorTelefone.value="(11) 90000-0007"; doadorCpf.value="000.000.000-07"; doadorEndereco.value="Rua Exemplo, 700"`);
        await foto("06-novo-doador");
        await js(`fecharModal("modalNovoDoador","formNovoDoador")`);
        await espera(500);
        await js(`document.querySelector("#doador-section .dropdown-toggle").click()`);
        await foto("20-exportar");
        await js(`document.querySelector("#doador-section .dropdown-toggle").click()`);
        await espera(300);

        // 7-8. Doações
        await js(`showPage("doacao")`);
        await foto("07-doacoes");
        await js(`document.querySelector('#doacao-section [data-bs-target="#modalNovaDoacao"]').click()`);
        await espera(500);
        await js(`choicesDoador.setChoiceByValue(String(doadoresData[0].id_doador)); doacaoValor.value="100"; doacaoForma.value="Pix"`);
        await foto("08-nova-doacao");
        await js(`fecharModal("modalNovaDoacao","formNovaDoacao")`);
        await espera(500);

        // 9-10. Interações
        await js(`showPage("interacao")`);
        await foto("09-interacoes");
        await js(`document.querySelector('#interacao-section [data-bs-target="#modalNovaInteracao"]').click()`);
        await espera(500);
        await js(`choicesDoadorInteracao.setChoiceByValue(String(doadoresData[1].id_doador)); tipoInteracao.value="Ligação"; observacoes.value="Lembrete da campanha de fim de ano"`);
        await foto("10-nova-interacao");
        await js(`fecharModal("modalNovaInteracao","formNovaInteracao")`);
        await espera(500);

        // 11-12. Usuários
        await js(`showPage("usuarios")`);
        await espera(600);
        await foto("11-usuarios");
        await js(`abrirModalUsuario()`);
        await espera(400);
        await js(`usuarioNome.value="Novo Voluntário"; usuarioEmail.value="novo@example.org"; usuarioSenha.value="SenhaInicial#2026"`);
        await foto("12-novo-usuario");
        await js(`fecharModal("modalUsuario","formUsuario")`);
        await espera(500);

        // 13. Backup + 16. Restaurar (backup já com os dados fictícios)
        await js(`showPage("backup")`);
        await espera(800);
        await js(`document.querySelector('#backup-section [data-click="fazerBackupAgora()"]').click()`);
        await espera(2500);
        await foto("13-backup");
        await js(`document.querySelector('#backupTable [data-click^="restaurarDaLista"]').click()`);
        if (await swalVisivel()) await foto("16-restaurar");
        await js(`Swal.clickCancel()`);
        await espera(600);

        // 15. Excel
        await js(`showPage("dashboard")`);
        await js(`document.querySelector('[data-click="exportarExcel()"]').click()`);
        if (await swalVisivel()) await foto("15-aviso-excel");
        await fecharTudo();

        // 17. Alterar senha
        await js(`alterarMinhaSenha(); 0`); // não espera a janela fechar
        if (await swalVisivel()) await foto("17-alterar-senha");
        await fecharTudo();

        // 21. Aviso de atualização (simulado: no programa instalado aparece sozinho)
        await js(`mostrarAvisoAtualizacao("1.0.1")`);
        await foto("21-atualizacao-pronta");
        await js(`avisoAtualizacao.classList.add("hidden")`);

        // 3. Login + 19. Usuário comum
        await js(`signOut()`);
        await espera(1500);
        await js(`email.value="voluntario@example.org"`);
        await foto("03-login");
        await js(`password.value="SenhaVoluntario#2026"; signIn()`);
        await espera(1800);
        await fecharTudo();
        await js(`showPage("doador")`);
        await foto("19-usuario-comum");
      }

      if (etapa === "B") {
        await foto("18-recuperar");
      }
    } catch (e) {
      log.push("ERRO " + e.stack);
    }
    fs.writeFileSync(path.join(process.env.FENIX_MANUAL_LOG || destino, `captura-${etapa}.log`), log.join("\n") + "\n");
    app.quit();
  });
});
