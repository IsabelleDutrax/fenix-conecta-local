// Ponte segura entre a tela e o processo principal (contextIsolation ligado).
// A tela só enxerga estas 5 funções; não tem acesso ao Node, ao disco nem ao SQL.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dados", {
  listar: (tabela) => ipcRenderer.invoke("dados:listar", tabela),
  obter: (tabela, id) => ipcRenderer.invoke("dados:obter", tabela, id),
  inserir: (tabela, registro) => ipcRenderer.invoke("dados:inserir", tabela, registro),
  atualizar: (tabela, id, alteracoes) =>
    ipcRenderer.invoke("dados:atualizar", tabela, id, alteracoes),
  excluir: (tabela, id) => ipcRenderer.invoke("dados:excluir", tabela, id),
});
