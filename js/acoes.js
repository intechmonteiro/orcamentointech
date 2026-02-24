// ======================================================== acoes.js ======================================================== //

import { salvarOrcamento, obterHistorico } from "./storage.js";
// MUDANÇA AQUI: Renomeei para evitar conflito de nome
import { formatBR as formatarMoeda } from "./utils.js"; 

// ==================================================================== Helpers ====================================================================//
function getJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  return null;
}

function safeUUID() {
  try {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `mi_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function calcularPagamento(total, dadosCliente) {
  const TAXA = 0.0652; 
  const pagamento = (dadosCliente.pagamento || "").toLowerCase();
  const parcelas = parseInt(dadosCliente.parcelas || "1", 10);

  const temJuros = pagamento.includes("credito");
  const totalFinal = temJuros ? total * (1 + TAXA) : total;
  const valorParcela = parcelas > 1 ? totalFinal / parcelas : null;

  return { totalOriginal: total, totalFinal, parcelas, valorParcela, temJuros };
}

function gerarNumeroOrcamento() {
  const chave = "MI_ORCAMENTO_SEQ";
  let atual = parseInt(localStorage.getItem(chave) || "0", 10);
  atual++;
  localStorage.setItem(chave, atual);
  return `MI-${String(atual).padStart(6, "0")}`;
}

// ==================================================================== WhatsApp ====================================================================//

export async function enviarWhatsApp(carrinho, dadosCliente) {
  const totalBase = carrinho.reduce((soma, item) => soma + item.preco * item.qtd, 0);
  const pagamentoCalc = calcularPagamento(totalBase, dadosCliente);

  let mensagem = `*ORÇAMENTO - MONTEIRO INTECH*\n\n`;
  mensagem += `👤 *Cliente:* ${dadosCliente.nome}\n`;
  mensagem += `💳 *Pagamento:* ${dadosCliente.pagamento}\n\n`;

  if (pagamentoCalc.parcelas && pagamentoCalc.valorParcela) {
    // USO DA NOVA FUNÇÃO RENOMEADA
    mensagem += `*Parcelamento:* ${pagamentoCalc.parcelas}x de ${formatarMoeda(pagamentoCalc.valorParcela)}\n`;
    mensagem += `*Total com acréscimo:* ${formatarMoeda(pagamentoCalc.totalFinal)}\n\n`;
  } else {
    mensagem += `*Total:* ${formatarMoeda(pagamentoCalc.totalFinal)}\n\n`;
  }

  mensagem += `*Itens do Orçamento:*\n`;
  carrinho.forEach(item => {
    const marcaModelo = `${item.marca ? item.marca + " " : ""}${item.modelo || ""}`.trim();
    mensagem += `▸ ${item.qtd}x ${marcaModelo} - ${item.nome}\n`;
  });

  mensagem += `\n_Validade: 7 dias_\n_Monteiro Intech_`;

  const texto = encodeURIComponent(mensagem.trim());
  const telefone = "55997005039";
  const url = `https://wa.me/${telefone}?text=${texto}`;

  window.open(url, "_blank");

  await salvarOrcamento({
    id: safeUUID(),
    numero: gerarNumeroOrcamento(),
    cliente: dadosCliente.nome,
    pagamento: dadosCliente.pagamento,
    parcelas: pagamentoCalc.parcelas,
    total: pagamentoCalc.totalFinal,
    data: new Date().toISOString(),
    itens: carrinho,
    pdf: null
  });

  if (typeof window.atualizarDashboard === "function") window.atualizarDashboard();
}

// ===========================================================================  GERAR PDF ======================================================== //

export async function gerarPDF(carrinho, dadosCliente) {
  console.log("Gerando PDF...");

  if (!Array.isArray(carrinho) || carrinho.length === 0) {
    alert("Carrinho vazio.");
    return;
  }

  const jsPDF = getJsPDF();
  if (!jsPDF) {
    console.error("jsPDF não carregou.");
    alert("Erro ao carregar gerador de PDF.");
    return;
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const azulMonteiro = [0, 74, 173];

  const numeroOrcamento = gerarNumeroOrcamento();
  const totalBase = carrinho.reduce((soma, item) => soma + (Number(item.preco || 0) * (item.qtd || 1)), 0);
  const pagamentoCalc = calcularPagamento(totalBase, dadosCliente);

  // Layout do PDF
  doc.setFillColor(...azulMonteiro);
  doc.rect(0, 0, 210, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("MONTEIRO INTECH", 20, 25);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Confiança que se instala com um clique", 20, 32);

  doc.setFontSize(9);
  doc.text("Rua Paulo Gelson Padilha, 58", 140, 20);
  doc.text("Menino Deus - Salto do Jacuí/RS", 140, 25);
  doc.text("WhatsApp: (55) 99700-5039", 140, 30);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("ORÇAMENTO DE SERVIÇO", 20, 55);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº: ${numeroOrcamento}`, 170, 55);
  doc.text(`Cliente: ${dadosCliente.nome}`, 20, 65);
  doc.text(`Pagamento: ${dadosCliente.pagamento}`, 20, 72);

  doc.setDrawColor(200, 200, 200);
  doc.line(20, 77, 190, 77);

  // Tabela
  let y = 90;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Qtd", 20, 85);
  doc.text("Descrição do Serviço / Peça", 35, 85);
  doc.text("Valor", 190, 85, { align: "right" });

  doc.setTextColor(0, 0, 0);

  carrinho.forEach((item) => {
    const qtd = item.qtd || 1;
    const preco = Number(item.preco || 0);
    const totalLinha = preco * qtd;

    if (y > 270) {
      doc.addPage();
      y = 30;
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Qtd", 20, 25);
      doc.text("Descrição do Serviço / Peça", 35, 25);
      doc.text("Valor", 190, 25, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }

    doc.text(`${qtd}x`, 20, y);
    doc.text(`${item.modelo} - ${item.nome}`, 35, y);
    // USO DA NOVA FUNÇÃO RENOMEADA
    doc.text(formatarMoeda(totalLinha), 190, y, { align: "right" });
    y += 8;
  });

  // Totais
  y += 5;
  if (y > 270) {
    doc.addPage();
    y = 30;
  }

  doc.setDrawColor(...azulMonteiro);
  doc.line(130, y, 190, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("TOTAL:", 130, y);

  doc.setTextColor(...azulMonteiro);
  // USO DA NOVA FUNÇÃO RENOMEADA
  doc.text(formatarMoeda(pagamentoCalc.totalFinal), 190, y, { align: "right" });

  if (pagamentoCalc.parcelas > 1) {
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`(${pagamentoCalc.parcelas}x de ${formatarMoeda(pagamentoCalc.valorParcela)})`, 190, y, { align: "right" });
  }

  // Termos
  y += 20;
  if (y > 250) {
    doc.addPage();
    y = 30;
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text("TERMOS DE GARANTIA E CONDIÇÕES", 20, y);

  y += 7;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  const termos = [
    "1. GARANTIA: 90 dias para defeitos de fabricação na peça substituída, conforme o Art. 26 do CDC.",
    "2. PERDA DE GARANTIA: A garantia será anulada em caso de: quedas, contato com líquidos (oxidação),",
    "   esmagamento, selo de garantia rompido ou intervenção técnica por terceiros não autorizados.",
    "3. PRAZO DE VALIDADE: Este orçamento é válido por 7 (sete) dias a contar da data de emissão.",
    "4. RETIRADA: Aparelhos não retirados em até 90 dias após o aviso de prontidão serão considerados",
    "   abandonados e poderão ser vendidos para custear as despesas do reparo (Art. 1.275 do Código Civil).",
    "5. RESPONSABILIDADE: A Monteiro Intech não se responsabiliza por perda de dados. Faça backup antes do reparo."
  ];

  termos.forEach((linha) => {
    if (y > 285) {
      doc.addPage();
      y = 30;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
    }
    doc.text(linha, 20, y);
    y += 5;
  });

  // Assinaturas
  y += 15;
  if (y > 275) {
    doc.addPage();
    y = 30;
  }

  doc.line(20, y, 90, y);
  doc.line(120, y, 190, y);
  y += 5;
  doc.text("Assinatura do Cliente", 40, y);
  doc.text("Responsável Monteiro Intech", 140, y);

  // Rodapé
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const dataH = new Date().toLocaleDateString("pt-BR");
  doc.text(`Documento gerado em ${dataH} via sistema Monteiro Intech.`, 105, 285, { align: "center" });

  const nomeArquivo = `Orcamento_${dadosCliente.nome}_${numeroOrcamento}.pdf`;
  const pdfBase64 = doc.output("datauristring");
  doc.save(nomeArquivo);

  try {
    await salvarOrcamento({
      id: safeUUID(),
      numero: numeroOrcamento,
      cliente: dadosCliente.nome,
      pagamento: dadosCliente.pagamento,
      total: pagamentoCalc.totalFinal,
      data: new Date().toISOString(),
      itens: carrinho,
      pdf: pdfBase64
    });
  } catch (e) {
    console.error("Falha ao salvar orçamento no histórico:", e);
  }

  if (typeof window.atualizarDashboard === "function") window.atualizarDashboard();
}

// ============================================================= ATUALIZAR DASHBOARD ================================================================== //

export async function atualizarDashboard() {
  const historico = await obterHistorico();
  if (!historico.length) return;

  const qtd = historico.length;
  const total = historico.reduce((sum, reg) => sum + (reg.total || 0), 0);
  const ticketMedio = qtd > 0 ? total / qtd : 0;

  const pix = historico.filter(r => r.pagamento === "PIX").reduce((sum, r) => sum + r.total, 0);
  const credito = historico.filter(r => r.pagamento === "Credito").reduce((sum, r) => sum + r.total, 0);
  const debito = historico.filter(r => r.pagamento === "Debito").reduce((sum, r) => sum + r.total, 0);

  const elQtd = document.getElementById("dash-qtd");
  if (elQtd) elQtd.textContent = qtd;

  const elTotal = document.getElementById("dash-total");
  // USO DA NOVA FUNÇÃO RENOMEADA
  if (elTotal) elTotal.textContent = formatarMoeda(total);

  const elTicket = document.getElementById("dash-ticket");
  if (elTicket) elTicket.textContent = formatarMoeda(ticketMedio);

  const elPix = document.getElementById("dash-pix");
  if (elPix) elPix.textContent = formatarMoeda(pix);

  const elCredito = document.getElementById("dash-credito");
  if (elCredito) elCredito.textContent = formatarMoeda(credito);

  const elDebito = document.getElementById("dash-debito");
  if (elDebito) elDebito.textContent = formatarMoeda(debito);
}

// Vincula ao window para uso global
window.atualizarDashboard = atualizarDashboard;