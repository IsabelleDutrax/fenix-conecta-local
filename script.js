// Dados locais: window.dados é exposto pelo electron/preload.js (banco SQLite criptografado).
// Cada função retorna { data, error }, no mesmo formato usado antes com o Supabase.
// Uso: dados.listar(tabela), dados.obter(tabela, id), dados.inserir(tabela, registro),
//      dados.atualizar(tabela, id, alteracoes), dados.excluir(tabela, id).

// Escapa texto digitado pelo usuário antes de inserir no HTML (evita injeção de código).
function esc(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let currentUser = null;
let isAdmin = false;

// Cache local dos últimos dados carregados, usado pelo Dashboard
let doadoresData = [];
let doacoesData = [];
let interacoesData = [];

// Alternar visualização das páginas:
function showLogin() {
  document.getElementById("login-page").classList.remove("hidden");
  document.getElementById("app-shell").classList.add("hidden");
}

function showSystem() {
  document.getElementById("login-page").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
}

// Avisos curtos no canto da tela (mesmo padrão visual do sistema)
function aviso(icon, title, text) {
  return Swal.fire({
    icon,
    title,
    text,
    position: "top-end",
    showConfirmButton: false,
    timer: icon === "error" ? 2500 : 1500,
    timerProgressBar: true,
    toast: true,
    animation: true,
  });
}

// --------------
// INICIALIZAÇÃO, LOGIN E PRIMEIRO ACESSO
// Toda a regra de acesso fica no processo principal (electron/ipc.js); a tela só mostra.
// --------------

const PAINEIS_LOGIN = [
  "painel-carregando",
  "painel-primeiro-acesso",
  "painel-chave",
  "painel-recuperar",
  "auth-section",
];

function mostrarPainelLogin(id) {
  PAINEIS_LOGIN.forEach((p) =>
    document.getElementById(p).classList.toggle("hidden", p !== id),
  );
  // Telas com mais texto usam um cartão mais largo
  document
    .getElementById("login-card")
    .classList.toggle("login-card-largo", id !== "auth-section");
  showLogin();
  const primeiroCampo = document.querySelector(`#${id} input`);
  if (primeiroCampo) primeiroCampo.focus();
}

async function iniciarSistema() {
  const { data, error } = await sessao.estado();
  if (error) {
    mostrarPainelLogin("painel-carregando");
    document.querySelector("#painel-carregando .painel-texto").textContent =
      "Não foi possível abrir os dados: " + error.message;
    return;
  }
  if (data.etapa === "recuperar") return mostrarPainelLogin("painel-recuperar");
  if (data.etapa === "primeiro_acesso")
    return mostrarPainelLogin("painel-primeiro-acesso");
  if (data.etapa === "logado") return entrarNoSistema(data.usuario);
  mostrarPainelLogin("auth-section");
}

async function signIn() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) return aviso("error", "Informe e-mail e senha");

  const { data, error } = await sessao.entrar(email, password);
  if (error) return aviso("error", error.message);

  document.getElementById("password").value = "";
  toggleSenhaBtn();
  entrarNoSistema(data);
  aviso("success", "Bem-vindo(a)!", data.nome);
}

// Abre o sistema para o usuário autenticado e ajusta o que ele pode ver.
function entrarNoSistema(usuario) {
  currentUser = usuario;
  isAdmin = usuario.admin === true;

  document.getElementById("userEmailDisplay").textContent = usuario.email;
  document.getElementById("userNivelDisplay").textContent = isAdmin
    ? "Administrador"
    : "Usuário comum";
  document
    .querySelectorAll(".somente-admin")
    .forEach((el) => el.classList.toggle("hidden", !isAdmin));

  showSystem();
  showPage("dashboard");
  if (!choicesDoador) initSelectsBuscaDoador();
  loadData();
  atualizarStatusBackup().then(verificarLembretePendrive);
}

async function signOut() {
  await sessao.sair();
  fecharMenuMobile();

  currentUser = null;
  isAdmin = false;
  doadoresData = [];
  doacoesData = [];
  interacoesData = [];
  mostrarPainelLogin("auth-section");
  aviso("success", "Desconectado com sucesso!");
}

// Se a sessão terminou (ex.: programa reaberto), volta ao login.
function tratarSessaoEncerrada(error) {
  if (error && error.code === "SEM_SESSAO") {
    currentUser = null;
    mostrarPainelLogin("auth-section");
    aviso("error", error.message);
    return true;
  }
  return false;
}

let chaveExibida = "";

async function criarPrimeiroAdmin() {
  const nome = document.getElementById("paNome").value.trim();
  const email = document.getElementById("paEmail").value.trim();
  const senha = document.getElementById("paSenha").value;
  const senha2 = document.getElementById("paSenha2").value;

  if (!nome) return aviso("error", "Informe o nome");
  if (!/^\S+@\S+\.\S+$/.test(email)) return aviso("error", "E-mail inválido");
  if (senha.length < 8)
    return aviso("error", "A senha deve ter pelo menos 8 caracteres");
  if (senha !== senha2) return aviso("error", "As senhas não conferem");

  const { data, error } = await sessao.primeiroAcesso({ nome, email, senha });
  if (error) return aviso("error", error.message);

  ["paSenha", "paSenha2"].forEach((id) => (document.getElementById(id).value = ""));
  currentUser = data.usuario;
  mostrarChave(data.chaveRecuperacao);
  mostrarPainelLogin("painel-chave");
}

function mostrarChave(chave) {
  chaveExibida = chave;
  document.getElementById("chaveRecuperacaoTexto").textContent = chave;
  document.getElementById("chaveGuardada").checked = false;
  liberarContinuar(false);
}

function liberarContinuar(liberar) {
  const btn = document.getElementById("btnConcluirChave");
  if (btn) btn.disabled = !liberar;
}

function imprimirChave(chave = chaveExibida) {
  document.getElementById("chaveImpressao").textContent = chave;
  document.getElementById("dataImpressao").textContent =
    new Date().toLocaleDateString("pt-BR");
  window.print();
}

function copiarChave(chave = chaveExibida) {
  navigator.clipboard
    .writeText(chave)
    .then(() => aviso("success", "Chave copiada!"));
}

function concluirPrimeiroAcesso() {
  if (!document.getElementById("chaveGuardada").checked) {
    return aviso("error", "Confirme que guardou a chave de recuperação");
  }
  chaveExibida = "";
  document.getElementById("chaveRecuperacaoTexto").textContent = "";
  entrarNoSistema(currentUser);
}

async function recuperarComChave() {
  const chave = document.getElementById("chaveDigitada").value;
  const { data, error } = await sessao.recuperar(chave);
  if (error) return aviso("error", error.message);
  document.getElementById("chaveDigitada").value = "";
  aviso("success", "Dados abertos com sucesso!");
  if (data.etapa === "primeiro_acesso")
    return mostrarPainelLogin("painel-primeiro-acesso");
  mostrarPainelLogin("auth-section");
}

// Formulário em janela (SweetAlert2) com campos de senha; devolve os valores ou null.
async function pedirSenhas(titulo, campos, textoConfirmar = "Salvar") {
  const html = campos
    .map(
      (c, i) => `<label class="form-label d-block text-start mt-2" for="swalCampo${i}">${esc(c)}</label>
        <input type="password" id="swalCampo${i}" class="form-control" autocomplete="off">`,
    )
    .join("");
  const { value, isConfirmed } = await Swal.fire({
    title: titulo,
    html,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: textoConfirmar,
    cancelButtonText: "Cancelar",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-orange me-2", cancelButton: "btn btn-ghost" },
    didOpen: () => document.getElementById("swalCampo0").focus(),
    preConfirm: () => campos.map((_, i) => document.getElementById(`swalCampo${i}`).value),
  });
  return isConfirmed ? value : null;
}

async function alterarMinhaSenha() {
  fecharMenuMobile();
  const valores = await pedirSenhas("Alterar minha senha", [
    "Senha atual",
    "Nova senha (mínimo 8 caracteres)",
    "Repita a nova senha",
  ]);
  if (!valores) return;
  const [atual, nova, nova2] = valores;
  if (nova !== nova2) return aviso("error", "As novas senhas não conferem");
  const { error } = await sessao.alterarMinhaSenha(atual, nova);
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);
  aviso("success", "Senha alterada!");
}

async function verChaveRecuperacao() {
  fecharMenuMobile();
  const valores = await pedirSenhas(
    "Confirme sua senha",
    ["Sua senha de administrador"],
    "Ver chave",
  );
  if (!valores) return;
  const { data: chave, error } = await sessao.verChaveRecuperacao(valores[0]);
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);

  const resultado = await Swal.fire({
    title: "Chave de recuperação",
    html: `<p class="text-start">Guarde em local seguro, longe do computador.</p>
      <div class="chave-recuperacao">${esc(chave)}</div>`,
    showDenyButton: true,
    confirmButtonText: "Fechar",
    denyButtonText: "Imprimir",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-ghost me-2", denyButton: "btn btn-orange" },
  });
  if (resultado.isDenied) imprimirChave(chave);
}

// --------------
// USUÁRIOS (somente administrador; o processo principal também confere)
// --------------
let usuariosData = [];

async function loadUsuarios() {
  if (!isAdmin) return;
  const { data, error } = await usuarios.listar();
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);
  usuariosData = data;

  const tbody = document.querySelector("#usuarioTable tbody");
  tbody.innerHTML = data
    .map(
      (u) => `<tr>
        <td>${esc(u.nome)}${currentUser && u.id_usuario === currentUser.id_usuario ? ' <span class="badge bg-secondary">você</span>' : ""}</td>
        <td>${esc(u.email)}</td>
        <td>${u.admin ? "Administrador" : "Usuário comum"}</td>
        <td><span class="badge ${u.ativo ? "bg-success" : "bg-secondary"}">${u.ativo ? "Ativo" : "Desativado"}</span></td>
        <td>${u.ultimo_login ? formatarDataHora(u.ultimo_login) : "-"}</td>
        <td class="actions-td">
          <div class="actions-content">
            <button type="button" class="btn btn-outline-secondary" title="Editar" data-click="abrirModalUsuario(${u.id_usuario})"><i class="fi fi-rr-pencil"></i></button>
            <button type="button" class="btn btn-outline-secondary" title="Redefinir senha" data-click="redefinirSenhaUsuario(${u.id_usuario})"><i class="fi fi-rr-key"></i></button>
          </div>
        </td>
      </tr>`,
    )
    .join("");
}

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function abrirModalUsuario(id) {
  const u = id ? usuariosData.find((x) => x.id_usuario === id) : null;
  document.getElementById("formUsuario").reset();
  document.getElementById("modalUsuarioLabel").textContent = u
    ? "Editar Usuário"
    : "Novo Usuário";
  document.getElementById("usuarioId").value = u ? u.id_usuario : "";
  document.getElementById("usuarioNome").value = u ? u.nome : "";
  document.getElementById("usuarioEmail").value = u ? u.email : "";
  document.getElementById("usuarioNivel").value = u ? String(u.nivel_acesso) : "1";
  document.getElementById("usuarioAtivo").checked = u ? u.ativo : true;
  // Senha só no cadastro; na edição usa o botão "Redefinir senha"
  document.getElementById("grupoUsuarioSenha").classList.toggle("hidden", !!u);
  document.getElementById("grupoUsuarioAtivo").classList.toggle("hidden", !u);

  bootstrap.Modal.getOrCreateInstance(document.getElementById("modalUsuario")).show();
}

async function salvarUsuario() {
  const id = document.getElementById("usuarioId").value;
  const nome = document.getElementById("usuarioNome").value.trim();
  const email = document.getElementById("usuarioEmail").value.trim();
  const nivel_acesso = Number(document.getElementById("usuarioNivel").value);
  const senha = document.getElementById("usuarioSenha").value;
  const ativo = document.getElementById("usuarioAtivo").checked;

  if (!nome) return aviso("error", "Informe o nome");
  if (!/^\S+@\S+\.\S+$/.test(email)) return aviso("error", "E-mail inválido");
  if (!id && senha.length < 8)
    return aviso("error", "A senha deve ter pelo menos 8 caracteres");

  const { data, error } = id
    ? await usuarios.atualizar(Number(id), { nome, email, nivel_acesso, ativo })
    : await usuarios.criar({ nome, email, senha, nivel_acesso });
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);

  fecharModal("modalUsuario", "formUsuario");
  aviso("success", "Informações salvas!");

  // Se o admin mudou o próprio nível, a tela se ajusta
  if (currentUser && data.id_usuario === currentUser.id_usuario) {
    const { data: atual } = await sessao.atual();
    if (atual) {
      entrarNoSistema(atual);
      if (!atual.admin) return;
    }
    showPage("usuarios");
  }
  loadUsuarios();
}

async function redefinirSenhaUsuario(id) {
  const u = usuariosData.find((x) => x.id_usuario === id);
  if (!u) return;
  const valores = await pedirSenhas(`Nova senha de ${u.nome}`, [
    "Nova senha (mínimo 8 caracteres)",
    "Repita a nova senha",
  ]);
  if (!valores) return;
  if (valores[0] !== valores[1]) return aviso("error", "As senhas não conferem");
  const { error } = await usuarios.redefinirSenha(id, valores[0]);
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);
  aviso("success", "Senha redefinida!");
}

// Exclusão é só para administrador (o processo principal também bloqueia).
function podeExcluir() {
  if (isAdmin) return true;
  aviso("error", "Apenas administradores podem excluir registros.");
  return false;
}

function botaoExcluir(acao) {
  return isAdmin
    ? `<primary-button icon="fi fi-rr-trash" className="btn btn-danger" data-onclick="${acao}"></primary-button>`
    : "";
}

// --------------
// BACKUP E EXCEL (regras no processo principal: electron/backup-servico.js)
// --------------
let statusBackupAtual = null;

function tamanhoLegivel(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

const NOMES_TIPO_PASTA = {
  onedrive: "OneDrive",
  documentos: "Documentos (sem OneDrive)",
  personalizada: "Pasta escolhida",
  teste: "Teste",
};

async function atualizarStatusBackup() {
  const el = document.getElementById("statusBackup");
  if (!currentUser) {
    el.textContent = "";
    return null;
  }
  const { data, error } = await backup.status();
  if (error) return null;
  statusBackupAtual = data;

  let classe = "ok";
  let texto = data.ultimo ? `Último backup: ${formatarDataHora(data.ultimo)}` : "Nenhum backup ainda";
  if (data.erro && (!data.ultimo || data.erro.data > data.ultimo)) {
    classe = "erro";
    texto = "Backup com problema";
  } else if (data.atrasado) {
    classe = "atencao";
  }
  el.className = `status-backup status-${classe}`;
  el.innerHTML = `<i class="fi fi-rr-${classe === "ok" ? "cloud-check" : "cloud-exclamation"}"></i> ${esc(texto)}`;
  el.title = data.erro && classe === "erro" ? data.erro.mensagem : `Pasta: ${data.pasta}`;

  if (!document.getElementById("backup-section").classList.contains("hidden")) preencherPaginaBackup(data);
  return data;
}

function preencherPaginaBackup(s) {
  document.getElementById("bkpUltimo").textContent = s.ultimo ? formatarDataHora(s.ultimo) : "nenhum";
  document.getElementById("bkpRetencao").textContent = s.retencaoDias;
  document.getElementById("bkpPasta").textContent = s.pasta;
  document.getElementById("bkpTipoPasta").textContent = NOMES_TIPO_PASTA[s.tipoPasta] || s.tipoPasta;
  document.getElementById("bkpPendrive").textContent = s.ultimoPendrive ? formatarDataHora(s.ultimoPendrive) : "nunca";
  const erroEl = document.getElementById("bkpErro");
  const mostrarErro = s.erro && (!s.ultimo || s.erro.data > s.ultimo);
  erroEl.classList.toggle("hidden", !mostrarErro);
  erroEl.textContent = mostrarErro ? `Último backup falhou em ${formatarDataHora(s.erro.data)}: ${s.erro.mensagem}` : "";
}

async function loadBackup() {
  if (!isAdmin) return;
  const s = await atualizarStatusBackup();
  if (s) preencherPaginaBackup(s);
  const { data, error } = await backup.listar();
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);
  const tbody = document.querySelector("#backupTable tbody");
  tbody.innerHTML = data.length
    ? data
        .map(
          (b) => `<tr>
        <td>${formatarDataHora(b.data)}</td>
        <td class="small">${esc(b.nome)}</td>
        <td>${tamanhoLegivel(b.tamanho)}</td>
        <td class="actions-td"><div class="actions-content">
          <button type="button" class="btn btn-outline-danger btn-sm" title="Restaurar este backup" data-click="restaurarDaLista('${esc(b.nome)}')"><i class="fi fi-rr-time-past me-1"></i>Restaurar</button>
        </div></td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="text-center text-muted">Nenhum backup nesta pasta</td></tr>`;
}

async function fazerBackupAgora() {
  aviso("info", "Fazendo backup...");
  const { data, error } = await backup.fazerAgora();
  if (error) {
    await atualizarStatusBackup();
    return tratarSessaoEncerrada(error) || aviso("error", "Backup não foi feito", error.message);
  }
  aviso("success", "Backup feito!", data.nome);
  if (isAdmin) loadBackup();
  else atualizarStatusBackup();
}

async function abrirPastaBackup() {
  const { error } = await backup.abrirPasta();
  if (error) aviso("error", error.message);
}

async function escolherPastaBackup() {
  const { data, error } = await backup.escolherPasta();
  if (error) return tratarSessaoEncerrada(error) || aviso("error", "Pasta não alterada", error.message);
  if (!data) return;
  aviso("success", "Pasta alterada e backup feito!");
  loadBackup();
}

async function copiarParaPendrive() {
  await Swal.fire({
    title: "Cópia em pendrive",
    text: "Conecte o pendrive e, na próxima janela, escolha o pendrive (ou uma pasta dentro dele).",
    icon: "info",
    confirmButtonText: "Escolher pendrive",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-orange" },
  });
  const { data, error } = await backup.copiarPendrive();
  if (error) return tratarSessaoEncerrada(error) || aviso("error", "Cópia não foi feita", error.message);
  if (!data) return;
  await Swal.fire({
    icon: data.avisoMesmoDisco ? "warning" : "success",
    title: "Cópia feita!",
    html: `<p class="text-break small">${esc(data.arquivo)}</p>${
      data.avisoMesmoDisco
        ? "<p><strong>Atenção:</strong> a pasta escolhida está no disco do próprio computador, não num pendrive.</p>"
        : "<p>Retire o pendrive com segurança e guarde-o longe do computador.</p>"
    }`,
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-orange" },
  });
  atualizarStatusBackup();
  if (!document.getElementById("backup-section").classList.contains("hidden")) loadBackup();
}

// Lembrete semanal (só administrador): aparece após o login.
async function verificarLembretePendrive(s) {
  if (!isAdmin || !s || !s.lembrarPendrive) return;
  const r = await Swal.fire({
    title: "Hora da cópia em pendrive",
    html: `O backup automático está em dia.<br>Uma vez por semana, faça também uma cópia em <strong>pendrive</strong>
      para proteger os dados se o computador quebrar ou for roubado.<br><small class="text-muted">Última cópia em pendrive: ${
        s.ultimoPendrive ? formatarDataHora(s.ultimoPendrive) : "nunca"
      }</small>`,
    icon: "info",
    showCancelButton: true,
    confirmButtonText: "Copiar agora",
    cancelButtonText: "Lembrar amanhã",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-orange me-2", cancelButton: "btn btn-ghost" },
  });
  if (r.isConfirmed) return copiarParaPendrive();
  await backup.adiarLembrete();
}

async function restaurarDaLista(nome) {
  const { data, error } = await backup.analisarDaLista(nome);
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);
  fluxoRestauracao(data);
}

async function restaurarDeArquivo() {
  const { data, error } = await backup.analisarArquivo();
  if (error) return tratarSessaoEncerrada(error) || aviso("error", error.message);
  if (data) fluxoRestauracao(data);
}

async function fluxoRestauracao(info) {
  // Backup de outro computador: pede a chave de recuperação dele.
  while (info.precisaChave) {
    const r = await Swal.fire({
      title: "Backup de outro computador",
      html: `<p class="text-start">O arquivo <strong>${esc(info.nome)}</strong> foi criado com outra chave.
        Digite a <strong>chave de recuperação</strong> impressa no computador de origem.</p>
        <input id="swalChaveBackup" class="form-control" placeholder="XXXXXXXX-XXXXXXXX-..." autocomplete="off" spellcheck="false">`,
      showCancelButton: true,
      confirmButtonText: "Conferir",
      cancelButtonText: "Cancelar",
      buttonsStyling: false,
      customClass: { confirmButton: "btn btn-orange me-2", cancelButton: "btn btn-ghost" },
      preConfirm: () => document.getElementById("swalChaveBackup").value,
    });
    if (!r.isConfirmed) return backup.cancelarRestauracao();
    const { data, error } = await backup.informarChave(r.value);
    if (error) {
      await aviso("error", error.message);
      continue;
    }
    info = data;
  }

  const c = info.contagens;
  const data = info.data ? formatarDataHora(info.data) : "data desconhecida";
  const confirmacao = await Swal.fire({
    title: "Restaurar backup?",
    icon: "warning",
    html: `<div class="text-start">
      <p>Backup de <strong>${esc(data)}</strong> com ${c.doadores} doadores, ${c.doacoes} doações,
        ${c.interacoes} interações e ${c.usuarios} usuários.</p>
      <p><strong>Os dados atuais serão substituídos por este backup.</strong> Antes disso, o programa faz uma
        cópia de segurança dos dados atuais.</p>
      ${info.outraChave ? "<p>Este backup é de outro computador: a chave de recuperação passa a ser a dele.</p>" : ""}
      <p>Depois da restauração, entre de novo com um usuário <strong>do backup</strong>.</p>
      <label class="form-label" for="swalSenhaRestaurar">Sua senha de administrador</label>
      <input type="password" id="swalSenhaRestaurar" class="form-control" autocomplete="off"></div>`,
    showCancelButton: true,
    confirmButtonText: "Restaurar",
    cancelButtonText: "Cancelar",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-danger me-2", cancelButton: "btn btn-ghost" },
    preConfirm: () => document.getElementById("swalSenhaRestaurar").value,
  });
  if (!confirmacao.isConfirmed) return backup.cancelarRestauracao();

  const { data: r, error } = await backup.confirmarRestauracao(confirmacao.value);
  if (error) return tratarSessaoEncerrada(error) || aviso("error", "Backup não restaurado", error.message);

  currentUser = null;
  isAdmin = false;
  doadoresData = [];
  doacoesData = [];
  interacoesData = [];
  await Swal.fire({
    icon: "success",
    title: "Backup restaurado!",
    html: `Os dados anteriores foram guardados no backup <br><small>${esc(r.backupDeSeguranca)}</small>.<br>Entre novamente.`,
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-orange" },
  });
  iniciarSistema();
}

async function exportarExcel() {
  const confirmacao = await Swal.fire({
    title: "Exportar Excel de consulta",
    icon: "warning",
    html: `<div class="text-start">
      <p>A planilha terá <strong>dados pessoais</strong> (nome, CPF/CNPJ, telefone, e-mail, endereço) e
        <strong>não é protegida por senha</strong>.</p>
      <ul>
        <li>Não envie por e-mail ou WhatsApp.</li>
        <li>Não salve em pendrive ou computador de terceiros.</li>
        <li>Apague o arquivo quando terminar a consulta.</li>
      </ul>
      <p class="mb-0">É uma <strong>cópia para consulta</strong>: alterações na planilha não voltam para o sistema.</p></div>`,
    showCancelButton: true,
    confirmButtonText: "Entendi, exportar",
    cancelButtonText: "Cancelar",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-orange me-2", cancelButton: "btn btn-ghost" },
  });
  if (!confirmacao.isConfirmed) return;

  const { data, error } = await backup.exportarExcel();
  if (error) return tratarSessaoEncerrada(error) || aviso("error", "Planilha não gerada", error.message);
  if (!data) return;
  const r = await Swal.fire({
    icon: "success",
    title: "Planilha gerada!",
    html: `<p class="text-break small">${esc(data.arquivo)}</p>
      <p>${data.registros.doadores} doadores, ${data.registros.doacoes} doações, ${data.registros.interacoes} interações.</p>`,
    showDenyButton: true,
    confirmButtonText: "Fechar",
    denyButtonText: "Mostrar na pasta",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-ghost me-2", denyButton: "btn btn-orange" },
  });
  if (r.isDenied) backup.mostrarExcel();
}

// --------------
// VERSÃO E ATUALIZAÇÃO AUTOMÁTICA (download e instalação no processo principal)
// --------------
async function iniciarInfoAplicativo() {
  const { data } = await aplicativo.info();
  if (!data) return;
  document.querySelectorAll(".versao-app").forEach((el) => (el.textContent = `Versão ${data.versao}`));
  if (data.atualizacaoPronta) mostrarAvisoAtualizacao(data.atualizacaoPronta);
}

function mostrarAvisoAtualizacao(versao) {
  const el = document.getElementById("avisoAtualizacao");
  el.querySelector("span").textContent = `Atualização ${versao} pronta`;
  el.title = "Será instalada quando o programa for fechado. Clique para instalar agora.";
  el.classList.remove("hidden");
}

aplicativo.aoAtualizacaoPronta(({ versao }) => mostrarAvisoAtualizacao(versao));

async function instalarAtualizacao() {
  const r = await Swal.fire({
    title: "Instalar atualização agora?",
    html: `O programa faz um backup, fecha, instala a nova versão e abre de novo (cerca de 1 minuto).<br>
      <small class="text-muted">Se preferir, continue usando: a atualização será instalada quando você fechar o programa.</small>`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Instalar agora",
    cancelButtonText: "Depois",
    buttonsStyling: false,
    customClass: { confirmButton: "btn btn-orange me-2", cancelButton: "btn btn-ghost" },
  });
  if (!r.isConfirmed) return;
  const { error } = await aplicativo.instalarAtualizacaoAgora();
  if (error) aviso("error", error.message);
}

// Atualiza o rodapé de tempos em tempos (o backup automático roda no processo principal).
setInterval(() => {
  if (currentUser) atualizarStatusBackup();
}, 5 * 60 * 1000);

// Páginas do app logado (sidebar) e a página atualmente visível
const PAGES = {
  dashboard: "dashboard-page",
  doador: "doador-section",
  doacao: "doacao-section",
  interacao: "interacao-section",
  usuarios: "usuarios-section",
  backup: "backup-section",
};

function showPage(page) {
  if ((page === "usuarios" || page === "backup") && !isAdmin) page = "dashboard";
  Object.values(PAGES).forEach((id) =>
    document.getElementById(id).classList.add("hidden"),
  );
  document.getElementById(PAGES[page]).classList.remove("hidden");

  document
    .querySelectorAll(".sidebar .nav-link[data-page]")
    .forEach((el) => el.classList.remove("active"));
  const activeLink = document.querySelector(
    `.sidebar .nav-link[data-page="${page}"]`,
  );
  if (activeLink) activeLink.classList.add("active");

  if (page === "dashboard") renderDashboard();
  if (page === "usuarios") loadUsuarios();
  if (page === "backup") loadBackup();

  fecharMenuMobile();
}

function fecharMenuMobile() {
  bootstrap.Offcanvas.getInstance(
    document.getElementById("sidebarSystem"),
  )?.hide();
}

// Soma o valor das doações dentro do período escolhido (dias contados a partir de hoje)
function calcularTotalArrecadado(periodo) {
  if (periodo === "todos") {
    return doacoesData.reduce((soma, d) => soma + (Number(d.valor) || 0), 0);
  }

  const diasPorPeriodo = {
    semana: 7,
    mes: 30,
    bimestre: 60,
    trimestre: 90,
    semestre: 180,
    ano: 365,
  };

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - diasPorPeriodo[periodo]);
  const inicioISO = inicio.toISOString().split("T")[0];
  const hojeStr = hojeISO();

  return doacoesData
    .filter((d) => {
      const data = (d.data_doacao || "").split("T")[0];
      return data >= inicioISO && data <= hojeStr;
    })
    .reduce((soma, d) => soma + (Number(d.valor) || 0), 0);
}

// Calcula e exibe os números do dashboard a partir dos dados já carregados
function renderDashboard() {
  const periodoSelecionado =
    document.getElementById("periodoTotalArrecadado")?.value || "todos";
  const totalArrecadado = calcularTotalArrecadado(periodoSelecionado);

  document.getElementById("statTotalArrecadado").textContent =
    totalArrecadado.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  document.getElementById("statDoadores").textContent = doadoresData.length;
  document.getElementById("statDoacoes").textContent = doacoesData.length;
  document.getElementById("statInteracoes").textContent = interacoesData.length;
}

// =========================
// ORDENAR TABELAS (clique no cabeçalho da coluna)
// =========================

// Guarda qual coluna e direção está ordenada em cada tabela
const ordenacaoAtual = {};

// Converte o texto da célula num valor comparável, de acordo com o tipo da coluna
function valorParaOrdenar(texto, tipo) {
  const limpo = texto.trim();

  if (tipo === "numero") {
    return parseFloat(limpo) || 0;
  }

  if (tipo === "moeda") {
    return parseFloat(limpo.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
  }

  if (tipo === "data") {
    const [dia, mes, ano] = limpo.split("/");
    return dia && mes && ano ? `${ano}-${mes}-${dia}` : limpo;
  }

  return limpo.toLowerCase();
}

// Ordena as linhas de uma tabela pela coluna clicada, alternando crescente/decrescente
function ordenarTabela(tableId, colunaIndex, tipo) {
  const table = document.getElementById(tableId);
  const tbody = table.querySelector("tbody");
  const linhas = [...tbody.querySelectorAll("tr")];

  const estadoAnterior = ordenacaoAtual[tableId];
  const crescente =
    estadoAnterior && estadoAnterior.coluna === colunaIndex
      ? !estadoAnterior.crescente
      : true;
  ordenacaoAtual[tableId] = { coluna: colunaIndex, crescente };

  linhas.sort((a, b) => {
    const valorA = valorParaOrdenar(a.children[colunaIndex].textContent, tipo);
    const valorB = valorParaOrdenar(b.children[colunaIndex].textContent, tipo);
    if (valorA < valorB) return crescente ? -1 : 1;
    if (valorA > valorB) return crescente ? 1 : -1;
    return 0;
  });

  linhas.forEach((linha) => tbody.appendChild(linha));
  atualizarIconesOrdenacao(table, colunaIndex, crescente);
}

// Mostra uma seta pra cima/baixo na coluna ordenada e o ícone neutro nas outras
function atualizarIconesOrdenacao(table, colunaIndex, crescente) {
  const ths = [...table.querySelectorAll("thead th")];
  ths.forEach((th, i) => {
    const icone = th.querySelector(".icone-ordenacao");
    if (!icone) return;
    icone.className =
      i === colunaIndex
        ? `fi fi-rr-arrow-${crescente ? "up" : "down"} icone-ordenacao`
        : "fi fi-rr-sort icone-ordenacao";
  });
}

// Fecha o modal do Bootstrap e limpa os campos do formulário
function fecharModal(modalId, formId) {
  const modalEl = document.getElementById(modalId);
  bootstrap.Modal.getOrCreateInstance(modalEl).hide();
  document.getElementById(formId).reset();
}

// =========================
// DOADOR NOVO
// =========================
async function loadDoadores() {
  const { data, error } = await dados.listar("doador_novo");
  if (error) return console.error(error);

  doadoresData = data;
  preencherDropdownDoadores();
  renderDoadorTable();
}

function renderDoadorTable() {
  const tbody = document.querySelector("#doadorTable tbody");
  tbody.innerHTML = "";
  if (!doadoresData.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Adicione dados à tabela</td></tr>`;
    return;
  }
  doadoresData.forEach((d) => {
    const totalDoacoes = doacoesData.filter(
      (doacao) => doacao.id_doador === d.id_doador,
    ).length;

    tbody.innerHTML += `<tr>
      <td>${esc(d.nome)}</td>
      <td>${esc(d.email)}</td>
      <td>${esc(d.telefone)}</td>
      <td class="text-center">
        <button type="button" class="btn btn-link p-0" title="Ver doações deste doador" data-click="abrirDoacoesDoador(${d.id_doador})">${totalDoacoes}</button>
      </td>
      <td class="actions-td">
        <div class="actions-content">
          ${d.email ? `<a href="mailto:${esc(d.email)}" class="btn btn-outline-primary" title="Enviar e-mail para ${esc(d.nome)}"><i class="fi fi-rr-envelope"></i></a>` : ""}
          <button type="button" class="btn btn-outline-secondary" title="Copiar mensagem de lembrete" data-click="copiarMensagemLembrete(${d.id_doador})"><i class="fi fi-rr-clipboard"></i></button>
          <primary-button icon="fi fi-rr-pencil" className="btn btn-outline-secondary" data-onclick="updateDoador(${d.id_doador})"></primary-button>
          ${botaoExcluir(`deleteDoador(${d.id_doador})`)}
        </div>
      </td>
    </tr>`;
  });
}

// Abre o modal com a lista de doações de um doador específico
function abrirDoacoesDoador(idDoador) {
  const doador = doadoresData.find((d) => d.id_doador === idDoador);
  const doacoesDoDoador = doacoesData.filter((d) => d.id_doador === idDoador);

  document.getElementById("modalDoacoesDoadorLabel").textContent =
    `Doações de ${doador ? doador.nome : "-"}`;

  const tbody = document.querySelector("#doacoesDoadorTable tbody");
  tbody.innerHTML = doacoesDoDoador.length
    ? doacoesDoDoador
        .map(
          (d) => `<tr>
            <td>R$ ${d.valor}</td>
            <td>${destaqueDataFutura(d.data_doacao)}${formatarData(d.data_doacao)}</td>
            <td>${badgeStatus(d.status)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="text-center text-muted">Nenhuma doação registrada</td></tr>`;

  bootstrap.Modal.getOrCreateInstance(
    document.getElementById("modalDoacoesDoador"),
  ).show();
}

// Copia uma mensagem de lembrete pronta com os dados do doador
function copiarMensagemLembrete(idDoador) {
  const doador = doadoresData.find((d) => d.id_doador === idDoador);
  if (!doador) return;

  const mensagem = `Olá, ${doador.nome}! Aqui é da Ong Fênix. Passando para agradecer o seu apoio e lembrar que estamos à disposição para qualquer dúvida sobre sua doação.`;

  navigator.clipboard.writeText(mensagem).then(() => {
    Swal.fire({
      icon: "success",
      title: "Mensagem copiada!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  });
}

// =========================
// EXPORTAR TABELAS (CSV e PDF)
// =========================

// Gera um CSV a partir de uma tabela HTML, ignorando a coluna de Ações
function exportarCSV(tableId, nomeArquivo) {
  const table = document.getElementById(tableId);
  const linhas = [...table.querySelectorAll("tr")];

  const csv = linhas
    .map((tr) =>
      [...tr.querySelectorAll("th, td")]
        .filter(
          (celula) =>
            !celula.classList.contains("actions-td") &&
            celula.textContent.trim() !== "Ações",
        )
        .map((celula) => `"${celula.textContent.trim().replace(/"/g, '""')}"`)
        .join(";"),
    )
    .join("\n");

  // ﻿ no início evita acentos quebrados ao abrir o CSV no Excel
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${nomeArquivo}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Gera um PDF a partir de uma tabela HTML, ignorando a coluna de Ações
function exportarPDF(tableId, nomeArquivo, titulo) {
  const table = document.getElementById(tableId);
  const doc = new jspdf.jsPDF();

  doc.text(titulo, 14, 15);

  const colunas = [...table.querySelectorAll("thead th")]
    .filter((th) => th.textContent.trim() !== "Ações")
    .map((th) => th.textContent.trim());

  const linhas = [...table.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")]
      .filter((td) => !td.classList.contains("actions-td"))
      .map((td) => td.textContent.trim()),
  );

  doc.autoTable({ head: [colunas], body: linhas, startY: 20 });
  doc.save(`${nomeArquivo}.pdf`);
}

function apenasDigitos(texto) {
  return texto.replace(/\D/g, "");
}

function nomeDoador(idDoador) {
  const doador = doadoresData.find((d) => d.id_doador === idDoador);
  return doador ? esc(`${doador.nome} (${doador.email || "sem email"})`) : "-";
}

// Selects de doador com campo de busca (biblioteca Choices.js)
let choicesDoador,
  choicesEditDoador,
  choicesDoadorInteracao,
  choicesEditDoadorInteracao;

function initSelectsBuscaDoador() {
  const config = {
    searchEnabled: true,
    searchPlaceholderValue: "Buscar doador...",
    noResultsText: "Nenhum doador encontrado",
    placeholder: true,
    placeholderValue: "Selecione um doador",
    shouldSort: false,
    itemSelectText: "",
  };

  choicesDoador = new Choices("#idDoador", config);
  choicesEditDoador = new Choices("#editIdDoador", config);
  choicesDoadorInteracao = new Choices("#idDoadorInteracao", config);
  choicesEditDoadorInteracao = new Choices("#editIdDoadorInteracao", config);
}

function preencherDropdownDoadores() {
  const opcoes = doadoresData.map((d) => ({
    value: String(d.id_doador),
    label: `${d.nome} (${d.email || "sem email"})`,
  }));

  [
    choicesDoador,
    choicesEditDoador,
    choicesDoadorInteracao,
    choicesEditDoadorInteracao,
  ].forEach((instancia) => {
    instancia.clearStore();
    instancia.setChoices(opcoes, "value", "label", true);
  });
}

function badgeStatus(status) {
  status = status ? esc(status) : status;
  const cores = {
    Pago: "bg-success",
    Pendente: "bg-warning",
    "Não Pago": "bg-danger",
  };
  const cor = cores[status] || "bg-secondary";
  return `<span class="badge ${cor}">${status || "-"}</span>`;
}

function formatarData(data) {
  if (!data) return "";
  const [ano, mes, dia] = data.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Ícone de alerta para doações com data futura (doador disse que vai doar, mas ainda não doou)
function destaqueDataFutura(data) {
  if (!data) return "";
  const ehFutura = data.split("T")[0] > hojeISO();
  return ehFutura
    ? `<i class="fi fi-rr-clock text-danger me-1" title="Data futura - doação ainda não realizada"></i>`
    : "";
}

document
  .getElementById("modalNovaDoacao")
  .addEventListener("show.bs.modal", () => {
    document.getElementById("doacaoData").value = hojeISO();
  });

document.getElementById("dataInteracao").max = hojeISO();
document.getElementById("editDataInteracao").max = hojeISO();

document
  .getElementById("modalNovaInteracao")
  .addEventListener("show.bs.modal", () => {
    document.getElementById("dataInteracao").value = hojeISO();
  });

async function addDoador() {
  const nomeDigitado = document.getElementById("doadorNome").value.trim();
  const nome = nomeDigitado.charAt(0).toUpperCase() + nomeDigitado.slice(1);
  const telefone = document.getElementById("doadorTelefone").value;
  const cpf = document.getElementById("doadorCpf").value;
  const endereco = document.getElementById("doadorEndereco").value;
  const email = document.getElementById("doadorEmail").value || ""; // opcional

  if (!nome) {
    return Swal.fire({
      icon: "error",
      title: "Informe o nome do doador!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return Swal.fire({
      icon: "error",
      title: "E-mail inválido",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const telefoneDigitos = apenasDigitos(telefone);
  if (
    telefoneDigitos &&
    telefoneDigitos.length !== 10 &&
    telefoneDigitos.length !== 11
  ) {
    return Swal.fire({
      icon: "error",
      title: "Telefone inválido (informe DDD + número)",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const cpfDigitos = apenasDigitos(cpf);
  if (cpfDigitos && cpfDigitos.length !== 11 && cpfDigitos.length !== 14) {
    return Swal.fire({
      icon: "error",
      title: "CPF/CNPJ inválido",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const { error } = await dados.inserir("doador_novo", {
    nome,
    telefone,
    cpf_cnpj: cpf,
    endereco,
    email,
  });
  if (error) {
    return Swal.fire({
      icon: "error",
      title: "Erro ao salvar, tente novamente: " + error.message,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  fecharModal("modalNovoDoador", "formNovoDoador");
  loadDoadores();
}

function updateDoador(id) {
  const doador = doadoresData.find((d) => d.id_doador === id);
  if (!doador) {
    return Swal.fire({
      icon: "error",
      title: "Doador não encontrado no cache. Recarregue a página.",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  document.getElementById("editDoadorId").value = doador.id_doador;
  document.getElementById("editDoadorNome").value = doador.nome || "";
  document.getElementById("editDoadorTelefone").value = doador.telefone || "";
  document.getElementById("editDoadorCpf").value = doador.cpf_cnpj || "";
  document.getElementById("editDoadorEndereco").value = doador.endereco || "";
  document.getElementById("editDoadorEmail").value = doador.email || "";

  bootstrap.Modal.getOrCreateInstance(
    document.getElementById("modalEditarDoador"),
  ).show();
}

async function salvarEdicaoDoador() {
  const id = document.getElementById("editDoadorId").value;
  const nome = document.getElementById("editDoadorNome").value.trim();
  const telefone = document.getElementById("editDoadorTelefone").value;
  const cpf = document.getElementById("editDoadorCpf").value;
  const endereco = document.getElementById("editDoadorEndereco").value;
  const email = document.getElementById("editDoadorEmail").value;

  if (!nome) {
    return Swal.fire({
      icon: "error",
      title: "Informe o nome do doador!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return Swal.fire({
      icon: "error",
      title: "E-mail inválido",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const telefoneDigitos = apenasDigitos(telefone);
  if (
    telefoneDigitos &&
    telefoneDigitos.length !== 10 &&
    telefoneDigitos.length !== 11
  ) {
    return Swal.fire({
      icon: "error",
      title: "Telefone inválido (informe DDD + número)",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const cpfDigitos = apenasDigitos(cpf);
  if (cpfDigitos && cpfDigitos.length !== 11 && cpfDigitos.length !== 14) {
    return Swal.fire({
      icon: "error",
      title: "CPF/CNPJ inválido",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const { error } = await dados.atualizar("doador_novo", id, {
    nome,
    telefone,
    cpf_cnpj: cpf,
    endereco,
    email,
  });
  if (error) {
    return Swal.fire({
      icon: "error",
      title: "Erro ao salvar, tente novamente: " + error.message,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  Swal.fire({
    icon: "success",
    title: "Informações salvas!",
    position: "top-end",
    showConfirmButton: false,
    timer: 1500,
    timerProgressBar: true,
    toast: true,
    animation: true,
  });

  fecharModal("modalEditarDoador", "formEditarDoador");
  loadDoadores();
}

function deleteDoador(id) {
  if (!podeExcluir()) return;
  const temDoacoes = doacoesData.some((d) => d.id_doador === id);
  const temInteracoes = interacoesData.some((i) => i.id_doador === id);

  if (temDoacoes || temInteracoes) {
    return Swal.fire({
      icon: "error",
      title: "Não é possível excluir",
      text: "Esse doador tem doações ou interações registradas. Exclua ou reatribua esses registros a outro doador antes de excluí-lo.",
      position: "top-end",
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  Swal.fire({
    title: "Tem certeza?",
    text: "Essa ação não pode ser desfeita!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, excluir!",
    cancelButtonText: "Cancelar",
    buttonsStyling: false,
    customClass: {
      confirmButton: "btn btn-danger me-2",
      cancelButton: "btn btn-ghost",
    },
  }).then(async (result) => {
    if (!result.isConfirmed) return;

    const { error } = await dados.excluir("doador_novo", id);
    if (error) {
      return Swal.fire({
        icon: "error",
        title: "Erro ao excluir: " + error.message,
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        toast: true,
        animation: true,
      });
    }

    Swal.fire({
      icon: "success",
      title: "Doador excluído!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
    loadDoadores();
  });
}

// =========================
//  DOAÇÃO NOVA
// =========================
async function loadDoacoes() {
  const { data, error } = await dados.listar("doacao_nova");
  if (error) return console.error(error);

  doacoesData = data;

  const tbody = document.querySelector("#doacaoTable tbody");
  tbody.innerHTML = data.length
    ? ""
    : `<tr><td colspan="5" class="text-center text-muted">Adicione dados à tabela</td></tr>`;
  data.forEach((d) => {
    tbody.innerHTML += `<tr>
      <td>${nomeDoador(d.id_doador)}</td>
      <td>R$ <strong>${d.valor}</strong></td>
      <td>${destaqueDataFutura(d.data_doacao)}${formatarData(d.data_doacao)}</td>
      <td>${badgeStatus(d.status)}</td>
      <td class="actions-td">
        <div class="actions-content">
          <primary-button icon="fi fi-rr-pencil" className="btn btn-outline-secondary" data-onclick="updateDoacao(${d.id_doacao})"></primary-button>
          ${botaoExcluir(`deleteDoacao(${d.id_doacao})`)}
        </div>
      </td>
    </tr>`;
  });

  // Atualiza o contador de doações na tabela de doadores, se ela já tiver sido carregada
  if (doadoresData.length) renderDoadorTable();
}

async function addDoacao() {
  const valor = document.getElementById("doacaoValor").value;
  const dataDoacao = document.getElementById("doacaoData").value;
  const forma = document.getElementById("doacaoForma").value;
  const idDoador = document.getElementById("idDoador").value;

  if (!idDoador) {
    return Swal.fire({
      icon: "error",
      title: "Informe o Id do Doador!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (!valor || parseFloat(valor) <= 0) {
    return Swal.fire({
      icon: "error",
      title: "Informe um valor válido maior que zero",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (!forma) {
    return Swal.fire({
      icon: "error",
      title: "Selecione a forma de pagamento",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const { data: doador, error: doadorError } = await dados.obter(
    "doador_novo",
    idDoador,
  );

  if (doadorError || !doador) {
    return Swal.fire({
      icon: "error",
      title: "Doador não encontrado! Verifique o ID informado.",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const { error } = await dados.inserir("doacao_nova", {
    id_doador: parseInt(idDoador),
    valor: parseFloat(valor),
    data_doacao: dataDoacao,
    forma_pagamento: forma,
    status: "Pendente",
  });
  if (error) {
    return Swal.fire({
      icon: "error",
      title: "Erro ao salvar, tente novamente: " + error.message,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  fecharModal("modalNovaDoacao", "formNovaDoacao");
  loadDoacoes();
}

function updateDoacao(id) {
  const doacao = doacoesData.find((d) => d.id_doacao === id);
  if (!doacao) {
    return Swal.fire({
      icon: "error",
      title: "Doação não encontrada no cache. Recarregue a página.",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  document.getElementById("editDoacaoId").value = doacao.id_doacao;
  choicesEditDoador.setChoiceByValue(String(doacao.id_doador));
  document.getElementById("editDoacaoValor").value = doacao.valor || "";
  document.getElementById("editDoacaoData").value = doacao.data_doacao || "";
  document.getElementById("editDoacaoForma").value =
    doacao.forma_pagamento || "";
  document.getElementById("editDoacaoStatus").value = doacao.status || "";

  bootstrap.Modal.getOrCreateInstance(
    document.getElementById("modalEditarDoacao"),
  ).show();
}

async function salvarEdicaoDoacao() {
  const id = document.getElementById("editDoacaoId").value;
  const idDoador = document.getElementById("editIdDoador").value;
  const valor = document.getElementById("editDoacaoValor").value;
  const dataDoacao = document.getElementById("editDoacaoData").value;
  const forma = document.getElementById("editDoacaoForma").value;
  const status = document.getElementById("editDoacaoStatus").value;

  if (!idDoador) {
    return Swal.fire({
      icon: "error",
      title: "Selecione o doador",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (!valor || parseFloat(valor) <= 0) {
    return Swal.fire({
      icon: "error",
      title: "Informe um valor válido maior que zero",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (!forma) {
    return Swal.fire({
      icon: "error",
      title: "Selecione a forma de pagamento",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (!status) {
    return Swal.fire({
      icon: "error",
      title: "Selecione o status",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const { error } = await dados.atualizar("doacao_nova", id, {
    id_doador: parseInt(idDoador),
    valor: parseFloat(valor),
    data_doacao: dataDoacao,
    forma_pagamento: forma,
    status,
  });
  if (error) {
    return Swal.fire({
      icon: "error",
      title: "Erro ao salvar, tente novamente: " + error.message,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  Swal.fire({
    icon: "success",
    title: "Informações salvas!",
    position: "top-end",
    showConfirmButton: false,
    timer: 1500,
    timerProgressBar: true,
    toast: true,
    animation: true,
  });

  fecharModal("modalEditarDoacao", "formEditarDoacao");
  loadDoacoes();
}

function deleteDoacao(id) {
  if (!podeExcluir()) return;
  Swal.fire({
    title: "Tem certeza?",
    text: "Essa ação não pode ser desfeita!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, excluir!",
    cancelButtonText: "Cancelar",
    buttonsStyling: false,
    customClass: {
      confirmButton: "btn btn-danger me-2",
      cancelButton: "btn btn-ghost",
    },
  }).then(async (result) => {
    if (!result.isConfirmed) return;

    const { error } = await dados.excluir("doacao_nova", id);
    if (error) {
      return Swal.fire({
        icon: "error",
        title: "Erro ao excluir: " + error.message,
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        toast: true,
        animation: true,
      });
    }

    Swal.fire({
      icon: "success",
      title: "Doação excluída!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
    loadDoacoes();
  });
}

// =========================
// INTERAÇÃO NOVA (ong e doador)
// =========================
async function loadInteracoes() {
  const { data, error } = await dados.listar("interacao_nova");
  if (error) return console.error(error);

  interacoesData = data;

  const tbody = document.querySelector("#interacaoTable tbody");
  tbody.innerHTML = data.length
    ? ""
    : `<tr><td colspan="5" class="text-center text-muted">Adicione dados à tabela</td></tr>`;
  data.forEach((i) => {
    tbody.innerHTML += `<tr>
      <td>${nomeDoador(i.id_doador)}</td>
      <td>${esc(i.tipo_interacao)}</td>
      <td>${esc(i.observacoes)}</td>
      <td>${formatarData(i.data_interacao)}</td>
      <td class="actions-td">
        <div class="actions-content">
          <primary-button icon="fi fi-rr-pencil" className="btn btn-outline-secondary" data-onclick="updateInteracaoNova(${i.id_interacao})"></primary-button>
          ${botaoExcluir(`deleteInteracaoNova(${i.id_interacao})`)}
        </div>
      </td>
    </tr>`;
  });
}

async function addInteracaoNova() {
  const tipo = document.getElementById("tipoInteracao").value;
  const obs = document.getElementById("observacoes").value;
  const dataInteracao = document.getElementById("dataInteracao").value;
  const idDoador = document.getElementById("idDoadorInteracao").value || "";

  if (!tipo) {
    return Swal.fire({
      icon: "error",
      title: "Informe o tipo da interação",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (dataInteracao && dataInteracao > hojeISO()) {
    return Swal.fire({
      icon: "error",
      title: "A data da interação não pode ser no futuro",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (idDoador) {
    const { data: doador, error: doadorError } = await dados.obter(
      "doador_novo",
      idDoador,
    );

    if (doadorError || !doador) {
      return Swal.fire({
        icon: "error",
        title: "Doador não encontrado! Verifique o ID informado.",
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        toast: true,
        animation: true,
      });
    }
  }

  const { error } = await dados.inserir("interacao_nova", {
    id_doador: idDoador ? parseInt(idDoador) : null,
    // id_usuario é preenchido pelo processo principal a partir da sessão
    tipo_interacao: tipo,
    observacoes: obs,
    data_interacao: dataInteracao,
  });
  if (error) {
    return Swal.fire({
      icon: "error",
      title: "Erro ao salvar, tente novamente: " + error.message,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  Swal.fire({
    icon: "success",
    title: "Informações salvas!",
    position: "top-end",
    showConfirmButton: false,
    timer: 1500,
    timerProgressBar: true,
    toast: true,
    animation: true,
  });

  fecharModal("modalNovaInteracao", "formNovaInteracao");
  loadInteracoes();
}

function updateInteracaoNova(id) {
  const interacao = interacoesData.find((i) => i.id_interacao === id);
  if (!interacao) {
    return Swal.fire({
      icon: "error",
      title: "Interação não encontrada no cache. Recarregue a página.",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  document.getElementById("editInteracaoId").value = interacao.id_interacao;
  choicesEditDoadorInteracao.setChoiceByValue(String(interacao.id_doador));
  document.getElementById("editTipoInteracao").value =
    interacao.tipo_interacao || "";
  document.getElementById("editObservacoes").value =
    interacao.observacoes || "";
  document.getElementById("editDataInteracao").value = interacao.data_interacao
    ? interacao.data_interacao.split("T")[0]
    : "";

  bootstrap.Modal.getOrCreateInstance(
    document.getElementById("modalEditarInteracao"),
  ).show();
}

async function salvarEdicaoInteracao() {
  const id = document.getElementById("editInteracaoId").value;
  const idDoador = document.getElementById("editIdDoadorInteracao").value;
  const tipo = document.getElementById("editTipoInteracao").value;
  const obs = document.getElementById("editObservacoes").value;
  const dataInteracao = document.getElementById("editDataInteracao").value;

  if (!idDoador) {
    return Swal.fire({
      icon: "error",
      title: "Informe o ID do Doador!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (!tipo) {
    return Swal.fire({
      icon: "error",
      title: "Informe o tipo da interação",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  if (dataInteracao && dataInteracao > hojeISO()) {
    return Swal.fire({
      icon: "error",
      title: "A data da interação não pode ser no futuro",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const { data: doador, error: doadorError } = await dados.obter(
    "doador_novo",
    idDoador,
  );

  if (doadorError || !doador) {
    return Swal.fire({
      icon: "error",
      title: "Doador não encontrado! Verifique o ID informado.",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  const { error } = await dados.atualizar("interacao_nova", id, {
    id_doador: parseInt(idDoador),
    tipo_interacao: tipo,
    observacoes: obs,
    data_interacao: dataInteracao,
  });
  if (error) {
    return Swal.fire({
      icon: "error",
      title: "Erro ao salvar, tente novamente: " + error.message,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
  }

  Swal.fire({
    icon: "success",
    title: "Informações salvas!",
    position: "top-end",
    showConfirmButton: false,
    timer: 1500,
    timerProgressBar: true,
    toast: true,
    animation: true,
  });

  fecharModal("modalEditarInteracao", "formEditarInteracao");
  loadInteracoes();
}

function deleteInteracaoNova(id) {
  if (!podeExcluir()) return;
  Swal.fire({
    title: "Tem certeza?",
    text: "Essa ação não pode ser desfeita!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sim, excluir!",
    cancelButtonText: "Cancelar",
    buttonsStyling: false,
    customClass: {
      confirmButton: "btn btn-danger me-2",
      cancelButton: "btn btn-ghost",
    },
  }).then(async (result) => {
    if (!result.isConfirmed) return;

    const { error } = await dados.excluir("interacao_nova", id);
    if (error) {
      return Swal.fire({
        icon: "error",
        title: "Erro ao excluir: " + error.message,
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        toast: true,
        animation: true,
      });
    }

    Swal.fire({
      icon: "success",
      title: "Interação excluída!",
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
      toast: true,
      animation: true,
    });
    loadInteracoes();
  });
}

// =========================
// Load inicial do sistema
// =========================
async function loadData() {
  await loadDoadores();
  await loadDoacoes();
  await loadInteracoes();
  renderDashboard();
}

function viewSenha() {
  var tipo = document.getElementById("password");
  var icon = document.getElementById("icon-password");

  if (tipo.type == "password") {
    tipo.type = "text";
    icon.className = "fi fi-rr-eye";
  } else {
    tipo.type = "password";
    icon.className = "fi fi-rr-eye-crossed";
  }
}

function toggleSenhaBtn() {
  var senha = document.getElementById("password");
  var btn = document.getElementById("btn-toggle-senha");
  btn.disabled = senha.value.length === 0;
}

// COMPONENTES MODULARES
// function primaryButton({
//   label = "",
//   type = "primary",
//   title = "",
//   onClick,
//   className = "",
//   icon,
//   iconId,
// }) {
//   return `
//     <button type="button" ${title ? `title="${title}"` : ""} class="${className}" ${onClick ? `data-click="${esc(onClick)}"` : ""}>
//         ${icon ? `<i ${iconId ? `id="${iconId}"` : ""} class="${icon}"></i>` : ""}
//         ${label}
//     </button>
//   `;
// }

// Função berga botão // igual react
function primaryButton({
  label = "",
  title = "",
  onClick,
  className = "",
  icon,
  iconId,
  id,
  disabled,
}) {
  return `
    <button type="button" ${id ? `id="${id}"` : ""} ${title ? `title="${title}"` : ""} class="${className}" ${onClick ? `data-click="${esc(onClick)}"` : ""} ${disabled ? "disabled" : ""}>
        ${icon ? `<i ${iconId ? `id="${iconId}"` : ""} class="${icon}${label ? " me-1" : ""}"></i>` : ""}
        ${label ? `<span class="">${label}</span>` : ""}
    </button>
  `;
}

// Registrando a Tag Nativa
customElements.define(
  "primary-button",
  class extends HTMLElement {
    connectedCallback() {
      this.innerHTML = primaryButton({
        label: this.getAttribute("label"),
        title: this.getAttribute("title"),
        className: this.getAttribute("className") || "",
        onClick: this.getAttribute("data-onclick"),
        icon: this.getAttribute("icon"),
        iconId: this.getAttribute("iconId"),
        id: this.getAttribute("data-id"),
        disabled: this.hasAttribute("disabled"),
      });
    }
  },
);

// --------------
// ENTER = ATALHO PARA SALVAR (login e modais)
// --------------
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  // Dentro de uma textarea, Enter deve quebrar linha normalmente
  if (e.target.tagName === "TEXTAREA") return;

  // Se algum modal estiver aberto, clica no botão "Salvar" do rodapé dele
  const modalAberto = document.querySelector(".modal.show");
  if (modalAberto) {
    const btnSalvar = modalAberto.querySelector(".modal-footer .btn-orange");
    if (btnSalvar) {
      e.preventDefault();
      btnSalvar.click();
    }
    return;
  }

  // Telas de entrada (login, primeiro acesso, recuperação): Enter aciona o botão do painel
  const painel = e.target.closest("#login-card .auth-section");
  if (painel && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
    e.preventDefault();
    painel.querySelector(".btn-block button, button.btn-block")?.click();
  }
});

// --------------
// AÇÕES DOS BOTÕES (sem JavaScript inline)
// A política de segurança (CSP) do programa proíbe onclick="..." no HTML.
// Os elementos usam data-click / data-change / data-input com o texto "funcao(arg1, 'arg2')".
// Este despachante só executa funções da lista abaixo e só aceita argumentos simples
// (número, texto entre aspas, this.checked, this.value). Nada é avaliado como código.
// --------------
const ACOES_PERMITIDAS = new Set([
  "abrirDoacoesDoador", "abrirModalUsuario", "addDoacao", "addDoador", "addInteracaoNova",
  "alterarMinhaSenha", "concluirPrimeiroAcesso", "copiarChave", "copiarMensagemLembrete",
  "criarPrimeiroAdmin", "deleteDoacao", "deleteDoador", "deleteInteracaoNova",
  "exportarCSV", "exportarExcel", "fazerBackupAgora", "abrirPastaBackup", "escolherPastaBackup",
  "copiarParaPendrive", "restaurarDaLista", "restaurarDeArquivo", "instalarAtualizacao", "exportarPDF", "fecharMenuMobile", "imprimirChave",
  "liberarContinuar", "ordenarTabela", "recuperarComChave", "redefinirSenhaUsuario",
  "renderDashboard", "salvarEdicaoDoacao", "salvarEdicaoDoador", "salvarEdicaoInteracao",
  "salvarUsuario", "showPage", "signIn", "signOut", "toggleSenhaBtn", "updateDoacao",
  "updateDoador", "updateInteracaoNova", "verChaveRecuperacao", "viewSenha",
]);

function lerArgumentos(texto, elemento) {
  const args = [];
  const re = /\s*('([^']*)'|"([^"]*)"|-?\d+(?:\.\d+)?|this\.checked|this\.value)\s*(,|$)/y;
  let pos = 0;
  if (!texto.trim()) return args;
  while (pos < texto.length) {
    re.lastIndex = pos;
    const m = re.exec(texto);
    if (!m || m[0] === "") throw new Error("Argumento não permitido: " + texto);
    const bruto = m[1];
    if (bruto === "this.checked") args.push(elemento.checked);
    else if (bruto === "this.value") args.push(elemento.value);
    else if (m[2] !== undefined) args.push(m[2]);
    else if (m[3] !== undefined) args.push(m[3]);
    else args.push(Number(bruto));
    pos = re.lastIndex;
  }
  return args;
}

function executarAcao(expressao, elemento) {
  const m = /^\s*([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*;?\s*$/.exec(expressao || "");
  const nome = m && m[1];
  if (!nome || !ACOES_PERMITIDAS.has(nome) || typeof window[nome] !== "function") {
    console.warn("Ação bloqueada:", expressao);
    return;
  }
  try {
    return window[nome](...lerArgumentos(m[2], elemento));
  } catch (erro) {
    console.error("Falha na ação", expressao, erro);
  }
}

[
  ["click", "data-click"],
  ["change", "data-change"],
  ["input", "data-input"],
].forEach(([evento, atributo]) => {
  document.addEventListener(evento, (e) => {
    const alvo = e.target.closest(`[${atributo}]`);
    if (!alvo) return;
    // Links "#" só disparam a ação (não mudam o endereço da página)
    if (alvo.tagName === "A" && alvo.getAttribute("href") === "#") e.preventDefault();
    executarAcao(alvo.getAttribute(atributo), alvo);
  });
});

iniciarSistema();
iniciarInfoAplicativo();
