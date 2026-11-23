// Serviço de backup e exportação no processo principal.
// - Backup cifrado diário na pasta do OneDrive (ou Documentos, se não houver OneDrive), 30 dias.
// - Lembrete semanal de cópia em pendrive (administrador).
// - Restaurar backup (administrador, com senha), sempre fazendo antes uma cópia dos dados atuais.
// - Exportar Excel de consulta (administrador).
const fs = require("node:fs");
const path = require("node:path");
const { app, dialog, shell, BrowserWindow } = require("electron");
const bkp = require("../src/dados/backup");
const { gerarExcelConsulta, nomeExcelConsulta } = require("../src/dados/excel");
const { criarConfiguracao } = require("../src/dados/configuracao");

const NOME_PASTA = "Backup Fenix Conecta";
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const RETENCAO_DIAS = 30;
const INTERVALO_PENDRIVE_DIAS = 7;

function erro(mensagem, code) {
  const e = new Error(mensagem);
  e.code = code;
  return e;
}

const emTeste = () => !app.isPackaged;

function detectarOneDrive() {
  const candidatos = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial];
  return candidatos.find((p) => p && fs.existsSync(p)) || null;
}

function pastaPadrao() {
  if (emTeste() && process.env.FENIX_PASTA_BACKUP) {
    return { pasta: path.resolve(process.env.FENIX_PASTA_BACKUP), tipo: "teste" };
  }
  const onedrive = detectarOneDrive();
  if (onedrive) return { pasta: path.join(onedrive, NOME_PASTA), tipo: "onedrive" };
  return { pasta: path.join(app.getPath("documents"), NOME_PASTA), tipo: "documentos" };
}

const mesmoDia = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function janela() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

// Diálogos nativos. Em desenvolvimento, FENIX_TESTE_DIALOGO (uma pasta) responde sozinho,
// para os testes automáticos rodarem sem clique humano. Ignorado no instalador.
const dialogos = {
  async escolherPasta(titulo, padrao) {
    if (emTeste() && process.env.FENIX_TESTE_DIALOGO) return process.env.FENIX_TESTE_DIALOGO;
    const r = await dialog.showOpenDialog(janela(), {
      title: titulo,
      defaultPath: padrao,
      properties: ["openDirectory", "createDirectory"],
    });
    return r.canceled ? null : r.filePaths[0];
  },
  async escolherBackup(padrao) {
    if (emTeste() && process.env.FENIX_TESTE_ARQUIVO) return process.env.FENIX_TESTE_ARQUIVO;
    const r = await dialog.showOpenDialog(janela(), {
      title: "Escolha o arquivo de backup",
      defaultPath: padrao,
      filters: [{ name: "Backup Fênix Conecta", extensions: ["fenixbak"] }],
      properties: ["openFile"],
    });
    return r.canceled ? null : r.filePaths[0];
  },
  async salvarExcel(padrao) {
    if (emTeste() && process.env.FENIX_TESTE_DIALOGO) {
      return path.join(process.env.FENIX_TESTE_DIALOGO, path.basename(padrao));
    }
    const r = await dialog.showSaveDialog(janela(), {
      title: "Salvar cópia de consulta (Excel)",
      defaultPath: padrao,
      filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
    });
    return r.canceled ? null : r.filePath;
  },
};

/**
 * @param ctx funções do ipc.js: db(), chave(), arquivoBanco(), sessao(), exigirSessao(),
 *            exigirAdmin(), conferirSenha(senha), fecharBanco(), reabrirBanco(chave),
 *            salvarChave(chave), formatarChave(texto), encerrarSessao()
 */
function criarServicoBackup(ctx) {
  let temporizador = null;
  let pendente = null; // restauração em preparação
  let ultimoExcel = null;

  const cfg = () => criarConfiguracao(ctx.db());

  function pastaAtual() {
    const personalizada = cfg().obter("pasta_backup");
    return personalizada ? { pasta: personalizada, tipo: "personalizada" } : pastaPadrao();
  }

  // registrar: grava "último backup" e aplica a retenção de 30 dias (backup principal).
  // registrarErro: mostra a falha no rodapé (não usar ao testar uma pasta nova).
  function executar(pastaDestino = pastaAtual().pasta, { registrar = true, registrarErro = registrar } = {}) {
    const c = cfg();
    try {
      const r = bkp.fazerBackup(ctx.db(), ctx.arquivoBanco(), ctx.chave(), pastaDestino);
      if (registrar) {
        c.definir("ultimo_backup", r.data);
        c.definir("ultimo_backup_arquivo", r.arquivo);
        c.definir("ultimo_erro_backup", null);
        r.removidos = bkp.limparBackupsAntigos(pastaDestino, RETENCAO_DIAS);
      }
      return r;
    } catch (e) {
      if (registrarErro) {
        c.definir("ultimo_erro_backup", JSON.stringify({ data: new Date().toISOString(), mensagem: e.message }));
      }
      throw e.code ? e : erro(`Falha no backup: ${e.message}`, "BACKUP_FALHOU");
    }
  }

  // Backup automático: uma vez por dia (no primeiro uso do dia), depois de existir um usuário.
  function verificarAgenda() {
    try {
      if (!ctx.db() || ctx.contarUsuarios() === 0) return;
      const ultimo = cfg().obter("ultimo_backup");
      if (ultimo && mesmoDia(new Date(ultimo), new Date())) return;
      executar();
    } catch (e) {
      console.error("[backup automático]", e.message);
    }
  }

  function aoAbrirBanco() {
    verificarAgenda();
    if (!temporizador) {
      temporizador = setInterval(verificarAgenda, HORA_MS);
      temporizador.unref?.();
    }
  }

  function parar() {
    if (temporizador) clearInterval(temporizador);
    temporizador = null;
    if (pendente && pendente.limpar) pendente.limpar();
    pendente = null;
  }

  function status() {
    ctx.exigirSessao();
    const c = cfg();
    const { pasta, tipo } = pastaAtual();
    const ultimo = c.obter("ultimo_backup");
    const erroTxt = c.obter("ultimo_erro_backup");
    const erroObj = erroTxt ? JSON.parse(erroTxt) : null;
    const agora = Date.now();
    const atrasado = !ultimo || agora - new Date(ultimo).getTime() > 2 * DIA_MS;

    let lembrarPendrive = false;
    const sessao = ctx.sessao();
    if (sessao.admin && ultimo) {
      const ultimoPendrive = c.obter("ultimo_pendrive");
      const adiadoAte = c.obter("lembrete_pendrive_adiado_ate");
      const venceu = !ultimoPendrive || agora - new Date(ultimoPendrive).getTime() >= INTERVALO_PENDRIVE_DIAS * DIA_MS;
      const adiado = adiadoAte && new Date(adiadoAte).getTime() > agora;
      lembrarPendrive = venceu && !adiado;
    }
    return {
      ultimo,
      arquivo: c.obter("ultimo_backup_arquivo"),
      pasta,
      tipoPasta: tipo,
      erro: erroObj,
      atrasado,
      ultimoPendrive: c.obter("ultimo_pendrive"),
      lembrarPendrive,
      retencaoDias: RETENCAO_DIAS,
    };
  }

  function resumoPendente() {
    if (!pendente) return null;
    return {
      nome: path.basename(pendente.origem),
      data: bkp.dataDoNome(path.basename(pendente.origem))?.toISOString() || null,
      precisaChave: !pendente.arquivoTemp,
      contagens: pendente.contagens || null,
      outraChave: pendente.arquivoTemp ? pendente.chave !== ctx.chave() : false,
    };
  }

  function descartarPendente() {
    if (pendente && pendente.limpar) pendente.limpar();
    pendente = null;
  }

  function analisar(origem, chavesCandidatas) {
    descartarPendente();
    try {
      pendente = { origem, ...bkp.prepararRestauracao(origem, chavesCandidatas) };
    } catch (e) {
      if (e.code !== "CHAVE_BACKUP") throw e;
      pendente = { origem }; // precisa da chave de recuperação de outro computador
    }
    return resumoPendente();
  }

  const handlers = {
    "backup:status": () => status(),

    "backup:fazerAgora": () => {
      ctx.exigirSessao();
      const r = executar();
      return { nome: r.nome, pasta: path.dirname(r.arquivo), removidos: r.removidos.length, status: status() };
    },

    "backup:copiarPendrive": async () => {
      ctx.exigirAdmin();
      const destino = await dialogos.escolherPasta("Escolha o pendrive (ou uma pasta dentro dele)");
      if (!destino) return null;
      const r = executar(destino, { registrar: false });
      const c = cfg();
      c.definir("ultimo_pendrive", new Date().toISOString());
      c.definir("lembrete_pendrive_adiado_ate", null);
      // Compara só a letra do disco (C:, D:...): pendrive nunca está no disco do Windows.
      const discoSistema = (process.env.SystemDrive || "C:").slice(0, 2).toUpperCase();
      const mesmoDisco = path.resolve(destino).slice(0, 2).toUpperCase() === discoSistema;
      return { arquivo: r.arquivo, avisoMesmoDisco: mesmoDisco, status: status() };
    },

    "backup:adiarLembrete": () => {
      ctx.exigirAdmin();
      cfg().definir("lembrete_pendrive_adiado_ate", new Date(Date.now() + DIA_MS).toISOString());
      return true;
    },

    "backup:escolherPasta": async () => {
      ctx.exigirAdmin();
      const atual = pastaAtual().pasta;
      const nova = await dialogos.escolherPasta("Escolha a pasta dos backups automáticos", atual);
      if (!nova) return null;
      executar(nova, { registrarErro: false }); // confirma que a pasta funciona antes de gravar a escolha
      cfg().definir("pasta_backup", nova);
      return status();
    },

    "backup:usarPastaPadrao": () => {
      ctx.exigirAdmin();
      cfg().definir("pasta_backup", null);
      executar();
      return status();
    },

    "backup:abrirPasta": async () => {
      ctx.exigirSessao();
      const { pasta } = pastaAtual();
      fs.mkdirSync(pasta, { recursive: true });
      const falhou = await shell.openPath(pasta);
      if (falhou) throw erro(falhou, "ABRIR_PASTA");
      return true;
    },

    "backup:listar": () => {
      ctx.exigirAdmin();
      return bkp.listarBackups(pastaAtual().pasta).map(({ nome, data, tamanho }) => ({ nome, data, tamanho }));
    },

    // Restaurar um backup da lista (só nomes padrão dentro da pasta de backup).
    "backup:analisarDaLista": (nome) => {
      ctx.exigirAdmin();
      if (typeof nome !== "string" || !bkp.dataDoNome(nome) || path.basename(nome) !== nome) {
        throw erro("Backup inválido.", "BACKUP_INVALIDO");
      }
      return analisar(path.join(pastaAtual().pasta, nome), [ctx.chave()]);
    },

    // Restaurar de outro lugar (pendrive, outro computador).
    "backup:analisarArquivo": async () => {
      ctx.exigirAdmin();
      const origem = await dialogos.escolherBackup(pastaAtual().pasta);
      if (!origem) return null;
      return analisar(origem, [ctx.chave()]);
    },

    "backup:informarChave": (texto) => {
      ctx.exigirAdmin();
      if (!pendente) throw erro("Escolha o backup primeiro.", "SEM_BACKUP");
      const chave = ctx.formatarChave(texto);
      if (!chave) throw erro("Chave incompleta: são 64 letras/números (8 grupos de 8).", "CHAVE_FORMATO");
      const origem = pendente.origem;
      try {
        return analisar(origem, [chave]);
      } catch (e) {
        pendente = { origem };
        if (e.code === "CHAVE_BACKUP") throw erro("Chave de recuperação incorreta para este backup.", "CHAVE_INVALIDA");
        throw e;
      }
    },

    "backup:cancelarRestauracao": () => {
      descartarPendente();
      return true;
    },

    "backup:confirmarRestauracao": (senha) => {
      ctx.exigirAdmin();
      if (!pendente || !pendente.arquivoTemp) throw erro("Escolha e confira o backup primeiro.", "SEM_BACKUP");
      if (!ctx.conferirSenha(senha)) throw erro("Senha incorreta.", "CREDENCIAIS");

      // 1) Cópia de segurança dos dados atuais (se falhar, nada é alterado).
      const seguranca = executar();
      const chaveAnterior = ctx.chave();
      const restaurado = pendente;
      pendente = null;

      // 2) Troca o arquivo e reabre.
      ctx.fecharBanco();
      try {
        bkp.substituirBanco(ctx.arquivoBanco(), restaurado.arquivoTemp);
        ctx.reabrirBanco(restaurado.chave);
        if (restaurado.chave !== chaveAnterior) ctx.salvarChave(restaurado.chave);
      } catch (e) {
        // Volta ao estado anterior a partir da cópia de segurança.
        console.error("[restauração] falhou, voltando dados anteriores:", e);
        try {
          ctx.fecharBanco();
        } catch {}
        const volta = bkp.prepararRestauracao(seguranca.arquivo, [chaveAnterior]);
        bkp.substituirBanco(ctx.arquivoBanco(), volta.arquivoTemp);
        volta.limpar();
        ctx.reabrirBanco(chaveAnterior);
        throw erro("Não foi possível restaurar. Os dados anteriores foram mantidos.", "RESTAURACAO_FALHOU");
      } finally {
        restaurado.limpar();
      }

      // 3) O banco restaurado não conhece o backup de segurança: registra.
      const c = cfg();
      c.definir("ultimo_backup", seguranca.data);
      c.definir("ultimo_backup_arquivo", seguranca.arquivo);
      c.definir("ultimo_erro_backup", null);
      ctx.encerrarSessao();
      return { backupDeSeguranca: seguranca.nome, contagens: restaurado.contagens };
    },

    "exportar:excel": async () => {
      ctx.exigirAdmin();
      const padrao = path.join(app.getPath("documents"), nomeExcelConsulta());
      const destino = await dialogos.salvarExcel(padrao);
      if (!destino) return null;
      const r = await gerarExcelConsulta(ctx.db(), destino, { geradoPor: ctx.sessao().nome });
      ultimoExcel = r.arquivo;
      return r;
    },

    "exportar:mostrarExcel": () => {
      ctx.exigirSessao();
      if (ultimoExcel && fs.existsSync(ultimoExcel)) shell.showItemInFolder(ultimoExcel);
      return true;
    },
  };

  return { aoAbrirBanco, verificarAgenda, parar, handlers };
}

module.exports = { criarServicoBackup };
