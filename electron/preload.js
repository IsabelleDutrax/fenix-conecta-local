// Ponte segura entre a tela e o processo principal (contextIsolation ligado).
// A tela só enxerga estas funções; não tem acesso ao Node, ao disco nem ao SQL.
// Todas devolvem { data, error }.
const { contextBridge, ipcRenderer } = require("electron");

const chamar = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld("dados", {
  listar: chamar("dados:listar"),
  obter: chamar("dados:obter"),
  inserir: chamar("dados:inserir"),
  atualizar: chamar("dados:atualizar"),
  excluir: chamar("dados:excluir"),
});

contextBridge.exposeInMainWorld("sessao", {
  estado: chamar("sessao:estado"),
  primeiroAcesso: chamar("sessao:primeiroAcesso"),
  entrar: chamar("sessao:entrar"),
  sair: chamar("sessao:sair"),
  atual: chamar("sessao:atual"),
  recuperar: chamar("sessao:recuperar"),
  verChaveRecuperacao: chamar("sessao:verChaveRecuperacao"),
  alterarMinhaSenha: chamar("sessao:alterarMinhaSenha"),
});

contextBridge.exposeInMainWorld("backup", {
  status: chamar("backup:status"),
  fazerAgora: chamar("backup:fazerAgora"),
  copiarPendrive: chamar("backup:copiarPendrive"),
  adiarLembrete: chamar("backup:adiarLembrete"),
  escolherPasta: chamar("backup:escolherPasta"),
  usarPastaPadrao: chamar("backup:usarPastaPadrao"),
  abrirPasta: chamar("backup:abrirPasta"),
  listar: chamar("backup:listar"),
  analisarDaLista: chamar("backup:analisarDaLista"),
  analisarArquivo: chamar("backup:analisarArquivo"),
  informarChave: chamar("backup:informarChave"),
  cancelarRestauracao: chamar("backup:cancelarRestauracao"),
  confirmarRestauracao: chamar("backup:confirmarRestauracao"),
  exportarExcel: chamar("exportar:excel"),
  mostrarExcel: chamar("exportar:mostrarExcel"),
});

contextBridge.exposeInMainWorld("aplicativo", {
  info: chamar("app:info"),
  instalarAtualizacaoAgora: chamar("atualizacao:instalarAgora"),
  // Avisa a tela quando uma atualização terminou de baixar (só repassa a versão).
  aoAtualizacaoPronta: (callback) =>
    ipcRenderer.on("atualizacao:pronta", (_evento, dados) => callback({ versao: String(dados && dados.versao) })),
});

contextBridge.exposeInMainWorld("usuarios", {
  listar: chamar("usuarios:listar"),
  criar: chamar("usuarios:criar"),
  atualizar: chamar("usuarios:atualizar"),
  redefinirSenha: chamar("usuarios:redefinirSenha"),
});
