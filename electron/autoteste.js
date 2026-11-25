// Autoteste do programa INSTALADO (usado na entrega e nos testes do instalador).
//
//   "Fenix Conecta.exe" --verificar-instalacao --saida=C:\caminho\resultado.json
//       [--pasta-dados=C:\pasta\de\teste] [--etapa=criar|conferir]
//   "Fenix Conecta.exe" --testar-atualizacao --saida=C:\caminho\resultado.json
//
// Nunca usa os dados reais: sem --pasta-dados, trabalha numa pasta temporária apagada no fim.
// Sem janela visível. O resultado vai para o arquivo JSON indicado; código de saída 0 = tudo certo.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

function argumento(nome) {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : null;
}

function emModoAutoteste() {
  return process.argv.includes("--verificar-instalacao") || process.argv.includes("--testar-atualizacao");
}

// Precisa rodar ANTES do app ficar pronto (define a pasta de dados).
function prepararPastas() {
  const fixa = argumento("pasta-dados");
  const pasta = fixa ? path.resolve(fixa) : fs.mkdtempSync(path.join(os.tmpdir(), "fenix-autoteste-"));
  fs.mkdirSync(pasta, { recursive: true });
  app.setPath("userData", pasta);
  return { pasta, temporaria: !fixa };
}

async function verificarInstalacao({ pasta, temporaria }, { bloquearRede, registrarCanais, fecharDados, preload, indexHtml }) {
  const resultados = [];
  const marcar = (nome, ok, detalhe = "") => resultados.push({ nome, ok: !!ok, detalhe: String(detalhe) });
  const tentar = async (nome, fn) => {
    try {
      const r = await fn();
      marcar(nome, r !== false, typeof r === "string" ? r : "");
    } catch (e) {
      marcar(nome, false, e && e.message);
    }
  };
  const etapa = argumento("etapa") || "criar";
  const tmpExtra = fs.mkdtempSync(path.join(os.tmpdir(), "fenix-autoteste-arq-"));
  let db = null;

  marcar("versão do programa", true, app.getVersion());
  await tentar("proteção de chave do Windows (DPAPI)", async () => {
    const { safeStorage } = require("electron");
    return await safeStorage.isAsyncEncryptionAvailable();
  });

  const chaves = require("./chave");
  const { abrirBanco, VERSAO_ESQUEMA } = require("../src/dados/banco");
  let chave = null;
  await tentar("chave do banco", async () => {
    chave = (await chaves.lerChave(pasta)) || (await chaves.criarChave(pasta));
    return !!chave;
  });
  await tentar("banco criptografado abre e aplica migrações", async () => {
    db = abrirBanco(path.join(pasta, "dados", "fenix.db"), chave);
    const v = db.prepare("SELECT max(versao) FROM schema_migrations").pluck().get();
    return v === VERSAO_ESQUEMA ? `versão do esquema ${v}` : false;
  });

  if (db) {
    const { criarRepositorio } = require("../src/dados/repositorio");
    const { criarUsuarios } = require("../src/dados/usuarios");
    const repo = criarRepositorio(db);
    if (etapa === "criar") {
      await tentar("gravar dados de teste", async () => {
        const u = criarUsuarios(db);
        if (u.contar() === 0) {
          u.criarPrimeiroAdmin({ nome: "Autoteste", email: "autoteste@exemplo.invalid", senha: "Autoteste#2026" });
        }
        const r = repo.inserir("doador_novo", { nome: "Doador Autoteste", cpf_cnpj: "000.000.000-00" });
        return r.error ? false : `doador ${r.data.id_doador}`;
      });
    } else {
      await tentar("dados de teste continuam lá", async () => {
        const r = repo.listar("doador_novo");
        const n = (r.data || []).filter((d) => d.nome === "Doador Autoteste").length;
        return n > 0 ? `${n} doador(es) de teste encontrados` : false;
      });
    }
    await tentar("arquivo do banco ilegível sem a chave", async () => {
      db.pragma("wal_checkpoint(TRUNCATE)");
      const bruto = fs.readFileSync(path.join(pasta, "dados", "fenix.db"));
      return !bruto.includes(Buffer.from("SQLite format 3")) && !bruto.includes(Buffer.from("Doador Autoteste"));
    });
    await tentar("backup cifrado", async () => {
      const bkp = require("../src/dados/backup");
      const r = bkp.fazerBackup(db, path.join(pasta, "dados", "fenix.db"), chave, path.join(tmpExtra, "backup"));
      const prep = bkp.prepararRestauracao(r.arquivo, [chave]);
      prep.limpar();
      return `${r.nome} (${prep.contagens.doadores} doadores)`;
    });
    await tentar("planilha Excel de consulta", async () => {
      const { gerarExcelConsulta, nomeExcelConsulta } = require("../src/dados/excel");
      const destino = path.join(tmpExtra, nomeExcelConsulta());
      await gerarExcelConsulta(db, destino, { geradoPor: "Autoteste" });
      return fs.statSync(destino).size > 0 ? path.basename(destino) : false;
    });
  }

  await tentar("módulo de atualização automática", async () => {
    require("electron-updater");
    return true;
  });

  // Fecha a conexão do autoteste: a tela abre o banco pelo mesmo caminho do programa real.
  if (db) {
    db.close();
    db = null;
  }

  // Telas: carrega o index.html numa janela invisível, com as mesmas regras de segurança.
  await tentar("telas carregam sem internet (bibliotecas, fontes, ícones, canais)", async () => {
    bloquearRede();
    registrarCanais();
    const janela = new BrowserWindow({
      show: false,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    try {
      await janela.loadFile(indexHtml);
      const r = await janela.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await Promise.all([document.fonts.load('16px "Libre Baskerville"'), document.fonts.load('16px uicons-regular-rounded')]);
        const externos = performance.getEntriesByType("resource").map(e => e.name).filter(n => !n.startsWith("file:"));
        const est = await window.sessao.estado();
        return {
          etapa: est.data && est.data.etapa,
          libs: !!(window.bootstrap && window.Swal && window.Choices && window.jspdf),
          ponte: typeof window.dados === "object" && typeof window.sessao === "object" && typeof window.backup === "object",
          fonte: [...document.fonts].some(f => f.family.includes("Libre Baskerville") && f.status === "loaded"),
          icones: [...document.fonts].some(f => f.family.includes("uicons") && f.status === "loaded"),
          externos,
        };
      })()`);
      const ok = r.libs && r.ponte && r.fonte && r.icones && r.externos.length === 0 && r.etapa === "login";
      if (!ok) throw new Error(JSON.stringify(r).slice(0, 300));
      return `tela inicial: ${r.etapa}`;
    } finally {
      janela.destroy();
    }
  });

  if (db) db.close();
  fecharDados();
  fs.rmSync(tmpExtra, { recursive: true, force: true });
  if (temporaria) {
    // Apaga os dados de teste. Os arquivos do perfil do Chromium ficam em uso até o
    // programa fechar; o que sobrar na pasta temporária não tem dados.
    for (const item of ["dados", "chave.bin", "backups-autoteste"]) {
      fs.rmSync(path.join(pasta, item), { recursive: true, force: true });
    }
    try {
      fs.rmSync(pasta, { recursive: true, force: true });
    } catch {}
  }
  return resultados;
}

// Procura atualização no servidor configurado no instalador, baixa e instala em silêncio.
async function testarAtualizacao() {
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  const r = await autoUpdater.checkForUpdates();
  const encontrada = r && r.updateInfo ? r.updateInfo.version : null;
  const resultado = [
    { nome: "versão instalada", ok: true, detalhe: app.getVersion() },
    { nome: "versão no servidor", ok: !!encontrada, detalhe: encontrada || "nenhuma" },
  ];
  if (encontrada && encontrada !== app.getVersion()) {
    await autoUpdater.downloadUpdate();
    resultado.push({ nome: "download da atualização", ok: true, detalhe: encontrada });
    resultado.instalar = () => autoUpdater.quitAndInstall(true, false);
  }
  return resultado;
}

async function executar(pastas, dependencias) {
  const saida = argumento("saida");
  let resultados;
  try {
    resultados = process.argv.includes("--testar-atualizacao")
      ? await testarAtualizacao()
      : await verificarInstalacao(pastas, dependencias);
  } catch (e) {
    resultados = [{ nome: "autoteste", ok: false, detalhe: e && e.stack }];
  }
  const ok = resultados.every((r) => r.ok);
  const json = JSON.stringify({ ok, data: new Date().toISOString(), resultados }, null, 2);
  if (saida) fs.writeFileSync(saida, json);
  else console.log(json);
  if (resultados.instalar) return resultados.instalar();
  app.exit(ok ? 0 : 1);
}

module.exports = { emModoAutoteste, prepararPastas, executar };
