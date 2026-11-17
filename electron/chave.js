// Gera e guarda a chave do banco, protegida pelo DPAPI do Windows (safeStorage).
// O arquivo chave.bin só pode ser lido pelo mesmo usuário do Windows que o criou.
// Fase 3 vai mostrar esta chave como "chave de recuperação" para imprimir.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { safeStorage } = require("electron");

function obterOuCriarChave(pastaUsuario) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção de chaves do Windows não está disponível neste computador.");
  }
  const arquivo = path.join(pastaUsuario, "chave.bin");

  if (fs.existsSync(arquivo)) {
    return safeStorage.decryptString(fs.readFileSync(arquivo));
  }

  // 32 bytes aleatórios em grupos legíveis (facilita digitar a chave impressa).
  const chave = crypto
    .randomBytes(32)
    .toString("hex")
    .toUpperCase()
    .match(/.{8}/g)
    .join("-");
  fs.mkdirSync(pastaUsuario, { recursive: true });
  fs.writeFileSync(arquivo, safeStorage.encryptString(chave), { flag: "wx" });
  return chave;
}

module.exports = { obterOuCriarChave };
