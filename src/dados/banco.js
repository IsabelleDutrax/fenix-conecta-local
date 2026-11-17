// Abre o banco SQLite criptografado e aplica as migrações pendentes.
// Este módulo NÃO depende do Electron: pode ser usado em testes e, no futuro,
// por outra interface (ex.: integração de IA via MCP) sem passar pelas telas.
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3-multiple-ciphers");
const MIGRACOES = require("./migracoes");

/**
 * Abre (ou cria) o banco cifrado.
 * Cifra: esquema SQLCipher v4 (AES-256), compatível com ferramentas SQLCipher
 * para recuperação com a chave impressa.
 * @param {string} arquivo caminho do .db
 * @param {string} chave segredo (texto). Nunca vazio.
 */
function abrirBanco(arquivo, chave) {
  if (!chave || typeof chave !== "string") {
    throw new Error("Chave do banco ausente.");
  }
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });

  const db = new Database(arquivo);
  try {
    db.pragma(`cipher='sqlcipher'`);
    db.pragma(`legacy=4`);
    db.pragma(`key='${chave.replace(/'/g, "''")}'`);
    // Primeira leitura real: falha aqui se a chave estiver errada.
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (erro) {
    db.close();
    const e = new Error("Não foi possível abrir o banco: chave incorreta ou arquivo danificado.");
    e.cause = erro;
    e.code = "CHAVE_INVALIDA";
    throw e;
  }

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  aplicarMigracoes(db);
  return db;
}

function aplicarMigracoes(db, migracoes = MIGRACOES) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    versao     INTEGER PRIMARY KEY,
    nome       TEXT NOT NULL,
    aplicada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);

  const aplicadas = new Set(
    db.prepare("SELECT versao FROM schema_migrations").pluck().all(),
  );
  const registrar = db.prepare("INSERT INTO schema_migrations (versao, nome) VALUES (?, ?)");

  [...migracoes]
    .sort((a, b) => a.versao - b.versao)
    .filter((m) => !aplicadas.has(m.versao))
    .forEach((m) => {
      db.transaction(() => {
        db.exec(m.sql);
        registrar.run(m.versao, m.nome);
        db.pragma(`user_version = ${m.versao}`);
      })();
    });

  return versaoAtual(db);
}

function versaoAtual(db) {
  return db.prepare("SELECT coalesce(max(versao), 0) FROM schema_migrations").pluck().get();
}

module.exports = { abrirBanco, aplicarMigracoes, versaoAtual };
