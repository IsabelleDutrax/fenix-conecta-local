// Gera a planilha Excel de CONSULTA (cópia somente para leitura humana).
// Alterações feitas na planilha não voltam para o sistema. O arquivo NÃO é cifrado:
// por isso a tela avisa sobre dados pessoais (LGPD) antes de gerar.
const writeXlsxFile = require("write-excel-file/node");

const dois = (n) => String(n).padStart(2, "0");

// "Fenix Conecta - consulta - 23-11-2026.xlsx"
function nomeExcelConsulta(data = new Date()) {
  return `Fenix Conecta - consulta - ${dois(data.getDate())}-${dois(data.getMonth() + 1)}-${data.getFullYear()}.xlsx`;
}

// 'AAAA-MM-DD' -> Date em UTC (o Excel mostra o dia certo, sem fuso)
function dataSimples(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

// ISO UTC -> 'DD/MM/AAAA HH:MM' no horário do computador
function dataHoraLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

const FORMATO_DATA = "dd/mm/yyyy";
const FORMATO_REAL = '"R$" #,##0.00';
const titulo = (value) => ({ value, fontWeight: "bold", backgroundColor: "#FFE0D6" });

function texto(v) {
  return v === null || v === undefined || v === "" ? null : String(v);
}

function montarPlanilhas(db, { geradoPor = "", agora = new Date() } = {}) {
  const doadores = db.prepare("SELECT * FROM doador_novo ORDER BY nome COLLATE NOCASE").all();
  const doacoes = db
    .prepare(
      `SELECT d.*, dn.nome AS doador FROM doacao_nova d
       LEFT JOIN doador_novo dn ON dn.id_doador = d.id_doador
       ORDER BY d.data_doacao DESC, d.id_doacao DESC`,
    )
    .all();
  const interacoes = db
    .prepare(
      `SELECT i.*, dn.nome AS doador, u.nome AS usuario FROM interacao_nova i
       LEFT JOIN doador_novo dn ON dn.id_doador = i.id_doador
       LEFT JOIN usuario u ON u.id_usuario = CAST(i.id_usuario AS INTEGER)
       ORDER BY i.data_interacao DESC, i.id_interacao DESC`,
    )
    .all();

  const leiaMe = [
    [{ value: "Fênix Conecta — CÓPIA DE CONSULTA", fontWeight: "bold", fontSize: 14 }],
    [""],
    [`Gerada em: ${dataHoraLocal(agora.toISOString())}${geradoPor ? ` por ${geradoPor}` : ""}`],
    [`Registros: ${doadores.length} doadores, ${doacoes.length} doações, ${interacoes.length} interações.`],
    [""],
    [{ value: "ATENÇÃO — DADOS PESSOAIS (LGPD)", fontWeight: "bold", color: "#C00000" }],
    ["Esta planilha contém dados pessoais (nome, CPF/CNPJ, telefone, e-mail, endereço)."],
    ["Ela NÃO é protegida por senha nem criptografia."],
    ["• Não envie por e-mail, WhatsApp ou redes sociais."],
    ["• Não salve em pen drive ou computador de terceiros."],
    ["• Apague o arquivo quando terminar a consulta."],
    [""],
    [{ value: "Alterações feitas aqui NÃO voltam para o sistema.", fontWeight: "bold" }],
    ["Para corrigir um dado, use o programa Fênix Conecta."],
  ];

  const planDoadores = [
    ["Código", "Nome", "E-mail", "Telefone", "CPF/CNPJ", "Endereço", "Doações", "Cadastrado em"].map(titulo),
    ...doadores.map((d) => [
      d.id_doador,
      texto(d.nome),
      texto(d.email),
      texto(d.telefone),
      texto(d.cpf_cnpj),
      texto(d.endereco),
      doacoes.filter((x) => x.id_doador === d.id_doador).length,
      dataHoraLocal(d.criado_em),
    ]),
  ];

  const planDoacoes = [
    ["Código", "Doador", "Valor", "Data", "Forma de pagamento", "Status"].map(titulo),
    ...doacoes.map((d) => [
      d.id_doacao,
      texto(d.doador),
      { value: Number(d.valor), type: Number, format: FORMATO_REAL },
      dataSimples(d.data_doacao) ? { value: dataSimples(d.data_doacao), type: Date, format: FORMATO_DATA } : null,
      texto(d.forma_pagamento),
      texto(d.status),
    ]),
  ];

  const planInteracoes = [
    ["Código", "Doador", "Tipo", "Observações", "Data", "Registrado por"].map(titulo),
    ...interacoes.map((i) => [
      i.id_interacao,
      texto(i.doador),
      texto(i.tipo_interacao),
      texto(i.observacoes),
      dataSimples(i.data_interacao) ? { value: dataSimples(i.data_interacao), type: Date, format: FORMATO_DATA } : null,
      texto(i.usuario),
    ]),
  ];

  return [
    { sheet: "LEIA-ME", data: leiaMe, columns: [{ width: 90 }] },
    {
      sheet: "Doadores",
      data: planDoadores,
      stickyRowsCount: 1,
      columns: [8, 32, 30, 18, 20, 40, 10, 18].map((width) => ({ width })),
    },
    {
      sheet: "Doações",
      data: planDoacoes,
      stickyRowsCount: 1,
      columns: [8, 32, 14, 12, 20, 12].map((width) => ({ width })),
    },
    {
      sheet: "Interações",
      data: planInteracoes,
      stickyRowsCount: 1,
      columns: [8, 32, 18, 50, 12, 24].map((width) => ({ width })),
    },
  ];
}

async function gerarExcelConsulta(db, arquivoDestino, opcoes = {}) {
  const planilhas = montarPlanilhas(db, opcoes);
  await writeXlsxFile(planilhas).toFile(arquivoDestino);
  return {
    arquivo: arquivoDestino,
    registros: {
      doadores: planilhas[1].data.length - 1,
      doacoes: planilhas[2].data.length - 1,
      interacoes: planilhas[3].data.length - 1,
    },
  };
}

module.exports = { gerarExcelConsulta, nomeExcelConsulta, montarPlanilhas };
