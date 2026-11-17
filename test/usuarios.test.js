// Testes dos usuários locais (src/dados/usuarios.js). Dados 100% fictícios.
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBanco } = require("../src/dados/banco");
const { criarUsuarios, gerarHash, conferirHash } = require("../src/dados/usuarios");

const CHAVE = "TESTE001-TESTE002-TESTE003-TESTE004";
const ADMIN = { nome: "Admin Teste", email: "Admin@Exemplo.invalid", senha: "senha-forte-1" };

let pasta, db, u;

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "fenix-usuarios-"));
  db = abrirBanco(path.join(pasta, "fenix.db"), CHAVE);
  u = criarUsuarios(db);
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

describe("hash de senha", () => {
  test("usa scrypt com sal aleatório e confere", () => {
    const h1 = gerarHash("abc12345");
    const h2 = gerarHash("abc12345");
    assert.match(h1, /^scrypt\$32768\$8\$1\$/);
    assert.notEqual(h1, h2, "sal deve ser diferente a cada hash");
    assert.ok(conferirHash("abc12345", h1));
    assert.ok(!conferirHash("abc12346", h1));
    assert.ok(!conferirHash("abc12345", "formato-invalido"));
  });

  test("senha não fica gravada em texto no banco", () => {
    u.criarPrimeiroAdmin(ADMIN);
    const linha = db.prepare("SELECT senha_hash FROM usuario").get();
    assert.ok(!linha.senha_hash.includes(ADMIN.senha));
  });
});

describe("primeiro acesso", () => {
  test("cria o primeiro administrador uma única vez", () => {
    assert.equal(u.contar(), 0);
    const admin = u.criarPrimeiroAdmin(ADMIN);
    assert.equal(admin.admin, true);
    assert.equal(admin.nivel_acesso, 99);
    assert.equal(admin.email, "admin@exemplo.invalid", "e-mail normalizado em minúsculas");
    assert.equal(admin.senha_hash, undefined, "hash nunca sai do módulo");
    assert.throws(() => u.criarPrimeiroAdmin({ ...ADMIN, email: "outro@exemplo.invalid" }), {
      code: "JA_CONFIGURADO",
    });
  });

  test("valida nome, e-mail e senha mínima", () => {
    assert.throws(() => u.criarPrimeiroAdmin({ ...ADMIN, nome: " " }), { code: "NOME_VAZIO" });
    assert.throws(() => u.criarPrimeiroAdmin({ ...ADMIN, email: "sem-arroba" }), { code: "EMAIL_INVALIDO" });
    assert.throws(() => u.criarPrimeiroAdmin({ ...ADMIN, senha: "1234567" }), { code: "SENHA_FRACA" });
    assert.equal(u.contar(), 0);
  });
});

describe("autenticação", () => {
  test("entra com e-mail em qualquer caixa e registra último acesso", () => {
    u.criarPrimeiroAdmin(ADMIN);
    const s = u.autenticar("ADMIN@exemplo.INVALID", ADMIN.senha);
    assert.equal(s.nome, "Admin Teste");
    assert.ok(s.ultimo_login);
  });

  test("senha errada e e-mail inexistente dão a mesma mensagem", () => {
    u.criarPrimeiroAdmin(ADMIN);
    const e1 = assert.throws(() => u.autenticar(ADMIN.email, "errada123"), { code: "CREDENCIAIS" });
    assert.throws(() => u.autenticar("ninguem@exemplo.invalid", ADMIN.senha), {
      code: "CREDENCIAIS",
      message: "E-mail ou senha incorretos.",
    });
    void e1;
  });

  test("usuário desativado não entra", () => {
    const admin = u.criarPrimeiroAdmin(ADMIN);
    const comum = u.criar({ nome: "Comum", email: "comum@exemplo.invalid", senha: "senha-comum-1" });
    u.atualizar(comum.id_usuario, { ativo: false });
    assert.throws(() => u.autenticar("comum@exemplo.invalid", "senha-comum-1"), { code: "INATIVO" });
    assert.ok(admin);
  });
});

describe("gestão de usuários", () => {
  test("cria usuário comum e não aceita e-mail duplicado", () => {
    u.criarPrimeiroAdmin(ADMIN);
    const c = u.criar({ nome: "Comum", email: "comum@exemplo.invalid", senha: "senha-comum-1" });
    assert.equal(c.admin, false);
    assert.equal(c.nivel_acesso, 1);
    assert.throws(
      () => u.criar({ nome: "Outro", email: "COMUM@exemplo.invalid", senha: "senha-comum-2" }),
      { code: "EMAIL_DUPLICADO" },
    );
    assert.equal(u.listar().length, 2);
    assert.ok(u.listar().every((x) => x.senha_hash === undefined));
  });

  test("nível de acesso só aceita 1 ou 99", () => {
    u.criarPrimeiroAdmin(ADMIN);
    assert.throws(
      () => u.criar({ nome: "X", email: "x@exemplo.invalid", senha: "senha-x-123", nivel_acesso: 50 }),
      { code: "NIVEL_INVALIDO" },
    );
  });

  test("não permite ficar sem administrador ativo", () => {
    const admin = u.criarPrimeiroAdmin(ADMIN);
    assert.throws(() => u.atualizar(admin.id_usuario, { nivel_acesso: 1 }), { code: "ULTIMO_ADMIN" });
    assert.throws(() => u.atualizar(admin.id_usuario, { ativo: false }), { code: "ULTIMO_ADMIN" });

    const outro = u.criar({ nome: "Admin 2", email: "a2@exemplo.invalid", senha: "senha-a2-123", nivel_acesso: 99 });
    const rebaixado = u.atualizar(admin.id_usuario, { nivel_acesso: 1 });
    assert.equal(rebaixado.admin, false);
    assert.throws(() => u.atualizar(outro.id_usuario, { ativo: false }), { code: "ULTIMO_ADMIN" });
  });

  test("alterar a própria senha exige a senha atual", () => {
    const admin = u.criarPrimeiroAdmin(ADMIN);
    assert.throws(() => u.alterarPropriaSenha(admin.id_usuario, "errada123", "nova-senha-1"), {
      code: "CREDENCIAIS",
    });
    u.alterarPropriaSenha(admin.id_usuario, ADMIN.senha, "nova-senha-1");
    assert.throws(() => u.autenticar(ADMIN.email, ADMIN.senha), { code: "CREDENCIAIS" });
    assert.ok(u.autenticar(ADMIN.email, "nova-senha-1"));
  });

  test("redefinir senha (admin) troca a senha do usuário", () => {
    u.criarPrimeiroAdmin(ADMIN);
    const c = u.criar({ nome: "Comum", email: "comum@exemplo.invalid", senha: "senha-comum-1" });
    u.definirSenha(c.id_usuario, "senha-nova-99");
    assert.ok(u.autenticar("comum@exemplo.invalid", "senha-nova-99"));
    assert.throws(() => u.definirSenha(c.id_usuario, "curta"), { code: "SENHA_FRACA" });
  });
});
