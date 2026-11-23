// Processo principal do Electron: cria a janela do programa e liga a camada de dados.
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, shell, session } = require("electron");
const { registrarCanais, fecharDados } = require("./ipc");

const RAIZ_APP = path.join(__dirname, "..");
// Prefixo file:// da pasta do programa (com barra final para não aceitar pastas "irmãs").
const PREFIXO_APP = pathToFileURL(RAIZ_APP + path.sep).href.toLowerCase();

// Pasta do programa no %APPDATA% (sem acento, para evitar problemas de caminho).
// Em desenvolvimento/testes, FENIX_PASTA_DADOS isola os dados (ignorado no instalador).
app.setPath(
  "userData",
  process.env.FENIX_PASTA_DADOS && !app.isPackaged
    ? path.resolve(process.env.FENIX_PASTA_DADOS)
    : path.join(app.getPath("appData"), "FenixConecta"),
);

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
    if (!dentroDoApp(url)) {
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

function dentroDoApp(url) {
  return String(url).toLowerCase().startsWith(PREFIXO_APP);
}

// Modo offline garantido: a janela só lê arquivos da pasta do programa.
// Qualquer pedido à internet (ou a outro arquivo do disco) é cancelado, mesmo que
// algum código tente — os dados pessoais nunca saem por aqui.
function bloquearRede() {
  session.defaultSession.webRequest.onBeforeRequest((detalhes, responder) => {
    const url = detalhes.url;
    const permitido =
      dentroDoApp(url) ||
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      url.startsWith("devtools:");
    if (!permitido) console.warn("[rede bloqueada]", url.slice(0, 120));
    responder({ cancel: !permitido });
  });

  // Câmera, microfone, localização, notificações etc.: negados.
  // Exceção: copiar texto (chave de recuperação, mensagem de lembrete).
  const PERMITIDAS = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permissao, responder) =>
    responder(PERMITIDAS.has(permissao)),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permissao) => PERMITIDAS.has(permissao));
}

app.on("second-instance", () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

app.whenReady().then(() => {
  bloquearRede();
  registrarCanais();
  criarJanela();
});

app.on("window-all-closed", () => {
  fecharDados();
  app.quit();
});
