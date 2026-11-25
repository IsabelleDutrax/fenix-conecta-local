// Processo principal do Electron: cria a janela do programa e liga a camada de dados.
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, shell, session } = require("electron");
const { registrarCanais, fecharDados, backupAntesDeAtualizar, origemValida } = require("./ipc");
const { criarAtualizacao } = require("./atualizacao");
const autoteste = require("./autoteste");

const RAIZ_APP = path.join(__dirname, "..");
const INDEX_HTML = path.join(RAIZ_APP, "index.html");
const PRELOAD = path.join(__dirname, "preload.js");
// Prefixo file:// da pasta do programa (com barra final para não aceitar pastas "irmãs").
const PREFIXO_APP = pathToFileURL(RAIZ_APP + path.sep).href.toLowerCase();

const MODO_AUTOTESTE = autoteste.emModoAutoteste();
let pastasAutoteste = null;

if (MODO_AUTOTESTE) {
  // Autoteste do programa instalado: pasta própria, nunca os dados reais.
  pastasAutoteste = autoteste.prepararPastas();
} else {
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
}

let janela = null;

const atualizacao = criarAtualizacao({
  obterJanela: () => janela,
  antesDeInstalar: () => {
    backupAntesDeAtualizar();
    fecharDados();
  },
});

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Fênix Conecta",
    icon: path.join(RAIZ_APP, "img", "favicon_io", "android-chrome-512x512.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: PRELOAD,
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
  // Se a atualização já estava baixada quando a tela abriu (ou recarregou), avisa de novo.
  janela.webContents.on("did-finish-load", () => atualizacao.avisarTela());

  janela.once("ready-to-show", () => janela.show());
  janela.on("closed", () => (janela = null));
  janela.loadFile(INDEX_HTML);
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
// (A atualização automática usa outra sessão de rede, só no processo principal.)
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

if (MODO_AUTOTESTE) {
  app.whenReady().then(() =>
    autoteste.executar(pastasAutoteste, {
      bloquearRede,
      registrarCanais: () => {
        registrarCanais();
        atualizacao.registrarCanais(origemValida);
      },
      fecharDados,
      preload: PRELOAD,
      indexHtml: INDEX_HTML,
    }),
  );
} else {
  app.on("second-instance", () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(() => {
    bloquearRede();
    registrarCanais();
    atualizacao.registrarCanais(origemValida);
    criarJanela();
    atualizacao.iniciar();
  });

  app.on("window-all-closed", () => app.quit());

  // Fecha o banco com segurança em qualquer saída (inclusive quando o atualizador fecha o programa).
  // Se uma atualização vai ser instalada ao fechar, faz um backup antes.
  app.on("will-quit", () => {
    if (atualizacao.temAtualizacaoPronta()) backupAntesDeAtualizar();
    fecharDados();
  });
}
