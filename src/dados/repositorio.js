// CRUD das 3 entidades. Toda entrada vinda da tela passa por uma lista branca
// de tabelas e colunas; nenhum SQL é montado com texto do usuário.
// Retorno no formato { data, error } (igual ao Supabase) para manter o script.js simples.

const TABELAS = {
  doador_novo: {
    id: "id_doador",
    colunas: ["nome", "email", "telefone", "cpf_cnpj", "endereco"],
  },
  doacao_nova: {
    id: "id_doacao",
    colunas: ["id_doador", "valor", "data_doacao", "forma_pagamento", "status"],
  },
  interacao_nova: {
    id: "id_interacao",
    colunas: ["id_doador", "id_usuario", "tipo_interacao", "observacoes", "data_interacao"],
  },
};

function definicao(tabela) {
  const def = Object.prototype.hasOwnProperty.call(TABELAS, tabela) ? TABELAS[tabela] : null;
  if (!def) throw erroDados(`Tabela desconhecida: ${tabela}`, "TABELA_INVALIDA");
  return def;
}

function erroDados(mensagem, code) {
  const e = new Error(mensagem);
  e.code = code;
  return e;
}

function validarId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw erroDados("Identificador inválido.", "ID_INVALIDO");
  return n;
}

// Mantém só as colunas permitidas e converte valores para tipos aceitos pelo SQLite.
function filtrarRegistro(def, registro) {
  if (!registro || typeof registro !== "object" || Array.isArray(registro)) {
    throw erroDados("Registro inválido.", "REGISTRO_INVALIDO");
  }
  const desconhecidas = Object.keys(registro).filter((c) => !def.colunas.includes(c));
  if (desconhecidas.length) {
    throw erroDados(`Campo não permitido: ${desconhecidas.join(", ")}`, "COLUNA_INVALIDA");
  }
  const limpo = {};
  for (const coluna of def.colunas) {
    if (!(coluna in registro)) continue;
    const v = registro[coluna];
    if (v === undefined || v === "") limpo[coluna] = null;
    else if (["string", "number"].includes(typeof v) || v === null) limpo[coluna] = v;
    else throw erroDados(`Valor inválido no campo ${coluna}.`, "VALOR_INVALIDO");
  }
  return limpo;
}

// Traduz erros do SQLite para mensagens que o usuário entende.
function traduzirErro(erro) {
  const msg = String(erro && erro.message);
  if (erro && erro.code && !String(erro.code).startsWith("SQLITE")) return erro.message;
  if (/FOREIGN KEY/i.test(msg)) {
    return "Operação bloqueada: o doador não existe ou tem doações/interações vinculadas.";
  }
  if (/NOT NULL|CHECK/i.test(msg)) return "Preencha os campos obrigatórios com valores válidos.";
  return "Erro inesperado no banco de dados.";
}

function criarRepositorio(db) {
  function executar(fn) {
    try {
      return { data: fn(), error: null };
    } catch (erro) {
      return { data: null, error: { message: traduzirErro(erro), code: erro.code || "ERRO" } };
    }
  }

  return {
    listar(tabela) {
      return executar(() => {
        const def = definicao(tabela);
        return db.prepare(`SELECT * FROM ${tabela} ORDER BY ${def.id}`).all();
      });
    },

    obter(tabela, id) {
      return executar(() => {
        const def = definicao(tabela);
        const linha = db.prepare(`SELECT * FROM ${tabela} WHERE ${def.id} = ?`).get(validarId(id));
        if (!linha) throw erroDados("Registro não encontrado.", "NAO_ENCONTRADO");
        return linha;
      });
    },

    inserir(tabela, registro) {
      return executar(() => {
        const def = definicao(tabela);
        const limpo = filtrarRegistro(def, registro);
        const cols = Object.keys(limpo);
        if (!cols.length) throw erroDados("Registro vazio.", "REGISTRO_INVALIDO");
        const sql = `INSERT INTO ${tabela} (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`;
        const info = db.prepare(sql).run(limpo);
        return db.prepare(`SELECT * FROM ${tabela} WHERE ${def.id} = ?`).get(info.lastInsertRowid);
      });
    },

    atualizar(tabela, id, alteracoes) {
      return executar(() => {
        const def = definicao(tabela);
        const n = validarId(id);
        const limpo = filtrarRegistro(def, alteracoes);
        const cols = Object.keys(limpo);
        if (!cols.length) throw erroDados("Nada para atualizar.", "REGISTRO_INVALIDO");
        const sets = cols.map((c) => `${c} = @${c}`).join(", ");
        const info = db
          .prepare(
            `UPDATE ${tabela} SET ${sets}, alterado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${def.id} = @__id`,
          )
          .run({ ...limpo, __id: n });
        if (!info.changes) throw erroDados("Registro não encontrado.", "NAO_ENCONTRADO");
        return db.prepare(`SELECT * FROM ${tabela} WHERE ${def.id} = ?`).get(n);
      });
    },

    excluir(tabela, id) {
      return executar(() => {
        const def = definicao(tabela);
        const info = db.prepare(`DELETE FROM ${tabela} WHERE ${def.id} = ?`).run(validarId(id));
        if (!info.changes) throw erroDados("Registro não encontrado.", "NAO_ENCONTRADO");
        return { excluidos: info.changes };
      });
    },
  };
}

module.exports = { criarRepositorio, TABELAS };
