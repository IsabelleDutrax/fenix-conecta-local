// Teste de ponta a ponta: modo offline, CSP, despachante de botões, exportar CSV/PDF. Executado por scripts/e2e.js (npm run test:e2e).
// Etapa única.
// Dados 100% fictícios; pastas isoladas definidas pelo executor.
const path = require("node:path");
const fs = require("node:fs");
const { app, session } = require("electron");
const raiz = process.argv[process.argv.length - 1];
const saida = process.env.FENIX_E2E_SAIDA || path.join(__dirname, "saida-offline");
fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(saida, { recursive: true });

// Captura avisos do processo principal (rede bloqueada).
const avisosMain = [];
const warnOriginal = console.warn;
console.warn = (...a) => { avisosMain.push(a.join(" ")); warnOriginal(...a); };

require(path.join(raiz, "electron", "main.js"));

const log = [];
const consoleRenderer = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const downloads = [];

app.whenReady().then(() => {
  session.defaultSession.on("will-download", (_e, item) => {
    const destino = path.join(saida, item.getFilename());
    item.setSavePath(destino);
    item.once("done", (_ev, estado) => downloads.push({ nome: item.getFilename(), estado, destino }));
  });
});

app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (_ev, ...a) => consoleRenderer.push(JSON.stringify(a.slice(0, 2))));
  win.webContents.once("did-finish-load", async () => {
    const js = (c) => win.webContents.executeJavaScript(c);
    const check = (n, c, i) => log.push(`${c ? "OK  " : "FALHA"} ${n}${i ? " :: " + i : ""}`);
    const visivel = (id) => js(`!document.getElementById("${id}").classList.contains("hidden")`);
    const clicar = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const foto = async (n) => fs.writeFileSync(path.join(saida, n + ".png"), (await win.webContents.capturePage()).toPNG());
    try {
      await espera(1500);
      // Bibliotecas carregadas do disco
      check("bibliotecas carregadas (Bootstrap, Swal, Choices, jsPDF, autotable)",
        await js(`!!(window.bootstrap && window.Swal && window.Choices && window.jspdf && window.jspdf.jsPDF && new window.jspdf.jsPDF().autoTable)`));
      await js(`document.fonts.ready`);
      await js(`Promise.all([document.fonts.load('16px "Libre Baskerville"'), document.fonts.load('700 16px "Libre Baskerville"'), document.fonts.load('16px uicons-regular-rounded')])`);
      check("fonte Libre Baskerville embutida", await js(`document.fonts.check('16px "Libre Baskerville"') && [...document.fonts].some(f=>f.family.includes("Libre Baskerville") && f.status==="loaded")`));
      check("ícones Uicons embutidos", await js(`[...document.fonts].some(f=>f.family.includes("uicons-regular-rounded") && f.status==="loaded")`));
      const urls = await js(`performance.getEntriesByType("resource").map(r=>r.name)`);
      check("nenhum recurso carregado de fora do programa", urls.every((u) => u.startsWith("file:")), urls.filter((u) => !u.startsWith("file:")).join(", "));

      // Primeiro acesso com cliques reais (despachante)
      await js(`paNome.value="Admin Fictício"; paEmail.value="admin@exemplo.invalid"; paSenha.value="SenhaAdmin#2026"; paSenha2.value="SenhaAdmin#2026"`);
      await clicar("#painel-primeiro-acesso button.btn-block");
      await espera(1500);
      check("clique em 'Criar administrador' funciona", await visivel("painel-chave"));
      await clicar("#chaveGuardada"); // dispara change -> liberarContinuar(this.checked)
      check("checkbox libera 'Continuar' (data-change + this.checked)", !(await js(`btnConcluirChave.disabled`)));
      await clicar("#btnConcluirChave");
      await espera(1500);
      check("entra no sistema", await visivel("app-shell"));
      await js(`Swal.isVisible() && Swal.close()`); // lembrete semanal de pendrive
      await espera(500);
      check("aviso de atualização escondido quando não há atualização", await js(`getComputedStyle(avisoAtualizacao).display === "none"`));
      const valoresMoeda = await js(`dados.inserir("doador_novo",{nome:"Moeda"}).then(r=>dados.inserir("doacao_nova",{id_doador:r.data.id_doador,valor:1500})).then(()=>loadDoacoes()).then(()=>[...document.querySelectorAll("#doacaoTable tbody td:nth-child(2)")].map(t=>t.textContent.trim()))`);
      check("valor da doação em formato brasileiro", valoresMoeda.includes("R$ 1.500,00") || valoresMoeda.includes("R$ 1.500,00"), valoresMoeda.join(" | "));
      await js(`dados.listar("doacao_nova").then(r=>Promise.all(r.data.map(d=>dados.excluir("doacao_nova",d.id_doacao)))).then(()=>dados.listar("doador_novo")).then(r=>Promise.all(r.data.map(d=>dados.excluir("doador_novo",d.id_doador)))).then(()=>loadData())`);
      await espera(500);

      // Navegação pelo menu e modal do Bootstrap
      await clicar('.sidebar .nav-link[data-page="doador"]');
      await espera(300);
      check("menu lateral troca de página", await visivel("doador-section"));
      await clicar('#doador-section [data-bs-target="#modalNovoDoador"]');
      await espera(700);
      check("modal do Bootstrap abre", await js(`document.getElementById("modalNovoDoador").classList.contains("show")`));
      await js(`doadorNome.value="Doador Fictício Épsilon"; doadorEmail.value="epsilon@exemplo.invalid"`);
      await clicar("#modalNovoDoador .modal-footer .btn-orange");
      await espera(1500);
      check("botão Salvar (primary-button) grava", (await js(`doadoresData.length`)) === 1);
      await js(`doadorNome.value=""; document.querySelectorAll(".modal.show").forEach(m=>bootstrap.Modal.getInstance(m)?.hide())`);
      await espera(500);
      await js(`dados.inserir("doador_novo",{nome:"Aaa Fictício"}).then(()=>loadDoadores())`);
      await espera(800);
      await clicar("#doadorTable thead th:nth-child(1)");
      const ordem = await js(`[...document.querySelectorAll("#doadorTable tbody tr td:first-child")].map(t=>t.textContent)`);
      check("ordenar pela coluna (argumentos texto/número)", ordem[0].startsWith("Aaa"), ordem.join(" | "));

      // Swal + clique em botão gerado pelo JS (data-click com id)
      await clicar(`#doadorTable button[title="Ver doações deste doador"]`);
      await espera(600);
      check("botão gerado pelo JS abre modal de doações", await js(`document.getElementById("modalDoacoesDoador").classList.contains("show")`));
      await js(`bootstrap.Modal.getInstance(modalDoacoesDoador).hide()`);
      await espera(500);
      await foto("1-doadores");

      // Exportações
      await clicar(`#doador-section .dropdown-toggle`);
      await espera(300);
      await clicar(`#doador-section .dropdown-menu a:nth-of-type(1)`);
      await js(`document.querySelectorAll("#doador-section .dropdown-item")[0].click()`);
      await espera(1500);
      await js(`document.querySelectorAll("#doador-section .dropdown-item")[1].click()`);
      await espera(2500);
      const csv = downloads.find((d) => d.nome.endsWith(".csv"));
      const pdf = downloads.find((d) => d.nome.endsWith(".pdf"));
      check("exportar CSV gera arquivo", csv && csv.estado === "completed" && fs.readFileSync(csv.destino, "utf8").includes("Épsilon"), JSON.stringify(downloads.map((d) => d.nome + ":" + d.estado)));
      check("exportar PDF gera arquivo válido", pdf && pdf.estado === "completed" && fs.readFileSync(pdf.destino).subarray(0, 4).toString() === "%PDF");
      check("URL da página não mudou com link '#'", (await js(`location.hash`)) === "");

      // Segurança
      const antes = await js(`currentUser && currentUser.email`);
      await js(`(()=>{const b=document.createElement("button");b.setAttribute("data-click","signOut()");b.id="x1";document.body.appendChild(b);})()`);
      await js(`(()=>{const b=document.createElement("button");b.setAttribute("data-click","eval('window.__pwn=1')");document.body.appendChild(b);b.click();})()`);
      await js(`(()=>{const b=document.createElement("button");b.setAttribute("data-click","showPage(alert(1))");document.body.appendChild(b);b.click();})()`);
      await js(`(()=>{const b=document.createElement("button");b.setAttribute("data-click","constructor.constructor('window.__pwn=2')()");document.body.appendChild(b);b.click();})()`);
      await espera(300);
      check("despachante bloqueia função fora da lista e argumento com código", (await js(`window.__pwn===undefined`)) && (await visivel("app-shell")));
      check("sessão intacta após tentativas", (await js(`currentUser && currentUser.email`)) === antes);
      const inlineBloqueado = await js(`new Promise(r=>{const d=document.createElement("div");d.innerHTML='<img src="x.png" onerror="window.__inline=1">';document.body.appendChild(d);setTimeout(()=>r(window.__inline===undefined),500)})`);
      check("CSP bloqueia JavaScript inline (onerror)", inlineBloqueado);
      const fetchExterno = await js(`fetch("https://example.com").then(()=>"passou",e=>"bloqueado")`);
      check("CSP bloqueia acesso à internet (fetch)", fetchExterno === "bloqueado");
      const evalBloqueado = await js(`(()=>{try{eval("1");return false}catch(e){return true}})()`);
      check("CSP bloqueia eval", evalBloqueado);
    } catch (e) {
      log.push("ERRO " + e.stack);
    }
    await espera(300);
    const violacoes = consoleRenderer.filter((c) => /Content Security Policy|Refused/i.test(c));
    log.push("", `Violações de CSP no console: ${violacoes.length} (esperado: só as provocadas pelos testes de segurança)`);
    violacoes.forEach((v) => log.push("  " + v.slice(0, 220)));
    log.push(`Pedidos de rede bloqueados no processo principal: ${avisosMain.filter((a) => a.includes("rede bloqueada")).length}`);
    avisosMain.forEach((a) => log.push("  " + a.slice(0, 200)));
    const erros = consoleRenderer.filter((c) => c.startsWith("[3"));
    log.push(`Erros no console: ${erros.length}`);
    erros.forEach((v) => log.push("  " + v.slice(0, 220)));
    fs.writeFileSync(path.join(saida, "log.txt"), log.join("\n"));
    app.quit();
  });
});
