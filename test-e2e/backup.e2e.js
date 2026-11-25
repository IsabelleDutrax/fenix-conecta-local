// Teste de ponta a ponta: backup diário, pendrive, retenção, Excel, restauração (inclusive de outro PC). Executado por scripts/e2e.js (npm run test:e2e).
// Etapas: A e B. Usa FENIX_PASTA_BACKUP e FENIX_TESTE_DIALOGO.
// Dados 100% fictícios; pastas isoladas definidas pelo executor.
const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");
const raiz = process.argv[process.argv.length - 1];
const saida = process.env.FENIX_E2E_SAIDA || path.join(__dirname, "saida-backup");
fs.mkdirSync(saida, { recursive: true });
require(path.join(raiz, "electron", "main.js"));
const { abrirBanco } = require(path.join(raiz, "src", "dados", "banco"));
const { criarRepositorio } = require(path.join(raiz, "src", "dados", "repositorio"));
const { criarUsuarios } = require(path.join(raiz, "src", "dados", "usuarios"));
const bkp = require(path.join(raiz, "src", "dados", "backup"));
const { unzipSync, strFromU8 } = require(path.join(raiz, "node_modules", "fflate"));

const etapa = process.env.ETAPA;
const PASTA_BKP = process.env.FENIX_PASTA_BACKUP;
const PASTA_DLG = process.env.FENIX_TESTE_DIALOGO;
const CHAVE_OUTRO_PC = "12345678-9ABCDEF0-12345678-9ABCDEF0-12345678-9ABCDEF0-12345678-9ABCDEF0";
const log = [];
const consoleR = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", (_ev, ...a) => consoleR.push(JSON.stringify(a.slice(0, 2))));
  win.webContents.once("did-finish-load", async () => {
    const js = (c) => win.webContents.executeJavaScript(c);
    const check = (n, c, i) => log.push(`${c ? "OK  " : "FALHA"} ${n}${i ? " :: " + i : ""}`);
    const visivel = (id) => js(`!document.getElementById("${id}").classList.contains("hidden")`);
    const foto = async (n) => fs.writeFileSync(path.join(saida, n + ".png"), (await win.webContents.capturePage()).toPNG());
    const swalTitulo = () => js(`Swal.isVisible() ? Swal.getTitle().textContent : ""`);
    const esperarSwal = async (texto, ms = 4000) => {
      for (let t = 0; t < ms; t += 200) {
        if ((await swalTitulo()).includes(texto)) return true;
        await espera(200);
      }
      return false;
    };
    const entrar = async (email, senha) => {
      await js(`email.value=${JSON.stringify(email)}; password.value=${JSON.stringify(senha)}; signIn()`);
      await espera(1800);
    };
    const backups = () => bkp.listarBackups(PASTA_BKP);
    try {
      await espera(1200);
      if (etapa === "A") {
        await js(`sessao.primeiroAcesso({nome:"Admin Fictício",email:"admin@exemplo.invalid",senha:"SenhaAdmin#2026"})`);
        check("primeiro acesso já gera o 1º backup automático", backups().length === 1, backups().map((b) => b.nome).join());
        await js(`usuarios.criar({nome:"Comum Fictício",email:"comum@exemplo.invalid",senha:"SenhaComum#2026",nivel_acesso:1})`);
        await js(`sessao.sair()`);
        await js(`iniciarSistema()`);
        await espera(800);

        await entrar("admin@exemplo.invalid", "SenhaAdmin#2026");
        check("login no mesmo dia não repete o backup automático", backups().length === 1);
        const rodape = await js(`statusBackup.textContent.trim()`);
        check("rodapé mostra 'Último backup'", rodape.startsWith("Último backup:") && (await js(`statusBackup.classList.contains("status-ok")`)), rodape);

        // Lembrete semanal de pendrive
        check("lembrete de pendrive aparece para o admin", await esperarSwal("Hora da cópia em pendrive"));
        await foto("A1-lembrete-pendrive");
        await js(`Swal.clickConfirm()`);
        check("instrução de conectar o pendrive", await esperarSwal("Cópia em pendrive"));
        await js(`Swal.clickConfirm()`);
        check("cópia em pendrive concluída", await esperarSwal("Cópia feita"));
        const noPendrive = fs.readdirSync(PASTA_DLG).filter((f) => f.endsWith(".fenixbak"));
        check("arquivo de backup no 'pendrive'", noPendrive.length === 1, noPendrive.join());
        check("avisa quando a pasta é do próprio disco (não é pendrive)", (await js(`Swal.getHtmlContainer().textContent`)).includes("disco do próprio computador"));
        await js(`Swal.clickConfirm()`);
        await espera(500);
        const st = await js(`backup.status().then(r=>r.data)`);
        check("lembrete não repete após a cópia", st.lembrarPendrive === false && !!st.ultimoPendrive);

        // Dados + backup manual + retenção
        await js(`dados.inserir("doador_novo",{nome:"Doador Fictício X", cpf_cnpj:"000.000.000-01"}).then(()=>loadData())`);
        await espera(600);
        const velho = new Date(Date.now() - 40 * 86400000);
        fs.writeFileSync(path.join(PASTA_BKP, bkp.nomeBackup(velho)), "antigo");
        fs.writeFileSync(path.join(PASTA_BKP, "planilha-do-usuario.xlsx"), "não apagar");
        await js(`showPage("backup")`);
        await espera(800);
        check("página Backup abre para admin", await visivel("backup-section"));
        await js(`document.querySelector('#backup-section [data-click="fazerBackupAgora()"]').click()`);
        await espera(2500);
        const lista = backups();
        check("backup manual criado e antigo (40 dias) removido", lista.length === 2 && lista.every((b) => Date.now() - new Date(b.data) < 86400000), lista.map((b) => b.nome).join());
        check("retenção não apaga arquivos de outros tipos", fs.existsSync(path.join(PASTA_BKP, "planilha-do-usuario.xlsx")));
        check("lista da tela mostra os backups", (await js(`document.querySelectorAll("#backupTable tbody tr").length`)) === 2);
        const bruto = fs.readFileSync(lista[0].arquivo);
        check("backup cifrado (sem nome/CPF em claro)", !bruto.includes(Buffer.from("Doador Fictício X")) && !bruto.includes(Buffer.from("000.000.000-01")) && !bruto.includes(Buffer.from("SQLite format 3")));
        await foto("A2-pagina-backup");

        // Pasta inválida não muda a pasta nem marca erro no rodapé
        const arquivoNoLugar = path.join(PASTA_DLG, "nao-e-pasta.txt");
        fs.writeFileSync(arquivoNoLugar, "x");
        process.env.FENIX_TESTE_DIALOGO = path.join(arquivoNoLugar, "sub");
        const rPasta = await js(`backup.escolherPasta()`);
        process.env.FENIX_TESTE_DIALOGO = PASTA_DLG;
        const st2 = await js(`backup.status().then(r=>r.data)`);
        check("pasta inválida é recusada sem afetar o backup", rPasta.error && path.resolve(st2.pasta) === path.resolve(PASTA_BKP) && !st2.erro, rPasta.error && rPasta.error.message);

        // Excel
        await js(`showPage("dashboard")`);
        await espera(400);
        await js(`document.querySelector('[data-click="exportarExcel()"]').click()`);
        check("aviso LGPD antes de exportar", await esperarSwal("Exportar Excel de consulta"));
        check("aviso cita dados pessoais e cópia de consulta", /dados pessoais[\s\S]*cópia para consulta/.test(await js(`Swal.getHtmlContainer().textContent`)));
        await foto("A3-aviso-lgpd");
        await js(`Swal.clickConfirm()`);
        check("planilha gerada", await esperarSwal("Planilha gerada"));
        await js(`Swal.clickConfirm()`);
        const xlsx = fs.readdirSync(PASTA_DLG).find((f) => f.endsWith(".xlsx"));
        const hoje = new Date();
        const esperado = `Fenix Conecta - consulta - ${String(hoje.getDate()).padStart(2, "0")}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${hoje.getFullYear()}.xlsx`;
        check("nome do Excel com 'consulta' e data", xlsx === esperado, xlsx);
        const zip = unzipSync(fs.readFileSync(path.join(PASTA_DLG, xlsx)));
        const conteudo = Object.entries(zip).filter(([n]) => n.startsWith("xl/")).map(([, v]) => strFromU8(v)).join("\n");
        check("Excel tem LEIA-ME LGPD e os dados", conteudo.includes("DADOS PESSOAIS (LGPD)") && conteudo.includes("Doador Fictício X") && conteudo.includes("Admin Fictício"));

        // Restaurar da lista (backup com X), depois de gravar Y
        await js(`dados.inserir("doador_novo",{nome:"Doador Fictício Y (depois do backup)"}).then(()=>loadData())`);
        await espera(600);
        await js(`showPage("backup")`);
        await espera(800);
        await js(`document.querySelector('#backupTable tbody tr:first-child [data-click^="restaurarDaLista"]').click()`);
        check("restauração pede confirmação com resumo", await esperarSwal("Restaurar backup?"));
        const resumo = await js(`Swal.getHtmlContainer().textContent`);
        check("resumo mostra contagens do backup", /1 doadores,\s+0 doações,\s+0 interações e 2 usuários/.test(resumo), resumo.slice(0, 160));
        await js(`swalSenhaRestaurar.value="senha-errada"; Swal.clickConfirm()`);
        await espera(1500);
        check("senha errada não restaura", (await js(`dados.listar("doador_novo").then(r=>r.data.length)`)) === 2);
        await js(`Swal.close()`);
        await espera(400);
        await js(`document.querySelector('#backupTable tbody tr:first-child [data-click^="restaurarDaLista"]').click()`);
        await esperarSwal("Restaurar backup?");
        await js(`swalSenhaRestaurar.value="SenhaAdmin#2026"; Swal.clickConfirm()`);
        check("backup restaurado", await esperarSwal("Backup restaurado", 8000));
        await js(`Swal.clickConfirm()`);
        await espera(1200);
        check("após restaurar volta ao login", await visivel("auth-section"));
        await entrar("admin@exemplo.invalid", "SenhaAdmin#2026");
        const nomes = await js(`doadoresData.map(d=>d.nome)`);
        check("dados voltaram ao ponto do backup (X sem Y)", JSON.stringify(nomes) === JSON.stringify(["Doador Fictício X"]), JSON.stringify(nomes));
        check("cópia de segurança feita antes de restaurar", backups().length === 3);

        // Usuário comum
        await js(`signOut()`);
        await espera(800);
        await entrar("comum@exemplo.invalid", "SenhaComum#2026");
        check("comum: sem menu Backup e sem botão Excel", (await js(`[...document.querySelectorAll('.somente-admin')].every(e=>e.classList.contains('hidden'))`)));
        check("comum: vê o status do backup no rodapé", (await js(`statusBackup.textContent`)).includes("Último backup"));
        const negados = await js(`Promise.all([backup.listar(), backup.exportarExcel(), backup.analisarDaLista("x"), backup.copiarPendrive()]).then(rs=>rs.map(r=>r.error && r.error.code))`);
        check("comum: API de restaurar/Excel/pendrive negada", negados.every((c) => c === "SEM_PERMISSAO"), negados.join());
        check("comum: sem lembrete de pendrive", !(await swalTitulo()).includes("pendrive"));
        await js(`signOut()`);
        await espera(800);

        // Restaurar backup de OUTRO computador (outra chave)
        const outro = path.join(saida, "outro-pc");
        fs.rmSync(outro, { recursive: true, force: true });
        const outroDb = abrirBanco(path.join(outro, "fenix.db"), CHAVE_OUTRO_PC);
        criarUsuarios(outroDb).criarPrimeiroAdmin({ nome: "Admin Outro PC", email: "outro@exemplo.invalid", senha: "SenhaOutro#2026" });
        criarRepositorio(outroDb).inserir("doador_novo", { nome: "Doador do Outro PC" });
        const rOutro = bkp.fazerBackup(outroDb, path.join(outro, "fenix.db"), CHAVE_OUTRO_PC, path.join(outro, "pendrive"));
        outroDb.close();
        process.env.FENIX_TESTE_ARQUIVO = rOutro.arquivo;

        await entrar("admin@exemplo.invalid", "SenhaAdmin#2026");
        await js(`Swal.isVisible() && Swal.close()`);
        await js(`showPage("backup")`);
        await espera(600);
        await js(`document.querySelector('[data-click="restaurarDeArquivo()"]').click()`);
        check("backup de outro PC pede a chave de recuperação dele", await esperarSwal("Backup de outro computador"));
        await js(`swalChaveBackup.value="00000000-00000000-00000000-00000000-00000000-00000000-00000000-00000000"; Swal.clickConfirm()`);
        await espera(1200);
        check("chave errada recusada e pede de novo", await esperarSwal("Backup de outro computador"));
        await js(`swalChaveBackup.value=${JSON.stringify(CHAVE_OUTRO_PC.toLowerCase())}; Swal.clickConfirm()`);
        check("chave certa mostra resumo", await esperarSwal("Restaurar backup?"));
        check("avisa que a chave passa a ser a do outro PC", (await js(`Swal.getHtmlContainer().textContent`)).includes("outro computador"));
        await js(`swalSenhaRestaurar.value="SenhaAdmin#2026"; Swal.clickConfirm()`);
        check("backup do outro PC restaurado", await esperarSwal("Backup restaurado", 8000));
        await js(`Swal.clickConfirm()`);
        await espera(1000);
        await entrar("outro@exemplo.invalid", "SenhaOutro#2026");
        check("entra com usuário do outro PC e vê os dados dele", (await js(`doadoresData.map(d=>d.nome).join()`)) === "Doador do Outro PC");
        fs.writeFileSync(path.join(saida, "chave-outro-pc.txt"), CHAVE_OUTRO_PC);
      }

      if (etapa === "B") {
        check("reabre sem pedir chave (chave do outro PC guardada neste Windows)", await visivel("auth-section"));
        const antes = backups().length;
        await entrar("outro@exemplo.invalid", "SenhaOutro#2026");
        check("dados restaurados persistem", (await js(`doadoresData.map(d=>d.nome).join()`)) === "Doador do Outro PC");
        await espera(800);
        const depois = backups().length;
        check("backup automático do dia já registrado (não duplica)", depois === antes, `${antes} -> ${depois}`);
        await js(`Swal.isVisible() && Swal.close()`);
        await espera(400);
        await foto("B1-dashboard");
      }
    } catch (e) {
      log.push("ERRO " + e.stack);
    }
    const erros = consoleR.filter((c) => c.startsWith("[3"));
    log.push("", `Erros no console: ${erros.length}`);
    erros.forEach((v) => log.push("  " + v.slice(0, 220)));
    fs.writeFileSync(path.join(saida, `log-${etapa}.txt`), log.join("\n") + "\n");
    app.quit();
  });
});
