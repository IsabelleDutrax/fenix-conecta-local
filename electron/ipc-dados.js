// Liga a camada de dados (src/dados) aos canais IPC usados pelo preload.
const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain } = require("electron");
const { abrirBanco } = require("../src/dados/banco");
const { criarRepositorio } = require("../src/dados/repositorio");
const { obterOuCriarChave } = require("./chave");

let db = null;
let repo = null;

function arquivoBanco() {
  return path.join(app.getPath("userData"), "dados", "fenix.db");
}

function repositorio() {
  if (repo) return repo;
  const pasta = app.getPath("userData");
  const arquivo = arquivoBanco();
  if (fs.existsSync(arquivo) && !fs.existsSync(path.join(pasta, "chave.bin"))) {
    // Nunca criar chave nova para um banco já existente: os dados ficariam inacessíveis.
    throw new Error(
      "A chave do banco não foi encontrada. Use a chave de recuperação para abrir os dados.",
    );
  }
  db = abrirBanco(arquivo, obterOuCriarChave(pasta));
  repo = criarRepositorio(db);
  return repo;
}

// Só aceita chamadas da página local do programa.
function origemValida(evento) {
  const url = evento.senderFrame && evento.senderFrame.url;
  return typeof url === "string" && url.startsWith("file://");
}

const OPERACOES = ["listar", "obter", "inserir", "atualizar", "excluir"];

function registrarCanaisDados() {
  for (const op of OPERACOES) {
    ipcMain.handle(`dados:${op}`, (evento, ...args) => {
      if (!origemValida(evento)) {
        return { data: null, error: { message: "Origem não autorizada.", code: "ORIGEM" } };
      }
      try {
        return repositorio()[op](...args);
      } catch (erro) {
        console.error("[dados]", erro);
        return { data: null, error: { message: erro.message, code: erro.code || "ERRO" } };
      }
    });
  }
}

function fecharDados() {
  if (db) {
    db.close();
    db = null;
    repo = null;
  }
}

module.exports = { registrarCanaisDados, fecharDados, arquivoBanco };
