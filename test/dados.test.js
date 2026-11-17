// Testes da camada de dados (src/dados). Dados 100% fictícios.
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBanco, aplicarMigracoes, versaoAtual } = require("../src/dados/banco");
const { criarRepositorio } = require("../src/dados/repositorio");
const MIGRACOES = require("../src/dados/migracoes");

const CHAVE = "TESTE001-TESTE002-TESTE003-TESTE004";
const DOADOR_FICTICIO = {
  nome: "Doador Teste Um",
  email: "doador.teste@exemplo.invalid",
  telefone: "(11) 90000-0000",
  cpf_cnpj: "000.000.000-00",
  endereco: "Rua Fictícia, 100",
};

let pasta, arquivo, db, repo;

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "fenix-teste-"));
  arquivo = path.join(pasta, "fenix.db");
  db = abrirBanco(arquivo, CHAVE);
  repo = criarRepositorio(db);
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

function ok(resultado) {
  assert.equal(resultado.error, null, resultado.error && resultado.error.message);
  return resultado.data;
}

describe("criptografia", () => {
  test("arquivo não contém texto legível nem cabeçalho SQLite", () => {
    ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    const bruto = fs.readFileSync(arquivo);
    assert.ok(!bruto.includes(Buffer.from("SQLite format 3")), "cabeçalho SQLite em claro");
    assert.ok(!bruto.includes(Buffer.from("Doador Teste Um")), "nome em claro no arquivo");
    assert.ok(!bruto.includes(Buffer.from("000.000.000-00")), "CPF em claro no arquivo");
  });

  test("chave errada não abre o banco", () => {
    db.close();
    assert.throws(() => abrirBanco(arquivo, "CHAVE-ERRADA"), { code: "CHAVE_INVALIDA" });
  });

  test("chave vazia é recusada", () => {
    assert.throws(() => abrirBanco(path.join(pasta, "outro.db"), ""));
  });

  test("dados persistem após fechar e reabrir com a chave certa", () => {
    ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    db.close();
    db = abrirBanco(arquivo, CHAVE);
    repo = criarRepositorio(db);
    const lista = ok(repo.listar("doador_novo"));
    assert.equal(lista.length, 1);
    assert.equal(lista[0].nome, "Doador Teste Um");
  });
});

describe("migrações", () => {
  test("aplica todas as versões e registra em schema_migrations", () => {
    const ultima = Math.max(...MIGRACOES.map((m) => m.versao));
    assert.equal(versaoAtual(db), ultima);
    assert.equal(db.pragma("user_version", { simple: true }), ultima);
    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .pluck()
      .all();
    for (const t of ["doador_novo", "doacao_nova", "interacao_nova", "schema_migrations"]) {
      assert.ok(tabelas.includes(t), `faltou tabela ${t}`);
    }
  });

  test("reaplicar é idempotente", () => {
    const antes = versaoAtual(db);
    aplicarMigracoes(db);
    assert.equal(versaoAtual(db), antes);
  });

  test("nova migração é aplicada só uma vez, em ordem", () => {
    const extra = [
      ...MIGRACOES,
      { versao: 999, nome: "teste", sql: "ALTER TABLE doador_novo ADD COLUMN apelido TEXT;" },
    ];
    assert.equal(aplicarMigracoes(db, extra), 999);
    assert.equal(aplicarMigracoes(db, extra), 999);
    const cols = db.prepare("PRAGMA table_info(doador_novo)").all().map((c) => c.name);
    assert.ok(cols.includes("apelido"));
  });

  test("migração com erro é revertida por inteiro", () => {
    const quebrada = [
      ...MIGRACOES,
      { versao: 2, nome: "quebrada", sql: "CREATE TABLE x (a INT); SELECT * FROM nao_existe;" },
    ];
    assert.throws(() => aplicarMigracoes(db, quebrada));
    assert.equal(versaoAtual(db), 1);
    const temX = db.prepare("SELECT 1 FROM sqlite_master WHERE name='x'").get();
    assert.equal(temX, undefined);
  });
});

describe("CRUD doador", () => {
  test("inserir, listar, obter, atualizar e excluir", () => {
    const criado = ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    assert.ok(criado.id_doador > 0);
    assert.ok(criado.criado_em);

    assert.equal(ok(repo.obter("doador_novo", criado.id_doador)).email, DOADOR_FICTICIO.email);

    // id vem como texto do <input hidden>, igual ao script.js
    const editado = ok(
      repo.atualizar("doador_novo", String(criado.id_doador), { nome: "Doador Teste Editado" }),
    );
    assert.equal(editado.nome, "Doador Teste Editado");
    assert.equal(editado.cpf_cnpj, DOADOR_FICTICIO.cpf_cnpj);
    assert.ok(editado.alterado_em);

    ok(repo.excluir("doador_novo", criado.id_doador));
    assert.equal(ok(repo.listar("doador_novo")).length, 0);
  });

  test("nome vazio é recusado", () => {
    const r = repo.inserir("doador_novo", { ...DOADOR_FICTICIO, nome: "   " });
    assert.ok(r.error);
  });

  test("texto vazio vira NULL", () => {
    const d = ok(repo.inserir("doador_novo", { nome: "Só Nome", email: "", telefone: "" }));
    assert.equal(d.email, null);
  });

  test("obter registro inexistente retorna erro", () => {
    assert.equal(repo.obter("doador_novo", 12345).error.code, "NAO_ENCONTRADO");
  });

  test("não exclui doador com doação vinculada", () => {
    const d = ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    ok(repo.inserir("doacao_nova", { id_doador: d.id_doador, valor: 50 }));
    const r = repo.excluir("doador_novo", d.id_doador);
    assert.ok(r.error);
    assert.match(r.error.message, /vinculadas/);
    assert.equal(ok(repo.listar("doador_novo")).length, 1);
  });

  test("não exclui doador com interação vinculada", () => {
    const d = ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    ok(repo.inserir("interacao_nova", { id_doador: d.id_doador, tipo_interacao: "Ligação" }));
    assert.ok(repo.excluir("doador_novo", d.id_doador).error);
  });
});

describe("CRUD doação", () => {
  test("ciclo completo e status padrão Pendente", () => {
    const d = ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    const doacao = ok(
      repo.inserir("doacao_nova", {
        id_doador: d.id_doador,
        valor: 150.5,
        data_doacao: "2026-11-17",
        forma_pagamento: "Pix",
      }),
    );
    assert.equal(doacao.status, "Pendente");
    assert.equal(doacao.valor, 150.5);

    const editada = ok(repo.atualizar("doacao_nova", doacao.id_doacao, { status: "Pago" }));
    assert.equal(editada.status, "Pago");

    ok(repo.excluir("doacao_nova", doacao.id_doacao));
    assert.equal(ok(repo.listar("doacao_nova")).length, 0);
  });

  test("valor zero ou negativo é recusado", () => {
    const d = ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    assert.ok(repo.inserir("doacao_nova", { id_doador: d.id_doador, valor: 0 }).error);
    assert.ok(repo.inserir("doacao_nova", { id_doador: d.id_doador, valor: -10 }).error);
  });

  test("doador inexistente é recusado", () => {
    assert.ok(repo.inserir("doacao_nova", { id_doador: 999, valor: 10 }).error);
  });
});

describe("CRUD interação", () => {
  test("ciclo completo, com e sem doador", () => {
    const d = ok(repo.inserir("doador_novo", DOADOR_FICTICIO));
    const comDoador = ok(
      repo.inserir("interacao_nova", {
        id_doador: d.id_doador,
        id_usuario: "local",
        tipo_interacao: "E-mail",
        observacoes: "Agradecimento enviado",
        data_interacao: "2026-11-16",
      }),
    );
    const semDoador = ok(
      repo.inserir("interacao_nova", { id_doador: null, tipo_interacao: "Evento" }),
    );
    assert.equal(semDoador.id_doador, null);

    const editada = ok(
      repo.atualizar("interacao_nova", comDoador.id_interacao, { observacoes: "Revisado" }),
    );
    assert.equal(editada.observacoes, "Revisado");

    ok(repo.excluir("interacao_nova", comDoador.id_interacao));
    ok(repo.excluir("interacao_nova", semDoador.id_interacao));
    assert.equal(ok(repo.listar("interacao_nova")).length, 0);
  });

  test("tipo vazio é recusado", () => {
    assert.ok(repo.inserir("interacao_nova", { tipo_interacao: "" }).error);
  });
});

describe("segurança da camada de dados", () => {
  test("tabela fora da lista branca é recusada", () => {
    assert.equal(repo.listar("sqlite_master").error.code, "TABELA_INVALIDA");
    assert.equal(repo.listar("doador_novo; DROP TABLE doador_novo").error.code, "TABELA_INVALIDA");
    assert.equal(repo.listar("__proto__").error.code, "TABELA_INVALIDA");
  });

  test("coluna fora da lista branca é recusada", () => {
    const r = repo.inserir("doador_novo", { nome: "X", id_doador: 1 });
    assert.equal(r.error.code, "COLUNA_INVALIDA");
    const r2 = repo.inserir("doador_novo", { nome: "X", "nome) VALUES ('a'); --": "y" });
    assert.equal(r2.error.code, "COLUNA_INVALIDA");
  });

  test("texto com aspas e SQL é gravado literalmente", () => {
    const nome = "Robert'); DROP TABLE doador_novo; --";
    const d = ok(repo.inserir("doador_novo", { nome }));
    assert.equal(ok(repo.obter("doador_novo", d.id_doador)).nome, nome);
    assert.equal(ok(repo.listar("doador_novo")).length, 1);
  });

  test("id inválido é recusado", () => {
    assert.equal(repo.excluir("doador_novo", "1 OR 1=1").error.code, "ID_INVALIDO");
    assert.equal(repo.obter("doador_novo", -1).error.code, "ID_INVALIDO");
  });

  test("tipos não permitidos (objeto) são recusados", () => {
    assert.equal(
      repo.inserir("doador_novo", { nome: { $ne: 1 } }).error.code,
      "VALOR_INVALIDO",
    );
  });
});
