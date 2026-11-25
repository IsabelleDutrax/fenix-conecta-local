// Publica a versão atual no GitHub Releases, depois de "npm run dist".
// Uso: npm run publicar   (gera o instalador e chama este script)
//
// Por que não "electron-builder --publish always": na 1.0.0 ele abriu duas publicações ao
// mesmo tempo, uma falhou (422) e o latest.yml não subiu — sem ele não há atualização automática.
// Aqui tudo sobe numa única operação, com o login do GitHub CLI (gh auth login).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const raiz = path.join(__dirname, "..");
const pkg = require(path.join(raiz, "package.json"));
const { owner, repo } = pkg.build.publish[0];
const versao = pkg.version;
const tag = `v${versao}`;
const dist = path.join(raiz, "dist");
const exe = path.join(dist, `Fenix-Conecta-Setup-${versao}.exe`);
const blockmap = `${exe}.blockmap`;
const latest = path.join(dist, "latest.yml");

function falhar(msg) {
  console.error(`\nNÃO PUBLICADO: ${msg}`);
  process.exit(1);
}
const git = (...a) => execFileSync("git", a, { cwd: raiz, encoding: "utf8" }).trim();
const gh = (...a) => execFileSync("gh", a, { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// 1. Código salvo e enviado: a release aponta para um commit que existe no GitHub.
if (git("status", "--porcelain")) falhar("há alterações não salvas (git status).");
git("fetch", "-q", "origin");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) falhar("o commit atual não é o origin/main (faça push antes).");

// 2. Arquivos do instalador presentes e coerentes entre si.
for (const f of [exe, blockmap, latest]) if (!fs.existsSync(f)) falhar(`falta ${path.basename(f)} (rode npm run dist).`);
const yml = fs.readFileSync(latest, "utf8");
const sha512 = crypto.createHash("sha512").update(fs.readFileSync(exe)).digest("base64");
if (!yml.includes(`version: ${versao}`)) falhar("latest.yml é de outra versão.");
if (!yml.includes(sha512)) falhar("latest.yml não corresponde ao instalador (hash diferente). Rode npm run dist de novo.");

// 3. Versão ainda não publicada.
try {
  gh("release", "view", tag, "-R", `${owner}/${repo}`);
  falhar(`a release ${tag} já existe. Aumente "version" no package.json.`);
} catch (e) {
  if (e.status === undefined) throw e;
}

// 4. Publica tudo de uma vez.
const notas = `Fênix Conecta ${versao}.

**Instalar:** baixe \`Fenix-Conecta-Setup-${versao}.exe\` e abra. Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.

Programas já instalados se atualizam sozinhos (aviso "Atualização pronta" no menu). Os dados não são afetados.

Manual do usuário: botão **Ajuda (manual)** no programa.`;
gh(
  "release", "create", tag, exe, blockmap, latest,
  "-R", `${owner}/${repo}`,
  "--target", git("rev-parse", "HEAD"),
  "--title", `Fênix Conecta ${versao}`,
  "--notes", notas,
);
console.log(`Publicado: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
