// Teste de ponta a ponta: primeiro acesso, chave de recuperação, perfis, bloqueio e recuperação. Executado por scripts/e2e.js (npm run test:e2e).
// Etapas: A, B e C (antes de C o executor remove o chave.bin).
// Dados 100% fictícios; pastas isoladas definidas pelo executor.
const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");
const raiz = process.argv[process.argv.length - 1];
const saida = process.env.FENIX_E2E_SAIDA || path.join(__dirname, "saida-login");
fs.mkdirSync(saida, { recursive: true });
require(path.join(raiz, "electron", "main.js"));

const etapa = process.env.ETAPA;
const log = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN = { nome: "Admin Fictício", email: "admin@exemplo.invalid", senha: "SenhaAdmin#2026" };
const COMUM = { nome: "Voluntário Fictício", email: "voluntario@exemplo.invalid", senha: "SenhaComum#2026" };
const arqChave = path.join(saida, "chave-impressa.txt");

app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (_ev, ...a) => {
    const t = JSON.stringify(a.slice(0, 2));
    if (!t.includes("Security Warning")) log.push("[console] " + t);
  });
  win.webContents.once("did-finish-load", async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const foto = async (nome) =>
      fs.writeFileSync(path.join(saida, nome + ".png"), (await win.webContents.capturePage()).toPNG());
    const check = (nome, cond, info) => log.push(`${cond ? "OK  " : "FALHA"} ${nome}${info ? " :: " + info : ""}`);
    const visivel = (id) => js(`!document.getElementById("${id}").classList.contains("hidden")`);
    const entrar = async (email, senha) => {
      await js(`email.value=${JSON.stringify(email)}; password.value=${JSON.stringify(senha)}; signIn()`);
      await espera(1200);
    };
    const sair = async () => { await js(`signOut()`); await espera(800); };
    try {
      await espera(1200);
      if (etapa === "A") {
        check("banco novo abre na tela de primeiro acesso", await visivel("painel-primeiro-acesso"));
        const semSessao = await js(`dados.listar("doador_novo")`);
        check("dados bloqueados sem login", semSessao.error && semSessao.error.code === "SEM_SESSAO");
        await foto("A1-primeiro-acesso");

        await js(`paNome.value=${JSON.stringify(ADMIN.nome)}; paEmail.value=${JSON.stringify(ADMIN.email)}; paSenha.value="SenhaAdmin#2026"; paSenha2.value="diferente"; criarPrimeiroAdmin()`);
        await espera(800);
        check("senhas diferentes não criam admin", await visivel("painel-primeiro-acesso"));
        await js(`paSenha2.value="SenhaAdmin#2026"; criarPrimeiroAdmin()`);
        await espera(1500);
        check("após criar admin mostra a chave de recuperação", await visivel("painel-chave"));
        const chave = await js(`chaveRecuperacaoTexto.textContent`);
        check("chave tem 8 grupos de 8", /^([0-9A-F]{8}-){7}[0-9A-F]{8}$/.test(chave));
        fs.writeFileSync(arqChave, chave);
        check("Continuar bloqueado até confirmar", await js(`btnConcluirChave.disabled`));
        await foto("A2-chave-recuperacao");
        await js(`chaveGuardada.click()`);
        check("Continuar liberado após confirmar", !(await js(`btnConcluirChave.disabled`)));
        await js(`btnConcluirChave.click()`);
        await espera(1500);
        check("admin entra no sistema", await visivel("app-shell"));
        check("perfil exibido: Administrador", (await js(`userNivelDisplay.textContent`)) === "Administrador");
        check("menu Usuários visível para admin", !(await js(`document.querySelector('li.somente-admin').classList.contains('hidden')`)));

        await js(`doadorNome.value="Doador Fictício Gama"; doadorTelefone.value="(11) 90000-0009"; addDoador()`);
        await espera(1000);
        const idD = await js(`doadoresData[0] && doadoresData[0].id_doador`);
        await js(`choicesDoadorInteracao.setChoiceByValue("${idD}"); tipoInteracao.value="Mensagem"; dataInteracao.value=hojeISO(); addInteracaoNova()`);
        await espera(1200);
        check("interação grava o id do usuário da sessão", (await js(`interacoesData[0] && interacoesData[0].id_usuario`)) === "1");
        await js(`fecharModal("modalNovaInteracao","formNovaInteracao")`);

        await js(`showPage("usuarios")`);
        await espera(800);
        await js(`abrirModalUsuario()`);
        await espera(600);
        await js(`usuarioNome.value=${JSON.stringify(COMUM.nome)}; usuarioEmail.value=${JSON.stringify(COMUM.email)}; usuarioSenha.value=${JSON.stringify(COMUM.senha)}; usuarioNivel.value="1"; salvarUsuario()`);
        await espera(1500);
        check("admin cria usuário comum", (await js(`usuariosData.length`)) === 2, await js(`JSON.stringify(usuariosData.map(u=>u.email))`));
        await espera(1600);
        await foto("A3-usuarios");

        await sair();
        check("sair volta ao login", await visivel("auth-section"));
        await entrar(ADMIN.email, "senha-errada");
        check("senha errada não entra", await visivel("auth-section"));

        await entrar(COMUM.email, COMUM.senha);
        check("usuário comum entra", await visivel("app-shell"));
        check("perfil exibido: Usuário comum", (await js(`userNivelDisplay.textContent`)) === "Usuário comum");
        check("menu Usuários oculto para comum", await js(`document.querySelector('li.somente-admin').classList.contains('hidden')`));
        const visiveis = await js(`[...document.querySelectorAll('.somente-admin')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim())`);
        check("nenhuma função de admin VISÍVEL na tela do comum (estilo calculado)", visiveis.length === 0, visiveis.join(" | "));
        const tentativa = await js(`usuarios.listar()`);
        check("comum não lista usuários nem chamando a API direto", tentativa.error && tentativa.error.code === "SEM_PERMISSAO");
        const chaveComum = await js(`sessao.verChaveRecuperacao(${JSON.stringify(COMUM.senha)})`);
        check("comum não vê a chave de recuperação", chaveComum.error && chaveComum.error.code === "SEM_PERMISSAO");
        await js(`showPage("usuarios")`);
        check("página Usuários redireciona comum ao dashboard", await visivel("dashboard-page"));
        check("comum vê os dados (CRUD igual ao sistema atual)", (await js(`doadoresData.length`)) === 1);
        await foto("A4-comum");
        await sair();

        // bloqueio após 5 tentativas
        for (let i = 0; i < 5; i++) await js(`sessao.entrar("admin@exemplo.invalid","x${i}")`);
        const bloqueio = await js(`sessao.entrar(${JSON.stringify(ADMIN.email)}, ${JSON.stringify(ADMIN.senha)})`);
        check("5 senhas erradas bloqueiam por 30 s (até senha certa)", bloqueio.error && bloqueio.error.code === "BLOQUEADO", bloqueio.error && bloqueio.error.message);
      }

      if (etapa === "B") {
        check("reabrir pede login (sessão não persiste)", await visivel("auth-section"));
        await foto("B1-login");
        await entrar(ADMIN.email, ADMIN.senha);
        check("admin entra após reiniciar", await visivel("app-shell"));
        check("dados persistem", (await js(`[doadoresData.length, interacoesData.length].join()`)) === "1,1");
        // troca de senha via API (o formulário é um SweetAlert)
        const r = await js(`sessao.alterarMinhaSenha(${JSON.stringify(ADMIN.senha)}, "NovaSenha#2026")`);
        check("admin altera a própria senha", r.error === null);
        await sair();
        await entrar(ADMIN.email, ADMIN.senha);
        check("senha antiga deixa de valer", await visivel("auth-section"));
        await entrar(ADMIN.email, "NovaSenha#2026");
        check("senha nova funciona", await visivel("app-shell"));
        const ver = await js(`sessao.verChaveRecuperacao("NovaSenha#2026")`);
        check("admin vê a chave com a senha", ver.data === fs.readFileSync(arqChave, "utf8"));

        // Esqueci minha senha (administrador, com a chave de recuperação)
        const chaveCerta = fs.readFileSync(arqChave, "utf8");
        const r1 = await js(`sessao.redefinirSenhaComChave("${ADMIN.email}", "00000000-00000000-00000000-00000000-00000000-00000000-00000000-00000000", "OutraSenha#2026")`);
        check("esqueci a senha: chave errada é recusada", r1.error && r1.error.code === "CREDENCIAIS");
        const r2 = await js(`sessao.redefinirSenhaComChave("${COMUM.email}", ${JSON.stringify(chaveCerta)}, "OutraSenha#2026")`);
        check("esqueci a senha: só vale para administrador", r2.error && r2.error.code === "CREDENCIAIS");
        const r3 = await js(`sessao.redefinirSenhaComChave("${ADMIN.email}", ${JSON.stringify(chaveCerta.toLowerCase())}, "SenhaPelaChave#2026")`);
        check("esqueci a senha: chave certa cria senha nova", r3.error === null);
        await sair();
        await entrar(ADMIN.email, "SenhaPelaChave#2026");
        check("entra com a senha criada pela chave", await visivel("app-shell"));
        await js(`sessao.alterarMinhaSenha("SenhaPelaChave#2026", "NovaSenha#2026")`);

        // Lembrar meu e-mail (nunca a senha)
        await sair();
        await js(`lembrarEmail.checked = true`);
        await entrar(ADMIN.email, "NovaSenha#2026");
        await sair();
        await js(`email.value = ""; password.value = ""; mostrarPainelLogin("auth-section")`);
        check("lembrar meu e-mail: e-mail já preenchido", (await js(`email.value`)) === ADMIN.email && (await js(`password.value`)) === "");
        await js(`lembrarEmail.checked = false`);
        await entrar(ADMIN.email, "NovaSenha#2026");
        await sair();
        await js(`email.value = ""; mostrarPainelLogin("auth-section")`);
        check("desmarcar 'lembrar' esquece o e-mail", (await js(`email.value`)) === "");
      }

      if (etapa === "C") {
        check("sem chave.bin abre a tela de recuperação", await visivel("painel-recuperar"));
        await foto("C1-recuperar");
        await js(`chaveDigitada.value="00000000-00000000-00000000-00000000-00000000-00000000-00000000-00000000"; recuperarComChave()`);
        await espera(1500);
        check("chave errada é recusada", await visivel("painel-recuperar"));
        const chave = fs.readFileSync(arqChave, "utf8").toLowerCase().replace(/-/g, " ");
        await js(`chaveDigitada.value=${JSON.stringify(chave)}; recuperarComChave()`);
        await espera(1500);
        check("chave impressa (digitada em minúsculas/espaços) abre os dados", await visivel("auth-section"));
        await entrar(ADMIN.email, "NovaSenha#2026");
        check("login após recuperação e dados intactos", (await js(`doadoresData.length`)) === 1);
      }
    } catch (e) {
      log.push("ERRO " + e.stack);
    }
    fs.writeFileSync(path.join(saida, `log-${etapa}.txt`), log.join("\n"));
    app.quit();
  });
});
