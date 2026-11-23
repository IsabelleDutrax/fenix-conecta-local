// Canais IPC entre a tela e o processo principal.
// Regras de segurança (todas aplicadas aqui, no processo principal, nunca na tela):
// - só aceita chamadas da página local (file://);
// - dados e usuários exigem sessão aberta; gestão de usuários e exclusões exigem administrador;
// - id_usuario das interações vem da sessão, não da tela.
const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain } = require("electron");
const { abrirBanco } = require("../src/dados/banco");
const { criarRepositorio } = require("../src/dados/repositorio");
const { criarUsuarios } = require("../src/dados/usuarios");
const chaves = require("./chave");
const { criarServicoBackup } = require("./backup-servico");

let db = null;
let repo = null;
let usuarios = null;
let sessao = null; // { id_usuario, nome, email, admin }
let chaveAtual = null;

// Bloqueio simples contra tentativa de senha em sequência.
const LIMITE_FALHAS = 5;
const BLOQUEIO_MS = 30 * 1000;
let falhas = 0;
let bloqueadoAte = 0;

const pasta = () => app.getPath("userData");
const arquivoBanco = () => path.join(pasta(), "dados", "fenix.db");

function erro(mensagem, code) {
  const e = new Error(mensagem);
  e.code = code;
  return e;
}

function abrirCom(chave) {
  db = abrirBanco(arquivoBanco(), chave);
  repo = criarRepositorio(db);
  usuarios = criarUsuarios(db);
  chaveAtual = chave;
  servicoBackup.aoAbrirBanco();
}

function fecharBanco() {
  if (db) db.close();
  db = repo = usuarios = null;
  chaveAtual = null;
}

// Abre o banco se possível. Devolve o estado da inicialização para a tela.
function prepararBanco() {
  if (db) return "aberto";
  const existeBanco = fs.existsSync(arquivoBanco());
  let chave = chaves.lerChave(pasta());

  if (!chave) {
    // Nunca criar chave nova para um banco já existente: os dados ficariam inacessíveis.
    if (existeBanco || chaves.existeChave(pasta())) return "recuperar";
    chave = chaves.criarChave(pasta());
  }
  try {
    abrirCom(chave);
    return "aberto";
  } catch (e) {
    if (e.code === "CHAVE_INVALIDA") return "recuperar";
    throw e;
  }
}

function estado() {
  if (prepararBanco() === "recuperar") return { etapa: "recuperar" };
  if (usuarios.contar() === 0) return { etapa: "primeiro_acesso" };
  if (sessao) return { etapa: "logado", usuario: sessao };
  return { etapa: "login" };
}

function exigirSessao() {
  if (!db || !sessao) throw erro("Sessão encerrada. Entre novamente.", "SEM_SESSAO");
}

function exigirAdmin() {
  exigirSessao();
  if (!sessao.admin) throw erro("Apenas administradores podem fazer isso.", "SEM_PERMISSAO");
}

function abrirSessao(usuario) {
  sessao = {
    id_usuario: usuario.id_usuario,
    nome: usuario.nome,
    email: usuario.email,
    admin: usuario.admin,
  };
  return sessao;
}

const OPERACOES_DADOS = ["listar", "obter", "inserir", "atualizar", "excluir"];

const servicoBackup = criarServicoBackup({
  db: () => db,
  chave: () => chaveAtual,
  arquivoBanco,
  sessao: () => sessao,
  contarUsuarios: () => (usuarios ? usuarios.contar() : 0),
  exigirSessao,
  exigirAdmin,
  conferirSenha: (senha) => usuarios.conferirSenha(sessao.id_usuario, senha),
  fecharBanco,
  reabrirBanco: (chave) => abrirCom(chave),
  salvarChave: (chave) => chaves.salvarChave(pasta(), chave),
  formatarChave: chaves.formatarChave,
  encerrarSessao: () => {
    sessao = null;
  },
});

// handlers: canal -> função(...args) que devolve o "data"; erros viram { error }.
const HANDLERS = {
  "sessao:estado": () => estado(),

  "sessao:primeiroAcesso": (dadosAdmin) => {
    if (prepararBanco() !== "aberto") throw erro("Banco indisponível.", "SEM_BANCO");
    const admin = usuarios.criarPrimeiroAdmin(dadosAdmin || {});
    const resultado = { usuario: abrirSessao(admin), chaveRecuperacao: chaves.lerChave(pasta()) };
    servicoBackup.verificarAgenda(); // primeiro backup já no primeiro acesso
    return resultado;
  },

  "sessao:entrar": (email, senha) => {
    if (prepararBanco() !== "aberto") throw erro("Banco indisponível.", "SEM_BANCO");
    const agora = Date.now();
    if (agora < bloqueadoAte) {
      const s = Math.ceil((bloqueadoAte - agora) / 1000);
      throw erro(`Muitas tentativas. Aguarde ${s} segundos.`, "BLOQUEADO");
    }
    try {
      const usuario = usuarios.autenticar(email, senha);
      falhas = 0;
      const s = abrirSessao(usuario);
      servicoBackup.verificarAgenda(); // no máximo um backup automático por dia
      return s;
    } catch (e) {
      if (e.code === "CREDENCIAIS" && ++falhas >= LIMITE_FALHAS) {
        falhas = 0;
        bloqueadoAte = agora + BLOQUEIO_MS;
      }
      throw e;
    }
  },

  "sessao:sair": () => {
    sessao = null;
    return true;
  },

  "sessao:atual": () => sessao,

  // Abre o banco com a chave de recuperação impressa e guarda a chave de novo neste Windows.
  "sessao:recuperar": (entrada) => {
    if (db) return { etapa: estado().etapa };
    const chave = chaves.formatarChave(entrada);
    if (!chave) throw erro("Chave incompleta: são 64 letras/números (8 grupos de 8).", "CHAVE_FORMATO");
    try {
      abrirCom(chave);
    } catch (e) {
      if (e.code === "CHAVE_INVALIDA") throw erro("Chave de recuperação incorreta.", "CHAVE_INVALIDA");
      throw e;
    }
    chaves.salvarChave(pasta(), chave);
    return { etapa: estado().etapa };
  },

  "sessao:verChaveRecuperacao": (senha) => {
    exigirAdmin();
    if (!usuarios.conferirSenha(sessao.id_usuario, senha)) throw erro("Senha incorreta.", "CREDENCIAIS");
    return chaves.lerChave(pasta());
  },

  "sessao:alterarMinhaSenha": (senhaAtual, novaSenha) => {
    exigirSessao();
    usuarios.alterarPropriaSenha(sessao.id_usuario, senhaAtual, novaSenha);
    return true;
  },

  "usuarios:listar": () => {
    exigirAdmin();
    return usuarios.listar();
  },

  "usuarios:criar": (novo) => {
    exigirAdmin();
    return usuarios.criar(novo || {});
  },

  "usuarios:atualizar": (id, alteracoes) => {
    exigirAdmin();
    const r = usuarios.atualizar(id, alteracoes || {});
    if (r.id_usuario === sessao.id_usuario) abrirSessao(r); // atualiza nome/nível da própria sessão
    return r;
  },

  "usuarios:redefinirSenha": (id, novaSenha) => {
    exigirAdmin();
    usuarios.definirSenha(id, novaSenha);
    return true;
  },

  ...servicoBackup.handlers,
};

function origemValida(evento) {
  const url = evento.senderFrame && evento.senderFrame.url;
  return typeof url === "string" && url.startsWith("file://");
}

function falha(e) {
  if (!e.code) console.error("[ipc]", e);
  return { data: null, error: { message: e.code ? e.message : "Erro inesperado.", code: e.code || "ERRO" } };
}

function registrarCanais() {
  for (const [canal, fn] of Object.entries(HANDLERS)) {
    ipcMain.handle(canal, async (evento, ...args) => {
      if (!origemValida(evento)) return falha(erro("Origem não autorizada.", "ORIGEM"));
      try {
        return { data: await fn(...args), error: null };
      } catch (e) {
        return falha(e);
      }
    });
  }

  for (const op of OPERACOES_DADOS) {
    ipcMain.handle(`dados:${op}`, (evento, tabela, ...args) => {
      if (!origemValida(evento)) return falha(erro("Origem não autorizada.", "ORIGEM"));
      try {
        exigirSessao();
        if (op === "excluir" && !sessao.admin) {
          throw erro("Apenas administradores podem excluir registros.", "SEM_PERMISSAO");
        }
        if (tabela === "interacao_nova" && (op === "inserir" || op === "atualizar")) {
          const ultimo = args.length - 1;
          const registro = { ...(args[ultimo] || {}) };
          if (op === "inserir") registro.id_usuario = String(sessao.id_usuario);
          else delete registro.id_usuario; // autor original não muda na edição
          args[ultimo] = registro;
        }
        return repo[op](tabela, ...args);
      } catch (e) {
        return falha(e);
      }
    });
  }
}

function fecharDados() {
  sessao = null;
  servicoBackup.parar();
  fecharBanco();
}

module.exports = { registrarCanais, fecharDados, arquivoBanco };
