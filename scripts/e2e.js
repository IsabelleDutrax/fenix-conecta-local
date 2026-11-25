// Executa os testes de ponta a ponta (test-e2e/*.e2e.js) no programa real (Electron).
// Uso: npm run test:e2e            (todos)
//      npm run test:e2e -- backup  (só os cenários cujo nome contém "backup")
//      npm run test:e2e -- --manter (não apaga as pastas temporárias, para ver capturas e logs)
//
// Segurança: cada cenário usa pastas temporárias próprias para dados, backups e "pendrive".
// Nada é gravado em %APPDATA%\FenixConecta nem no OneDrive.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electron = require("electron"); // caminho do executável

const raiz = path.join(__dirname, "..");
const pastaTestes = path.join(raiz, "test-e2e");
const args = process.argv.slice(2);
const manter = args.includes("--manter");
const filtro = args.find((a) => !a.startsWith("--"));

const CENARIOS = [
  { nome: "crud", arquivo: "crud.e2e.js", etapas: ["1", "2"] },
  {
    nome: "login",
    arquivo: "login.e2e.js",
    etapas: ["A", "B", "C"],
    // Simula Windows reinstalado: a chave guardada some antes da etapa C.
    antes: { C: (p) => fs.renameSync(path.join(p.dados, "chave.bin"), path.join(p.base, "chave.bin.removida")) },
  },
  { nome: "exclusao", arquivo: "exclusao.e2e.js", etapas: ["unica"] },
  { nome: "offline", arquivo: "offline.e2e.js", etapas: ["unica"] },
  { nome: "backup", arquivo: "backup.e2e.js", etapas: ["A", "B"], dialogo: true },
];

function contar(texto) {
  const linhas = texto.split(/\r?\n/);
  return {
    ok: linhas.filter((l) => l.startsWith("OK")).length,
    falhas: linhas.filter((l) => l.startsWith("FALHA") || l.startsWith("ERRO")),
  };
}

let totalOk = 0;
const totalFalhas = [];
const inicio = Date.now();

for (const c of CENARIOS.filter((c) => !filtro || c.nome.includes(filtro))) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `fenix-e2e-${c.nome}-`));
  const p = {
    base,
    dados: path.join(base, "dados"),
    backup: path.join(base, "onedrive", "Backup Fenix Conecta"),
    dialogo: path.join(base, "pendrive"),
    saida: path.join(base, "saida"),
  };
  fs.mkdirSync(p.dialogo, { recursive: true });
  fs.mkdirSync(p.saida, { recursive: true });

  for (const etapa of c.etapas) {
    if (c.antes && c.antes[etapa]) c.antes[etapa](p);
    const env = {
      ...process.env,
      ETAPA: etapa,
      FENIX_PASTA_DADOS: p.dados,
      FENIX_PASTA_BACKUP: p.backup,
      FENIX_E2E_SAIDA: p.saida,
      ELECTRON_ENABLE_SECURITY_WARNINGS: "false",
    };
    if (c.dialogo) env.FENIX_TESTE_DIALOGO = p.dialogo;
    else delete env.FENIX_TESTE_DIALOGO;
    const r = spawnSync(electron, [path.join(pastaTestes, c.arquivo), raiz], {
      env,
      timeout: 4 * 60 * 1000,
      stdio: "ignore",
      windowsHide: true,
    });
    if (r.error) totalFalhas.push(`${c.nome}/${etapa}: ${r.error.message}`);
  }

  let ok = 0;
  const falhas = [];
  for (const f of fs.readdirSync(p.saida).filter((f) => /^log.*\.txt$/.test(f))) {
    const r = contar(fs.readFileSync(path.join(p.saida, f), "utf8"));
    ok += r.ok;
    falhas.push(...r.falhas.map((l) => `${c.nome}/${f}: ${l}`));
  }
  if (ok === 0 && falhas.length === 0) falhas.push(`${c.nome}: nenhum resultado (o teste não rodou)`);
  totalOk += ok;
  totalFalhas.push(...falhas);
  console.log(`${falhas.length ? "FALHA" : "OK   "} ${c.nome.padEnd(9)} ${ok} verificações${falhas.length ? `, ${falhas.length} falha(s)` : ""}`);
  if (manter) console.log(`      pasta: ${base}`);
  else fs.rmSync(base, { recursive: true, force: true });
}

console.log(`\nTotal: ${totalOk} verificações OK, ${totalFalhas.length} falha(s) em ${Math.round((Date.now() - inicio) / 1000)} s.`);
totalFalhas.forEach((f) => console.log("  " + f));
process.exit(totalFalhas.length ? 1 : 0);
