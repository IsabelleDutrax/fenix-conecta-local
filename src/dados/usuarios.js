// Usuários locais: cadastro, senha em hash (scrypt) e autenticação.
// Não depende do Electron. Nunca devolve senha_hash para fora deste módulo.
const crypto = require("node:crypto");

const NIVEL_ADMIN = 99;
const NIVEL_COMUM = 1;
const SENHA_MIN = 8;

// scrypt: N=2^15, r=8, p=1 (recomendação OWASP para scrypt). Custo ~50-100 ms por login.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAM_HASH = 64;

function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, TAM_HASH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString("base64"), hash.toString("base64")].join("$");
}

function conferirHash(senha, armazenado) {
  const partes = String(armazenado).split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, N, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = crypto.scryptSync(senha, Buffer.from(salB64, "base64"), esperado.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(esperado, calculado);
}

// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quais e-mails existem).
let HASH_FALSO = null;

function erro(mensagem, code) {
  const e = new Error(mensagem);
  e.code = code;
  return e;
}

function texto(v) {
  return typeof v === "string" ? v.trim() : "";
}

function validarEmail(email) {
  if (!/^\S+@\S+\.\S+$/.test(email)) throw erro("E-mail inválido.", "EMAIL_INVALIDO");
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < SENHA_MIN) {
    throw erro(`A senha deve ter pelo menos ${SENHA_MIN} caracteres.`, "SENHA_FRACA");
  }
  if (senha.length > 200) throw erro("Senha muito longa.", "SENHA_FRACA");
}

function validarNivel(nivel) {
  const n = Number(nivel);
  if (n !== NIVEL_ADMIN && n !== NIVEL_COMUM) throw erro("Nível de acesso inválido.", "NIVEL_INVALIDO");
  return n;
}

// Visão pública do usuário (sem hash).
function publico(linha) {
  if (!linha) return null;
  return {
    id_usuario: linha.id_usuario,
    nome: linha.nome,
    email: linha.email,
    nivel_acesso: linha.nivel_acesso,
    ativo: linha.ativo === 1,
    admin: linha.nivel_acesso === NIVEL_ADMIN,
    ultimo_login: linha.ultimo_login,
    criado_em: linha.criado_em,
  };
}

function criarUsuarios(db) {
  const porId = (id) => db.prepare("SELECT * FROM usuario WHERE id_usuario = ?").get(Number(id));
  const adminsAtivos = () =>
    db.prepare("SELECT count(*) FROM usuario WHERE nivel_acesso = ? AND ativo = 1").pluck().get(NIVEL_ADMIN);

  function traduzir(e) {
    if (/UNIQUE/i.test(String(e.message))) return erro("Já existe um usuário com este e-mail.", "EMAIL_DUPLICADO");
    return e;
  }

  const api = {
    NIVEL_ADMIN,
    NIVEL_COMUM,
    SENHA_MIN,

    contar() {
      return db.prepare("SELECT count(*) FROM usuario").pluck().get();
    },

    listar() {
      return db.prepare("SELECT * FROM usuario ORDER BY nome COLLATE NOCASE").all().map(publico);
    },

    obter(id) {
      return publico(porId(id));
    },

    obterPorEmail(email) {
      return publico(db.prepare("SELECT * FROM usuario WHERE email = ?").get(texto(email).toLowerCase()));
    },

    criar({ nome, email, senha, nivel_acesso = NIVEL_COMUM }) {
      nome = texto(nome);
      email = texto(email).toLowerCase();
      if (!nome) throw erro("Informe o nome.", "NOME_VAZIO");
      validarEmail(email);
      validarSenha(senha);
      const nivel = validarNivel(nivel_acesso);
      try {
        const info = db
          .prepare("INSERT INTO usuario (nome, email, senha_hash, nivel_acesso) VALUES (?, ?, ?, ?)")
          .run(nome, email, gerarHash(senha), nivel);
        return publico(porId(info.lastInsertRowid));
      } catch (e) {
        throw traduzir(e);
      }
    },

    // Cria o primeiro administrador. Só funciona com a tabela vazia.
    criarPrimeiroAdmin({ nome, email, senha }) {
      return db.transaction(() => {
        if (api.contar() > 0) throw erro("O primeiro acesso já foi feito.", "JA_CONFIGURADO");
        return api.criar({ nome, email, senha, nivel_acesso: NIVEL_ADMIN });
      })();
    },

    autenticar(email, senha) {
      email = texto(email).toLowerCase();
      const linha = db.prepare("SELECT * FROM usuario WHERE email = ?").get(email);
      if (!HASH_FALSO) HASH_FALSO = gerarHash("senha-inexistente-para-tempo-constante");
      const confere = conferirHash(String(senha ?? ""), linha ? linha.senha_hash : HASH_FALSO);
      if (!linha || !confere) throw erro("E-mail ou senha incorretos.", "CREDENCIAIS");
      if (linha.ativo !== 1) throw erro("Usuário desativado. Fale com o administrador.", "INATIVO");
      db.prepare("UPDATE usuario SET ultimo_login = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id_usuario = ?").run(
        linha.id_usuario,
      );
      return publico(porId(linha.id_usuario));
    },

    // Confere a senha de um usuário já identificado (ex.: confirmar ação sensível).
    conferirSenha(id, senha) {
      const linha = porId(id);
      return !!linha && conferirHash(String(senha ?? ""), linha.senha_hash);
    },

    atualizar(id, { nome, email, nivel_acesso, ativo }) {
      return db.transaction(() => {
        const atual = porId(id);
        if (!atual) throw erro("Usuário não encontrado.", "NAO_ENCONTRADO");
        const novo = {
          nome: nome === undefined ? atual.nome : texto(nome),
          email: email === undefined ? atual.email : texto(email).toLowerCase(),
          nivel_acesso: nivel_acesso === undefined ? atual.nivel_acesso : validarNivel(nivel_acesso),
          ativo: ativo === undefined ? atual.ativo : ativo ? 1 : 0,
        };
        if (!novo.nome) throw erro("Informe o nome.", "NOME_VAZIO");
        validarEmail(novo.email);

        const deixaDeSerAdminAtivo =
          atual.nivel_acesso === NIVEL_ADMIN &&
          atual.ativo === 1 &&
          (novo.nivel_acesso !== NIVEL_ADMIN || novo.ativo !== 1);
        if (deixaDeSerAdminAtivo && adminsAtivos() <= 1) {
          throw erro("É preciso manter pelo menos um administrador ativo.", "ULTIMO_ADMIN");
        }
        try {
          db.prepare(
            `UPDATE usuario SET nome = @nome, email = @email, nivel_acesso = @nivel_acesso, ativo = @ativo,
             alterado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id_usuario = @id`,
          ).run({ ...novo, id: Number(id) });
        } catch (e) {
          throw traduzir(e);
        }
        return publico(porId(id));
      })();
    },

    definirSenha(id, novaSenha) {
      validarSenha(novaSenha);
      const info = db
        .prepare(
          "UPDATE usuario SET senha_hash = ?, alterado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id_usuario = ?",
        )
        .run(gerarHash(novaSenha), Number(id));
      if (!info.changes) throw erro("Usuário não encontrado.", "NAO_ENCONTRADO");
    },

    alterarPropriaSenha(id, senhaAtual, novaSenha) {
      if (!api.conferirSenha(id, senhaAtual)) throw erro("Senha atual incorreta.", "CREDENCIAIS");
      api.definirSenha(id, novaSenha);
    },
  };
  return api;
}

module.exports = { criarUsuarios, gerarHash, conferirHash, NIVEL_ADMIN, NIVEL_COMUM, SENHA_MIN };
