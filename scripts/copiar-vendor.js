// Copia as bibliotecas de terceiros de node_modules para vendor/ (uso offline, sem CDN).
// Uso: npm run vendor   (rodar após atualizar a versão de alguma biblioteca no package.json)
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const nm = (...p) => path.join(raiz, "node_modules", ...p);
const destino = path.join(raiz, "vendor");

// [origem em node_modules, destino em vendor/]
const ARQUIVOS = [
  [nm("bootstrap/dist/css/bootstrap.min.css"), "bootstrap/bootstrap.min.css"],
  [nm("bootstrap/dist/js/bootstrap.bundle.min.js"), "bootstrap/bootstrap.bundle.min.js"],
  [nm("bootstrap/LICENSE"), "bootstrap/LICENSE"],

  [nm("sweetalert2/dist/sweetalert2.all.min.js"), "sweetalert2/sweetalert2.all.min.js"],
  [nm("sweetalert2/LICENSE"), "sweetalert2/LICENSE"],

  [nm("choices.js/public/assets/styles/choices.min.css"), "choices/choices.min.css"],
  [nm("choices.js/public/assets/scripts/choices.min.js"), "choices/choices.min.js"],
  [nm("choices.js/LICENSE"), "choices/LICENSE"],

  [nm("jspdf/dist/jspdf.umd.min.js"), "jspdf/jspdf.umd.min.js"],
  [nm("jspdf/LICENSE"), "jspdf/LICENSE"],
  [nm("jspdf-autotable/dist/jspdf.plugin.autotable.min.js"), "jspdf/jspdf.plugin.autotable.min.js"],
  [nm("jspdf-autotable/LICENSE.txt"), "jspdf/LICENSE-autotable.txt"],

  // Ícones: só o estilo "regular rounded" (fi-rr-*), o único usado nas telas.
  [nm("@flaticon/flaticon-uicons/css/regular/rounded.css"), "uicons/css/regular/rounded.css"],
  [nm("@flaticon/flaticon-uicons/LICENSE"), "uicons/LICENSE"],

  // Fonte dos títulos (pesos 400 e 700).
  [nm("@fontsource/libre-baskerville/400.css"), "fonts/libre-baskerville/400.css"],
  [nm("@fontsource/libre-baskerville/700.css"), "fonts/libre-baskerville/700.css"],
  [nm("@fontsource/libre-baskerville/LICENSE"), "fonts/libre-baskerville/LICENSE"],
];

// Arquivos de fonte referenciados pelos CSS acima.
const pastaUicons = nm("@flaticon/flaticon-uicons/css");
for (const f of fs.readdirSync(pastaUicons)) {
  if (f.startsWith("uicons-regular-rounded-")) ARQUIVOS.push([path.join(pastaUicons, f), `uicons/css/${f}`]);
}
const pastaFonte = nm("@fontsource/libre-baskerville/files");
for (const f of fs.readdirSync(pastaFonte)) {
  if (/^libre-baskerville-latin(-ext)?-(400|700)-normal\.woff2?$/.test(f)) {
    ARQUIVOS.push([path.join(pastaFonte, f), `fonts/libre-baskerville/files/${f}`]);
  }
}

fs.rmSync(destino, { recursive: true, force: true });
for (const [origem, rel] of ARQUIVOS) {
  if (!fs.existsSync(origem)) throw new Error(`Não encontrado: ${origem} (rode npm install)`);
  const alvo = path.join(destino, rel);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  let conteudo = fs.readFileSync(origem);
  // Remove a referência ao .map (não é distribuído) para evitar aviso no console.
  if (/\.(js|css)$/.test(rel)) {
    conteudo = Buffer.from(conteudo.toString("utf8").replace(/\n?\/[/*][#@] sourceMappingURL=[^\n]*?(\*\/)?\s*$/, "\n"));
  }
  fs.writeFileSync(alvo, conteudo);
}

// Versões copiadas (para auditoria).
const pacotes = ["bootstrap", "sweetalert2", "choices.js", "jspdf", "jspdf-autotable", "@flaticon/flaticon-uicons", "@fontsource/libre-baskerville"];
const versoes = pacotes.map((p) => {
  const pkg = require(nm(p, "package.json"));
  return `| ${p} | ${pkg.version} | ${typeof pkg.license === "string" ? pkg.license : "ver LICENSE"} |`;
});
fs.writeFileSync(
  path.join(destino, "VERSOES.md"),
  `# Bibliotecas embutidas (gerado por scripts/copiar-vendor.js — não editar)\n\n| Pacote | Versão | Licença |\n|---|---|---|\n${versoes.join("\n")}\n\nÍcones: Uicons by Flaticon (https://www.flaticon.com/uicons) — uso gratuito exige crédito à Flaticon.\n`,
);

console.log(`vendor/: ${ARQUIVOS.length} arquivos copiados.`);
