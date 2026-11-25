// Converte um HTML do manual em PDF A4 (Electron printToPDF). Usado por scripts/gerar-manual.js.
// Uso: electron gerar-pdf.js <arquivo.html> <arquivo.pdf> "<rodapé>"
const fs = require("node:fs");
const { app, BrowserWindow } = require("electron");

const [html, pdf, rodape] = process.argv.slice(-3);

app.whenReady().then(async () => {
  const janela = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await janela.loadFile(html);
    await janela.webContents.executeJavaScript(
      "Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => document.fonts.ready).then(() => 1)",
    );
    const dados = await janela.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { marginType: "custom", top: 0.55, bottom: 0.7, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:7.5px;color:#666;width:100%;text-align:center;">
        ${rodape} — página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
    });
    fs.writeFileSync(pdf, dados);
    console.log(`PDF gerado: ${pdf} (${Math.round(dados.length / 1024)} KB)`);
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
