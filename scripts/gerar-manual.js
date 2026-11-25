// Gera o manual do usuário: captura as telas (dados fictícios) e converte o HTML em PDF.
// Uso: npm run manual                 (capturas + PDF)
//      npm run manual -- --so-pdf     (só refaz o PDF, sem novas capturas)
// Saídas: docs/manual/img/*.png e docs/Manual-Fenix-Conecta.pdf
// Segurança: as capturas usam pastas temporárias; nada vai para %APPDATA%\FenixConecta nem OneDrive.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electron = require("electron");

const raiz = path.join(__dirname, "..");
const pastaImg = path.join(raiz, "docs", "manual", "img");
const html = path.join(raiz, "docs", "manual", "manual.html");
const pdf = path.join(raiz, "docs", "Manual-Fenix-Conecta.pdf");
const soPdf = process.argv.includes("--so-pdf");

function rodar(script, args, env = {}) {
  const r = spawnSync(electron, [script, ...args], {
    env: { ...process.env, ELECTRON_ENABLE_SECURITY_WARNINGS: "false", ...env },
    stdio: ["ignore", "inherit", "inherit"],
    timeout: 5 * 60 * 1000,
    windowsHide: true,
  });
  if (r.status !== 0 && r.status !== null) console.warn(`aviso: ${path.basename(script)} terminou com código ${r.status}`);
}

if (!soPdf) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "fenix-manual-"));
  const env = {
    FENIX_PASTA_DADOS: path.join(base, "dados"),
    FENIX_PASTA_BACKUP: path.join(base, "onedrive", "Backup Fenix Conecta"),
    FENIX_TESTE_DIALOGO: path.join(base, "pendrive"),
    FENIX_MANUAL_IMG: pastaImg,
    FENIX_MANUAL_LOG: base,
  };
  fs.mkdirSync(env.FENIX_TESTE_DIALOGO, { recursive: true });
  const captura = path.join(__dirname, "manual", "capturar-telas.js");
  rodar(captura, [raiz], { ...env, ETAPA: "A" });
  // Simula Windows reinstalado para capturar a tela de recuperação.
  fs.renameSync(path.join(env.FENIX_PASTA_DADOS, "chave.bin"), path.join(base, "chave.removida"));
  rodar(captura, [raiz], { ...env, ETAPA: "B" });
  for (const f of ["captura-A.log", "captura-B.log"]) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) process.stdout.write(fs.readFileSync(p, "utf8"));
  }
  fs.rmSync(base, { recursive: true, force: true });
}

const versao = require(path.join(raiz, "package.json")).version;
rodar(path.join(__dirname, "manual", "gerar-pdf.js"), [html, pdf, `Fênix Conecta ${versao} — Manual do usuário — MAN-FC-001`]);
