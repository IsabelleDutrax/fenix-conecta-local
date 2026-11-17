// Processo principal do Electron: cria a janela do programa e liga a camada de dados.
const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");
const { registrarCanaisDados, fecharDados } = require("./ipc-dados");

// Pasta do programa no %APPDATA% (sem acento, para evitar problemas de caminho).
app.setPath("userData", path.join(app.getPath("appData"), "FenixConecta"));

// Uma única instância: abrir duas vezes o mesmo banco pode corromper dados.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Fênix Conecta",
    icon: path.join(__dirname, "..", "img", "favicon_io", "android-chrome-512x512.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Links externos (mailto:, http:) abrem fora do programa; a janela nunca sai do index.html.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    abrirExterno(url);
    return { action: "deny" };
  });
  janela.webContents.on("will-navigate", (evento, url) => {
    if (!url.startsWith("file://")) {
      evento.preventDefault();
      abrirExterno(url);
    }
  });

  janela.once("ready-to-show", () => janela.show());
  janela.loadFile(path.join(__dirname, "..", "index.html"));
}

function abrirExterno(url) {
  if (/^(mailto:|https:)/i.test(url)) shell.openExternal(url);
}

app.on("second-instance", () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

app.whenReady().then(() => {
  registrarCanaisDados();
  criarJanela();
});

app.on("window-all-closed", () => {
  fecharDados();
  app.quit();
});
