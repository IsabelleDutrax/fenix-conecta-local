// Migrações versionadas do banco local.
// Regra: nunca altere uma migração já publicada. Para mudar o esquema, adicione uma nova
// entrada no fim da lista com a próxima versão.
module.exports = [
  {
    versao: 1,
    nome: "tabelas iniciais: doador_novo, doacao_nova, interacao_nova",
    sql: `
      CREATE TABLE doador_novo (
        id_doador   INTEGER PRIMARY KEY AUTOINCREMENT,
        nome        TEXT    NOT NULL CHECK (length(trim(nome)) > 0),
        email       TEXT,
        telefone    TEXT,
        cpf_cnpj    TEXT,
        endereco    TEXT,
        criado_em   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        alterado_em TEXT
      );

      CREATE TABLE doacao_nova (
        id_doacao       INTEGER PRIMARY KEY AUTOINCREMENT,
        id_doador       INTEGER NOT NULL REFERENCES doador_novo(id_doador) ON DELETE RESTRICT,
        valor           REAL    NOT NULL CHECK (valor > 0),
        data_doacao     TEXT,
        forma_pagamento TEXT,
        status          TEXT    NOT NULL DEFAULT 'Pendente',
        criado_em       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        alterado_em     TEXT
      );
      CREATE INDEX idx_doacao_doador ON doacao_nova(id_doador);

      CREATE TABLE interacao_nova (
        id_interacao   INTEGER PRIMARY KEY AUTOINCREMENT,
        id_doador      INTEGER REFERENCES doador_novo(id_doador) ON DELETE RESTRICT,
        id_usuario     TEXT,
        tipo_interacao TEXT    NOT NULL CHECK (length(trim(tipo_interacao)) > 0),
        observacoes    TEXT,
        data_interacao TEXT,
        criado_em      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        alterado_em    TEXT
      );
      CREATE INDEX idx_interacao_doador ON interacao_nova(id_doador);
    `,
  },
  {
    versao: 2,
    nome: "usuarios locais com senha em hash e nivel de acesso",
    sql: `
      CREATE TABLE usuario (
        id_usuario   INTEGER PRIMARY KEY AUTOINCREMENT,
        nome         TEXT    NOT NULL CHECK (length(trim(nome)) > 0),
        email        TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(email)) > 0),
        senha_hash   TEXT    NOT NULL,
        -- 99 = administrador; 1 = usuario comum (mesmos niveis do sistema web)
        nivel_acesso INTEGER NOT NULL DEFAULT 1 CHECK (nivel_acesso IN (1, 99)),
        ativo        INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        ultimo_login TEXT,
        criado_em    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        alterado_em  TEXT
      );
    `,
  },
  {
    versao: 3,
    nome: "configuracoes do sistema (backup, lembretes)",
    sql: `
      CREATE TABLE configuracao (
        chave       TEXT PRIMARY KEY,
        valor       TEXT,
        alterado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `,
  },
  {
    versao: 4,
    nome: "doador sem contato; interacao com doacao opcional e pessoa nao registrada (lead)",
    sql: `
      ALTER TABLE doador_novo ADD COLUMN sem_contato INTEGER NOT NULL DEFAULT 0 CHECK (sem_contato IN (0, 1));
      ALTER TABLE interacao_nova ADD COLUMN id_doacao INTEGER REFERENCES doacao_nova(id_doacao) ON DELETE SET NULL;
      ALTER TABLE interacao_nova ADD COLUMN pessoa_nome TEXT;
      ALTER TABLE interacao_nova ADD COLUMN pessoa_contato TEXT;
      CREATE INDEX idx_interacao_doacao ON interacao_nova(id_doacao);
    `,
  },
];
