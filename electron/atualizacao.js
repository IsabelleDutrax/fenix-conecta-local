// Atualização automática pelo GitHub Releases (electron-updater).
// - Só no programa instalado (em desenvolvimento não faz nada).
// - Verifica 10 s após abrir e a cada 6 h; baixa em segundo plano.
// - Instala ao fechar o programa, ou na hora, se o usuário clicar em "Reiniciar e atualizar".
// - Antes de instalar, faz um backup dos dados (o banco pode ganhar migrações novas).
// - Sem internet: falha em silêncio e tenta de novo depois. O uso diário não depende disso.
// O electron-updater usa uma sessão de rede própria ("electron-updater"); o bloqueio de
// internet da janela (main.js) continua valendo para as telas.
const path = require("node:path");
const fs = require("node:fs");
const { app, ipcMain, shell } = require("electron");

// Manual do usuário (PDF): no instalador fica em resources/; em desenvolvimento, em docs/.
function caminhoManual() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "Manual-Fenix-Conecta.pdf")
    : path.join(__dirname, "..", "docs", "Manual-Fenix-Conecta.pdf");
}

const SEIS_HORAS = 6 * 60 * 60 * 1000;

function criarAtualizacao({ obterJanela, antesDeInstalar }) {
  let versaoPronta = null;
  let autoUpdater = null;

  function avisarTela() {
    const janela = obterJanela();
    if (janela && versaoPronta) janela.webContents.send("atualizacao:pronta", { versao: versaoPronta });
  }

  function iniciar() {
    if (!app.isPackaged) return;
    ({ autoUpdater } = require("electron-updater"));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info() {}, warn: console.warn, error: console.warn, debug() {} };

    autoUpdater.on("update-downloaded", (info) => {
      versaoPronta = info.version;
      avisarTela();
    });
    autoUpdater.on("error", (e) => console.warn("[atualização]", e && e.message));

    const verificar = () =>
      autoUpdater.checkForUpdates().catch((e) => console.warn("[atualização]", e && e.message));
    setTimeout(verificar, 10 * 1000).unref?.();
    setInterval(verificar, SEIS_HORAS).unref?.();
  }

  function registrarCanais(origemValida) {
    ipcMain.handle("app:info", (evento) => {
      if (!origemValida(evento)) return { data: null, error: { message: "Origem não autorizada.", code: "ORIGEM" } };
      return { data: { versao: app.getVersion(), atualizacaoPronta: versaoPronta }, error: null };
    });
    ipcMain.handle("app:abrirManual", async (evento) => {
      if (!origemValida(evento)) return { data: null, error: { message: "Origem não autorizada.", code: "ORIGEM" } };
      const arquivo = caminhoManual();
      if (!fs.existsSync(arquivo)) return { data: null, error: { message: "Manual não encontrado.", code: "SEM_MANUAL" } };
      const falha = await shell.openPath(arquivo); // abre no leitor de PDF do Windows
      return falha ? { data: null, error: { message: falha, code: "ABRIR_MANUAL" } } : { data: true, error: null };
    });
    ipcMain.handle("atualizacao:instalarAgora", (evento) => {
      if (!origemValida(evento)) return { data: null, error: { message: "Origem não autorizada.", code: "ORIGEM" } };
      if (!autoUpdater || !versaoPronta) {
        return { data: null, error: { message: "Nenhuma atualização pronta.", code: "SEM_ATUALIZACAO" } };
      }
      antesDeInstalar();
      // Instala em modo silencioso e abre o programa de novo.
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
      return { data: true, error: null };
    });
  }

  return {
    iniciar,
    registrarCanais,
    avisarTela,
    temAtualizacaoPronta: () => !!versaoPronta,
  };
}

module.exports = { criarAtualizacao, caminhoManual };
