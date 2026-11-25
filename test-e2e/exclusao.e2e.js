// Teste de ponta a ponta: só o administrador exclui registros. Executado por scripts/e2e.js (npm run test:e2e).
// Etapa única.
// Dados 100% fictícios; pastas isoladas definidas pelo executor.
const path = require("node:path"); const fs = require("node:fs"); const { app } = require("electron");
const raiz = process.argv[process.argv.length - 1];
require(path.join(raiz, "electron", "main.js"));
const log = []; const espera = (ms) => new Promise((r) => setTimeout(r, ms));
app.on("browser-window-created", (_e, win) => {
  win.webContents.once("did-finish-load", async () => {
    const js = (c) => win.webContents.executeJavaScript(c);
    const check = (n, c, i) => log.push(`${c ? "OK  " : "FALHA"} ${n}${i ? " :: " + i : ""}`);
    const lixeiras = () => js(`document.querySelectorAll("#doadorTable .fi-rr-trash, #doacaoTable .fi-rr-trash, #interacaoTable .fi-rr-trash").length`);
    try {
      await espera(1200);
      await js(`sessao.primeiroAcesso({nome:"Admin Fictício",email:"admin@exemplo.invalid",senha:"SenhaAdmin#2026"})`);
      await js(`usuarios.criar({nome:"Comum Fictício",email:"comum@exemplo.invalid",senha:"SenhaComum#2026",nivel_acesso:1})`);
      const d = await js(`dados.inserir("doador_novo",{nome:"Doador Fictício Delta"})`);
      const id = d.data.id_doador;
      await js(`dados.inserir("doacao_nova",{id_doador:${id},valor:10})`);
      await js(`dados.inserir("interacao_nova",{id_doador:${id},tipo_interacao:"Mensagem"})`);
      await js(`sessao.sair()`);

      await js(`email.value="comum@exemplo.invalid"; password.value="SenhaComum#2026"; signIn()`); await espera(1800);
      check("comum: nenhum botão de excluir nas 3 tabelas", (await lixeiras()) === 0);
      check("comum: editar continua visível", (await js(`document.querySelectorAll("#doadorTable .fi-rr-pencil").length`)) === 1);
      const r = await js(`dados.excluir("doacao_nova", doacoesData[0].id_doacao)`);
      check("comum: API recusa exclusão", r.error && r.error.code === "SEM_PERMISSAO", r.error && r.error.message);
      await js(`deleteInteracaoNova(interacoesData[0].id_interacao)`); await espera(800);
      check("comum: função da tela avisa e não abre confirmação", !(await js(`Swal.getPopup() && Swal.getPopup().textContent.includes("Tem certeza")`)));
      check("comum: registros intactos", (await js(`[doadoresData.length,doacoesData.length,interacoesData.length].join()`)) === "1,1,1");
      const ed = await js(`dados.atualizar("doacao_nova", doacoesData[0].id_doacao, {status:"Pago"})`);
      check("comum: edição continua permitida", ed.error === null);
      await js(`signOut()`); await espera(800);

      await js(`email.value="admin@exemplo.invalid"; password.value="SenhaAdmin#2026"; signIn()`); await espera(1800);
      check("admin: botões de excluir nas 3 tabelas", (await lixeiras()) === 3);
      await js(`deleteInteracaoNova(interacoesData[0].id_interacao)`); await espera(600);
      await js(`Swal.clickConfirm()`); await espera(1500);
      check("admin: exclui pela tela", (await js(`interacoesData.length`)) === 0);
    } catch (e) { log.push("ERRO " + e.stack); }
    const saida = process.env.FENIX_E2E_SAIDA || path.join(__dirname, "saida-exclusao");
    fs.mkdirSync(saida, { recursive: true });
    fs.writeFileSync(path.join(saida, "log-unica.txt"), log.join("\n") + "\n");
    app.quit();
  });
});
