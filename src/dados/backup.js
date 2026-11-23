// Cópias de segurança do banco cifrado. Não depende do Electron (testável com node --test).
//
// Como funciona:
// - O backup é uma cópia do arquivo do banco, que já é cifrado (SQLCipher v4).
//   Nunca existe uma versão legível dos dados em disco.
// - A cópia é conferida (chave + integridade) numa pasta temporária ANTES de ir para o destino.
// - O destino só recebe o arquivo completo (grava como .parcial e renomeia no fim).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { abrirCifrado, VERSAO_ESQUEMA } = require("./banco");

const EXTENSAO = ".fenixbak";
const PADRAO_NOME = /^fenix-backup-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.fenixbak$/;
const DIA_MS = 24 * 60 * 60 * 1000;

function erro(mensagem, code, causa) {
  const e = new Error(mensagem);
  e.code = code;
  if (causa) e.cause = causa;
  return e;
}

const dois = (n) => String(n).padStart(2, "0");

// fenix-backup-AAAA-MM-DD_HHMMSS.fenixbak (hora local do computador)
function nomeBackup(data = new Date()) {
  return (
    `fenix-backup-${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}_` +
    `${dois(data.getHours())}${dois(data.getMinutes())}${dois(data.getSeconds())}${EXTENSAO}`
  );
}

function dataDoNome(nome) {
  const m = PADRAO_NOME.exec(nome);
  if (!m) return null;
  const [, a, mes, d, h, mi, s] = m.map(Number);
  return new Date(a, mes - 1, d, h, mi, s);
}

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fenix-bkp-"));
}

function contar(db, tabela) {
  const existe = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tabela);
  return existe ? db.prepare(`SELECT count(*) FROM ${tabela}`).pluck().get() : 0;
}

/**
 * Confere uma cópia (já em pasta temporária): chave, integridade e versão.
 * Deixa o arquivo em modo de diário DELETE (um único arquivo, sem -wal/-shm).
 */
function conferirCopia(arquivoTemp, chave) {
  const db = abrirCifrado(arquivoTemp, chave, { fileMustExist: true });
  try {
    db.pragma("journal_mode = DELETE");
    const integridade = db.pragma("quick_check", { simple: true });
    if (integridade !== "ok") throw erro("Arquivo de backup danificado.", "BACKUP_DANIFICADO");
    const temMigracoes = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get();
    if (!temMigracoes) throw erro("O arquivo não é um backup do Fênix Conecta.", "BACKUP_INVALIDO");
    const versao = db.prepare("SELECT coalesce(max(versao),0) FROM schema_migrations").pluck().get();
    return {
      versao,
      contagens: {
        doadores: contar(db, "doador_novo"),
        doacoes: contar(db, "doacao_nova"),
        interacoes: contar(db, "interacao_nova"),
        usuarios: contar(db, "usuario"),
      },
    };
  } finally {
    db.close();
  }
}

function hashArquivo(arquivo) {
  return crypto.createHash("sha256").update(fs.readFileSync(arquivo)).digest("hex");
}

// Copia para o destino de forma atômica (.parcial + rename) e confere o conteúdo.
function copiarAtomico(origem, destino) {
  const parcial = destino + ".parcial";
  fs.copyFileSync(origem, parcial);
  if (hashArquivo(parcial) !== hashArquivo(origem)) {
    fs.rmSync(parcial, { force: true });
    throw erro("A cópia no destino ficou diferente da original.", "BACKUP_COPIA");
  }
  fs.renameSync(parcial, destino);
}

/**
 * Faz um backup do banco aberto `db` (arquivo `arquivoBanco`) na pasta `pastaDestino`.
 * @returns {{arquivo, nome, data, tamanho, contagens}}
 */
function fazerBackup(db, arquivoBanco, chave, pastaDestino, agora = new Date()) {
  if (!pastaDestino) throw erro("Pasta de backup não definida.", "SEM_PASTA");
  try {
    fs.mkdirSync(pastaDestino, { recursive: true });
  } catch (e) {
    throw erro(`Não foi possível acessar a pasta de backup: ${pastaDestino}`, "PASTA_INACESSIVEL", e);
  }

  // Grava no arquivo principal tudo o que está no diário WAL.
  db.pragma("wal_checkpoint(TRUNCATE)");

  const tmp = pastaTemporaria();
  try {
    const copia = path.join(tmp, "copia.db");
    // better-sqlite3 é síncrono: nenhuma escrita acontece durante a cópia.
    fs.copyFileSync(arquivoBanco, copia);
    const { contagens } = conferirCopia(copia, chave);

    let nome = nomeBackup(agora);
    let destino = path.join(pastaDestino, nome);
    for (let i = 1; fs.existsSync(destino); i++) {
      nome = nomeBackup(new Date(agora.getTime() + i * 1000));
      destino = path.join(pastaDestino, nome);
    }
    copiarAtomico(copia, destino);
    return { arquivo: destino, nome, data: agora.toISOString(), tamanho: fs.statSync(destino).size, contagens };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Lista os backups da pasta (mais recente primeiro). Só arquivos com o nome padrão.
function listarBackups(pasta) {
  if (!pasta || !fs.existsSync(pasta)) return [];
  return fs
    .readdirSync(pasta)
    .map((nome) => ({ nome, data: dataDoNome(nome) }))
    .filter((b) => b.data)
    .map((b) => {
      const arquivo = path.join(pasta, b.nome);
      return { nome: b.nome, arquivo, data: b.data.toISOString(), tamanho: fs.statSync(arquivo).size };
    })
    .sort((a, b) => (a.data < b.data ? 1 : -1));
}

// Apaga backups com mais de `dias` dias. Sempre mantém o mais recente.
function limparBackupsAntigos(pasta, dias = 30, agora = new Date()) {
  const lista = listarBackups(pasta);
  const limite = agora.getTime() - dias * DIA_MS;
  const removidos = [];
  lista.slice(1).forEach((b) => {
    if (new Date(b.data).getTime() < limite) {
      fs.rmSync(b.arquivo, { force: true });
      removidos.push(b.nome);
    }
  });
  return removidos;
}

/**
 * Prepara a restauração de um arquivo de backup: copia para uma pasta temporária e confere
 * com cada chave candidata (a deste computador primeiro). O arquivo original não é alterado.
 * @returns {{arquivoTemp, chave, versao, contagens, limpar()}}
 */
function prepararRestauracao(arquivoOrigem, chavesCandidatas) {
  if (!fs.existsSync(arquivoOrigem)) throw erro("Arquivo não encontrado.", "NAO_ENCONTRADO");
  const tmp = pastaTemporaria();
  const limpar = () => fs.rmSync(tmp, { recursive: true, force: true });
  try {
    const arquivoTemp = path.join(tmp, "restaurar.db");
    fs.copyFileSync(arquivoOrigem, arquivoTemp);
    let ultimoErro = null;
    for (const chave of chavesCandidatas.filter(Boolean)) {
      try {
        const info = conferirCopia(arquivoTemp, chave);
        if (info.versao > VERSAO_ESQUEMA) {
          throw erro(
            "Este backup foi feito por uma versão mais nova do programa. Atualize o programa antes de restaurar.",
            "VERSAO_NOVA",
          );
        }
        return { arquivoTemp, chave, ...info, limpar };
      } catch (e) {
        if (e.code !== "CHAVE_INVALIDA") throw e;
        ultimoErro = e;
      }
    }
    throw erro(
      "Este backup usa outra chave. Informe a chave de recuperação do computador onde ele foi feito.",
      "CHAVE_BACKUP",
      ultimoErro,
    );
  } catch (e) {
    limpar();
    throw e;
  }
}

/**
 * Troca o arquivo do banco pelo backup preparado. O banco atual precisa estar FECHADO.
 * O banco anterior é mantido como fenix.db.antes-restauracao-<data> até a próxima restauração.
 */
function substituirBanco(arquivoBanco, arquivoTemp, agora = new Date()) {
  const pasta = path.dirname(arquivoBanco);
  fs.mkdirSync(pasta, { recursive: true });
  for (const f of fs.readdirSync(pasta)) {
    if (f.startsWith(path.basename(arquivoBanco) + ".antes-restauracao-")) fs.rmSync(path.join(pasta, f), { force: true });
  }
  if (fs.existsSync(arquivoBanco)) {
    const carimbo = agora.toISOString().replace(/[:.]/g, "-");
    fs.renameSync(arquivoBanco, `${arquivoBanco}.antes-restauracao-${carimbo}`);
  }
  for (const sufixo of ["-wal", "-shm", "-journal"]) fs.rmSync(arquivoBanco + sufixo, { force: true });
  copiarAtomico(arquivoTemp, arquivoBanco);
}

module.exports = {
  EXTENSAO,
  nomeBackup,
  dataDoNome,
  fazerBackup,
  listarBackups,
  limparBackupsAntigos,
  prepararRestauracao,
  substituirBanco,
};
