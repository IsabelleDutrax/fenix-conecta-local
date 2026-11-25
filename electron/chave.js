// Gera e guarda a chave do banco, protegida pelo DPAPI do Windows (safeStorage, API assíncrona).
// O arquivo chave.bin só pode ser lido pelo mesmo usuário do Windows que o criou.
// A mesma chave é a "chave de recuperação" mostrada ao administrador para imprimir:
// com ela, o banco abre em outro computador ou após reinstalar o Windows.
// Compatibilidade: arquivos gravados com a API síncrona antiga (encryptString) são lidos
// por decryptStringAsync; quando o Electron pede (shouldReEncrypt), a chave é regravada.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { safeStorage } = require("electron");

const NOME_ARQUIVO = "chave.bin";

function arquivoChave(pasta) {
  return path.join(pasta, NOME_ARQUIVO);
}

async function exigirProtecao() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
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

async function gravar(arquivo, chave, flag) {
  const cifrado = await safeStorage.encryptStringAsync(chave);
  fs.writeFileSync(arquivo, cifrado, { flag });
}

// Devolve a chave ou null se o arquivo não existir ou não puder ser decifrado.
async function lerChave(pasta) {
  if (!existeChave(pasta)) return null;
  await exigirProtecao();
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      fs.readFileSync(arquivoChave(pasta)),
    );
    if (shouldReEncrypt && formatarChave(result) === result) {
      try {
        const tmp = arquivoChave(pasta) + ".novo";
        await gravar(tmp, result, "w");
        fs.renameSync(tmp, arquivoChave(pasta));
      } catch (e) {
        console.warn("[chave] não foi possível regravar a chave:", e.message);
      }
    }
    return result;
  } catch {
    return null;
  }
}

async function salvarChave(pasta, chave) {
  await exigirProtecao();
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = arquivoChave(pasta);
  // Guarda a versão anterior (ilegível) em vez de apagar.
  if (fs.existsSync(arquivo)) fs.renameSync(arquivo, `${arquivo}.anterior-${Date.now()}`);
  await gravar(arquivo, chave, "wx");
}

async function criarChave(pasta) {
  await exigirProtecao();
  const chave = formatarChave(crypto.randomBytes(32).toString("hex"));
  fs.mkdirSync(pasta, { recursive: true });
  await gravar(arquivoChave(pasta), chave, "wx");
  return chave;
}

module.exports = { formatarChave, existeChave, lerChave, salvarChave, criarChave };
