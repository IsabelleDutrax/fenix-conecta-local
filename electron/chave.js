// Gera e guarda a chave do banco, protegida pelo DPAPI do Windows (safeStorage).
// O arquivo chave.bin só pode ser lido pelo mesmo usuário do Windows que o criou.
// A mesma chave é a "chave de recuperação" mostrada ao administrador para imprimir:
// com ela, o banco abre em outro computador ou após reinstalar o Windows.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { safeStorage } = require("electron");

const NOME_ARQUIVO = "chave.bin";

function arquivoChave(pasta) {
  return path.join(pasta, NOME_ARQUIVO);
}

function exigirProtecao() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção de chaves do Windows não está disponível neste computador.");
  }
}

// Formato: 8 grupos de 8 caracteres hexadecimais (32 bytes), ex.: 1A2B3C4D-....
function formatarChave(entrada) {
  const hex = String(entrada || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (hex.length !== 64) return null;
  return hex.match(/.{8}/g).join("-");
}

function existeChave(pasta) {
  return fs.existsSync(arquivoChave(pasta));
}

// Devolve a chave ou null se o arquivo não existir ou não puder ser decifrado.
function lerChave(pasta) {
  if (!existeChave(pasta)) return null;
  exigirProtecao();
  try {
    return safeStorage.decryptString(fs.readFileSync(arquivoChave(pasta)));
  } catch {
    return null;
  }
}

function salvarChave(pasta, chave) {
  exigirProtecao();
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = arquivoChave(pasta);
  // Guarda a versão anterior (ilegível) em vez de apagar.
  if (fs.existsSync(arquivo)) fs.renameSync(arquivo, `${arquivo}.anterior-${Date.now()}`);
  fs.writeFileSync(arquivo, safeStorage.encryptString(chave), { flag: "wx" });
}

function criarChave(pasta) {
  const chave = formatarChave(crypto.randomBytes(32).toString("hex"));
  exigirProtecao();
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(arquivoChave(pasta), safeStorage.encryptString(chave), { flag: "wx" });
  return chave;
}

module.exports = { formatarChave, existeChave, lerChave, salvarChave, criarChave };
