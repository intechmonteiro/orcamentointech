// ======================================================== //
// acoes.js - PDF, WhatsApp e Dashboard
// ======================================================== //

import { salvarOrcamento, obterHistorico } from "./storage.js"; 
import { formatBR } from "./utils.js"; 

// ================= CÁLCULO DE PAGAMENTO ================= //
function calcularPagamento(total, dadosCliente) {
  const TAXA = 0.0652; // 6,52% no crédito
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

// ================= ENVIAR WHATSAPP ================== //
export async function enviarWhatsApp(carrinho, dadosCliente) {
  const totalBase = carrinho.reduce((soma, item) => soma + item.preco * item.qtd, 0);
  const pagamentoCalc = calcularPagamento(totalBase, dadosCliente);

  let mensagem = `*ORÇAMENTO - MONTEIRO INTECH*\n\n`;
  mensagem += `👤 *Cliente:* ${dadosCliente.nome}\n`;
  mensagem += `💳 *Pagamento:* ${dadosCliente.pagamento}\n\n`;

  if (pagamentoCalc.parcelas && pagamentoCalc.valorParcela) {
    mensagem += `*Parcelamento:* ${pagamentoCalc.parcelas}x de ${formatBR(pagamentoCalc.valorParcela)}\n`;
    mensagem += `*Total com acréscimo:* ${formatBR(pagamentoCalc.totalFinal)}\n\n`;
  } else {
    mensagem += `*Total:* ${formatBR(pagamentoCalc.totalFinal)}\n\n`;
  }

  mensagem += `*Itens do Orçamento:*\n`;
  carrinho.forEach(item => {
    mensagem += `▸ ${item.qtd}x ${item.modelo} - ${item.nome}\n`;
  });

  mensagem += `\n_Validade: 7 dias_\n_Monteiro Intech_`;

  const texto = encodeURIComponent(mensagem.trim());
  const telefone = "55997005039"; 
  const url = `https://wa.me/${telefone}?text=${texto}`;

  window.open(url, "_blank");

  await salvarOrcamento({
    id: crypto.randomUUID(),
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

// ================= GERAR PDF ================== //
export async function gerarPDF(carrinho, dadosCliente) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const azulMonteiro = [0, 74, 173]; 

  const numeroOrcamento = gerarNumeroOrcamento();
  const totalBase = carrinho.reduce((soma, item) => soma + item.preco * item.qtd, 0);
  const pagamentoCalc = calcularPagamento(totalBase, dadosCliente);

  // CABEÇALHO
  doc.setFillColor(...azulMonteiro);
  doc.rect(0, 0, 210, 40, 'F'); 

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("MONTEIRO INTECH", 20, 25);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Assistência Técnica Especializada", 20, 32);

  // ENDEREÇO OFICIAL
  doc.setFontSize(9);
  doc.text("Rua Paulo Gelson Padilha, 58", 140, 20);
  doc.text("Menino Deus - Porto Alegre/RS", 140, 25);
  doc.text("WhatsApp: (55) 99700-5039", 140, 30);

  // DADOS DO CLIENTE
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("ORÇAMENTO DE SERVIÇOS", 20, 55);
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº: ${numeroOrcamento}`, 170, 55);
  
  doc.text(`Cliente: ${dadosCliente.nome}`, 20, 65);
  doc.text(`Forma de Pagamento: ${dadosCliente.pagamento}`, 20, 72);

  doc.setDrawColor(200, 200, 200);
  doc.line(20, 77, 190, 77);

  // TABELA DE ITENS
  let y = 90;
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text("Qtd", 20, 85);
  doc.text("Descrição do Aparelho / Serviço", 35, 85);
  doc.text("Preço", 170, 85);

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  carrinho.forEach((item) => {
    doc.text(`${item.qtd}x`, 20, y);
    doc.text(`${item.modelo} - ${item.nome}`, 35, y);
    doc.text(formatBR(item.preco * item.qtd), 170, y);
    y += 10;
  });

  // TOTAL
  y += 10;
  doc.setDrawColor(...azulMonteiro);
  doc.setLineWidth(1);
  doc.line(120, y, 190, y);
  
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("TOTAL:", 120, y);
  doc.setTextColor(...azulMonteiro);
  doc.text(formatBR(pagamentoCalc.totalFinal), 160, y);

  if (pagamentoCalc.parcelas > 1) {
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.setFont("helvetica", "normal");
      doc.text(`Em ${pagamentoCalc.parcelas}x de ${formatBR(pagamentoCalc.valorParcela)} no cartão`, 120, y);
  }

  // RODAPÉ
  const dataAjustada = new Date().toLocaleDateString('pt-BR');
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(`Orçamento válido por 7 dias. Gerado em: ${dataAjustada}`, 20, 280);

  // SALVAR NO BANCO
  const pdfBase64 = doc.output("datauristring");

  await salvarOrcamento({
    id: crypto.randomUUID(),
    numero: numeroOrcamento,
    cliente: dadosCliente.nome,
    pagamento: dadosCliente.pagamento,
    parcelas: pagamentoCalc.parcelas,
    total: pagamentoCalc.totalFinal,
    data: new Date().toISOString(),
    itens: carrinho,
    pdf: pdfBase64
  });

  if (typeof window.atualizarDashboard === "function") window.atualizarDashboard();

  // DOWNLOAD
  const nomeArquivo = `Orcamento_${dadosCliente.nome.replace(/\s+/g, '_')}_${numeroOrcamento}.pdf`;
  doc.save(nomeArquivo);
}

// ================= ATUALIZAR DASHBOARD ================== //
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
  if (elTotal) elTotal.textContent = formatBR(total);
  
  const elTicket = document.getElementById("dash-ticket");
  if (elTicket) elTicket.textContent = formatBR(ticketMedio);
  
  const elPix = document.getElementById("dash-pix");
  if (elPix) elPix.textContent = formatBR(pix);
  
  const elCredito = document.getElementById("dash-credito");
  if (elCredito) elCredito.textContent = formatBR(credito);
  
  const elDebito = document.getElementById("dash-debito");
  if (elDebito) elDebito.textContent = formatBR(debito);
}
window.atualizarDashboard = atualizarDashboard;