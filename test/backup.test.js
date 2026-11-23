// Testes de backup, retenção e restauração (src/dados/backup.js). Dados fictícios.
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBanco, VERSAO_ESQUEMA } = require("../src/dados/banco");
const { criarRepositorio } = require("../src/dados/repositorio");
const bkp = require("../src/dados/backup");

const CHAVE = "AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD-EEEEEEEE-FFFFFFFF-00000000-11111111";
const OUTRA = "99999999-88888888-77777777-66666666-55555555-44444444-33333333-22222222";

let pasta, arquivoBanco, pastaBkp, db, repo;

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "fenix-bkp-teste-"));
  arquivoBanco = path.join(pasta, "dados", "fenix.db");
  pastaBkp = path.join(pasta, "OneDrive", "Backup Fenix Conecta");
  db = abrirBanco(arquivoBanco, CHAVE);
  repo = criarRepositorio(db);
  repo.inserir("doador_novo", { nome: "Doador Fictício Backup", cpf_cnpj: "000.000.000-00" });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

describe("nome dos arquivos", () => {
  test("nome com data e hora, e leitura de volta", () => {
    const d = new Date(2026, 10, 23, 9, 5, 7);
    assert.equal(bkp.nomeBackup(d), "fenix-backup-2026-11-23_090507.fenixbak");
    assert.equal(bkp.dataDoNome("fenix-backup-2026-11-23_090507.fenixbak").getTime(), d.getTime());
    assert.equal(bkp.dataDoNome("outro-arquivo.fenixbak"), null);
  });
});

describe("fazer backup", () => {
  test("gera cópia cifrada, íntegra, sem arquivos auxiliares", () => {
    const r = bkp.fazerBackup(db, arquivoBanco, CHAVE, pastaBkp, new Date(2026, 10, 23, 10, 0, 0));
    assert.equal(r.nome, "fenix-backup-2026-11-23_100000.fenixbak");
    assert.equal(r.contagens.doadores, 1);
    assert.deepEqual(fs.readdirSync(pastaBkp), [r.nome], "só o arquivo final (sem .parcial, -wal, -shm)");
    const bruto = fs.readFileSync(r.arquivo);
    assert.ok(!bruto.includes(Buffer.from("SQLite format 3")), "cabeçalho em claro");
    assert.ok(!bruto.includes(Buffer.from("Doador Fictício Backup")), "nome em claro");
    assert.ok(!bruto.includes(Buffer.from("000.000.000-00")), "CPF em claro");
  });

  test("inclui dados gravados há pouco (diário WAL)", () => {
    repo.inserir("doador_novo", { nome: "Gravado Agora" });
    const r = bkp.fazerBackup(db, arquivoBanco, CHAVE, pastaBkp);
    assert.equal(r.contagens.doadores, 2);
  });

  test("dois backups no mesmo segundo não se sobrescrevem", () => {
    const agora = new Date(2026, 10, 23, 10, 0, 0);
    const a = bkp.fazerBackup(db, arquivoBanco, CHAVE, pastaBkp, agora);
    const b = bkp.fazerBackup(db, arquivoBanco, CHAVE, pastaBkp, agora);
    assert.notEqual(a.nome, b.nome);
    assert.equal(bkp.listarBackups(pastaBkp).length, 2);
  });

  test("pasta inacessível dá erro claro", () => {
    const arquivoNoLugar = path.join(pasta, "isto-e-um-arquivo");
    fs.writeFileSync(arquivoNoLugar, "x");
    assert.throws(() => bkp.fazerBackup(db, arquivoBanco, CHAVE, path.join(arquivoNoLugar, "sub")), {
      code: "PASTA_INACESSIVEL",
    });
  });

  test("o banco continua funcionando depois do backup", () => {
    bkp.fazerBackup(db, arquivoBanco, CHAVE, pastaBkp);
    assert.equal(repo.inserir("doador_novo", { nome: "Depois" }).error, null);
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  });
});

describe("retenção de 30 dias", () => {
  test("apaga só backups com mais de 30 dias e mantém o mais recente", () => {
    fs.mkdirSync(pastaBkp, { recursive: true });
    const agora = new Date(2026, 10, 23, 12, 0, 0);
    const dias = [0, 1, 29, 31, 45];
    dias.forEach((d) => {
      const data = new Date(agora.getTime() - d * 86400000);
      fs.writeFileSync(path.join(pastaBkp, bkp.nomeBackup(data)), "x");
    });
    fs.writeFileSync(path.join(pastaBkp, "documento-do-usuario.xlsx"), "nao apagar");
    const removidos = bkp.limparBackupsAntigos(pastaBkp, 30, agora);
    assert.equal(removidos.length, 2);
    assert.equal(bkp.listarBackups(pastaBkp).length, 3);
    assert.ok(fs.existsSync(path.join(pastaBkp, "documento-do-usuario.xlsx")), "não mexe em outros arquivos");
  });

  test("nunca apaga o único backup, mesmo antigo", () => {
    fs.mkdirSync(pastaBkp, { recursive: true });
    fs.writeFileSync(path.join(pastaBkp, bkp.nomeBackup(new Date(2020, 0, 1))), "x");
    assert.deepEqual(bkp.limparBackupsAntigos(pastaBkp, 30, new Date(2026, 10, 23)), []);
  });
});

describe("restauração", () => {
  test("restaura dados de um backup feito com a mesma chave", () => {
    const r = bkp.fazerBackup(db, arquivoBanco, CHAVE, pastaBkp);
    repo.inserir("doador_novo", { nome: "Depois do backup" });
    db.close();

    const prep = bkp.prepararRestauracao(r.arquivo, [CHAVE]);
    assert.equal(prep.chave, CHAVE);
    assert.equal(prep.contagens.doadores, 1);
    assert.equal(prep.versao, VERSAO_ESQUEMA);
    bkp.substituirBanco(arquivoBanco, prep.arquivoTemp);
    prep.limpar();

    db = abrirBanco(arquivoBanco, CHAVE);
    const nomes = criarRepositorio(db).listar("doador_novo").data.map((d) => d.nome);
    assert.deepEqual(nomes, ["Doador Fictício Backup"]);
    assert.ok(fs.readdirSync(path.dirname(arquivoBanco)).some((f) => f.includes("antes-restauracao")));
    assert.ok(fs.existsSync(r.arquivo), "o arquivo de backup original não é alterado");
  });

  test("backup de outro computador pede a chave dele", () => {
    const outroArquivo = path.join(pasta, "outro", "fenix.db");
    const outroDb = abrirBanco(outroArquivo, OUTRA);
    criarRepositorio(outroDb).inserir("doador_novo", { nome: "Do outro PC" });
    const r = bkp.fazerBackup(outroDb, outroArquivo, OUTRA, pastaBkp);
    outroDb.close();

    assert.throws(() => bkp.prepararRestauracao(r.arquivo, [CHAVE]), { code: "CHAVE_BACKUP" });
    const prep = bkp.prepararRestauracao(r.arquivo, [CHAVE, OUTRA]);
    assert.equal(prep.chave, OUTRA);
    assert.equal(prep.contagens.doadores, 1);
    prep.limpar();
  });

  test("arquivo que não é backup é recusado", () => {
    const falso = path.join(pasta, "falso.fenixbak");
    fs.writeFileSync(falso, Buffer.alloc(8192, 7));
    assert.throws(() => bkp.prepararRestauracao(falso, [CHAVE]), { code: "CHAVE_BACKUP" });
  });

  test("backup de versão mais nova do programa é recusado", () => {
    db.prepare("INSERT INTO schema_migrations (versao, nome) VALUES (?, 'futura')").run(VERSAO_ESQUEMA + 10);
    const r = bkp.fazerBackup(db, arquivoBanco, CHAVE, pastaBkp);
    assert.throws(() => bkp.prepararRestauracao(r.arquivo, [CHAVE]), { code: "VERSAO_NOVA" });
  });
});
