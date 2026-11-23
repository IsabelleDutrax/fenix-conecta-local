// Testes da planilha de consulta (src/dados/excel.js). Dados fictícios.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { unzipSync, strFromU8 } = require("fflate");
const { abrirBanco } = require("../src/dados/banco");
const { criarRepositorio } = require("../src/dados/repositorio");
const { criarUsuarios } = require("../src/dados/usuarios");
const { gerarExcelConsulta, nomeExcelConsulta } = require("../src/dados/excel");

let pasta, db;

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "fenix-excel-"));
  db = abrirBanco(path.join(pasta, "fenix.db"), "TESTE-EXCEL-CHAVE");
  const repo = criarRepositorio(db);
  const admin = criarUsuarios(db).criarPrimeiroAdmin({
    nome: "Admin Fictício",
    email: "admin@exemplo.invalid",
    senha: "SenhaAdmin#2026",
  });
  const d = repo.inserir("doador_novo", {
    nome: "Doador Fictício Excel",
    email: "excel@exemplo.invalid",
    cpf_cnpj: "000.000.000-00",
  }).data;
  repo.inserir("doacao_nova", { id_doador: d.id_doador, valor: 1234.5, data_doacao: "2026-11-20", forma_pagamento: "Pix" });
  repo.inserir("interacao_nova", {
    id_doador: d.id_doador,
    id_usuario: String(admin.id_usuario),
    tipo_interacao: "Ligação",
    data_interacao: "2026-11-21",
  });
});

afterEach(() => {
  db.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test("nome do arquivo tem 'consulta' e a data DD-MM-AAAA", () => {
  assert.equal(nomeExcelConsulta(new Date(2026, 10, 23)), "Fenix Conecta - consulta - 23-11-2026.xlsx");
});

test("gera .xlsx com LEIA-ME (aviso LGPD) e as 3 planilhas", async () => {
  const arquivo = path.join(pasta, nomeExcelConsulta());
  const r = await gerarExcelConsulta(db, arquivo, { geradoPor: "Admin Fictício" });
  assert.deepEqual(r.registros, { doadores: 1, doacoes: 1, interacoes: 1 });

  const zip = unzipSync(fs.readFileSync(arquivo));
  const workbook = strFromU8(zip["xl/workbook.xml"]);
  const nomes = [...workbook.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ["LEIA-ME", "Doadores", "Doações", "Interações"]);

  const textos = Object.entries(zip)
    .filter(([n]) => n.startsWith("xl/"))
    .map(([, v]) => strFromU8(v))
    .join("\n");
  assert.match(textos, /DADOS PESSOAIS \(LGPD\)/);
  assert.match(textos, /NÃO voltam para o sistema/);
  assert.match(textos, /Doador Fictício Excel/);
  assert.match(textos, /000\.000\.000-00/);
  assert.match(textos, /Admin Fictício/, "interação mostra quem registrou");
  assert.match(textos, /&quot;R\$&quot; #,##0\.00|"R\$" #,##0\.00/, "valor com formato de moeda");
  assert.match(textos, /dd\/mm\/yyyy/, "datas com formato brasileiro");
});
