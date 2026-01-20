



//----------- PDF E WHATSAPP -----------//


const { jsPDF } = window.jspdf;
import {carrinho} from './state.js';
import { salvarOrcamento, obterHistorico } from "./storage.js";

function adicionarMarcaDagua(doc, logo) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const largura = 120;
  const altura = 90;

  const x = (pageWidth - largura) / 2;
  const y = (pageHeight - altura) / 2;

  // Transparência
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.08 }));

  doc.addImage(logo, "PNG", x, y, largura, altura);

  doc.restoreGraphicsState();
}
function gerarNumeroOrcamento() {
  const chave = "MI_ORCAMENTO_SEQ";
  let atual = parseInt(localStorage.getItem(chave) || "0", 10);
  atual++;
  localStorage.setItem(chave, atual);
  return `MI-${String(atual).padStart(6, "0")}`;
}

// ================= ENVIAR WHATSAPP ================== //

export function enviarWhatsApp(carrinho, dadosCliente) {
  const totalBase = carrinho.reduce(
    (soma, item) => soma + item.preco * item.qtd,
    0
  );

  // Usa a mesma regra do PDF
  const pagamentoCalc = calcularPagamento(totalBase, dadosCliente);

  let mensagem = `
ORÇAMENTO - MONTEIRO INTECH

Cliente: ${dadosCliente.nome}
Pagamento: ${dadosCliente.pagamento}
`;

  // 👉 Se tiver parcelamento, mostra parcelas + valor + acréscimo
  if (pagamentoCalc.parcelas && pagamentoCalc.valorParcela) {
    mensagem += `
Parcelamento: ${pagamentoCalc.parcelas}x de ${pagamentoCalc.valorParcela.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })}
Total com acréscimo: ${pagamentoCalc.totalFinal.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })}
`;
  } else {
    mensagem += `
Total: ${pagamentoCalc.totalFinal.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })}
`;
  }

  mensagem += `
Itens:
`;

  carrinho.forEach(item => {
    mensagem += `${item.qtd}x ${item.marca} ${item.modelo} - ${item.nome}\n`;
  });

  mensagem += `
Validade: 7 dias
Monteiro Intech
`;

  const texto = encodeURIComponent(mensagem.trim());
  const telefone = "55997005039"; // seu número
  const url = `https://wa.me/${telefone}?text=${texto}`;

  window.open(url, "_blank");

  // ================= SALVAR NO HISTÓRICO (WHATSAPP) ================= //

salvarOrcamento({
  id: crypto.randomUUID(),
  numero: gerarNumeroOrcamento(),
  cliente: dadosCliente.nome,
  pagamento: dadosCliente.pagamento,
  parcelas: pagamentoCalc.parcelas,
  total: pagamentoCalc.totalFinal,
  data: new Date().toISOString(),
  itens: carrinho,
  origem: "WhatsApp",   // 👈 identifica a origem
  pdf: null             // 👈 não existe PDF nesse caso
});


}

// =============== CÁLCULO DE PAGAMENTO =============== //

function calcularPagamento(total, dadosCliente) {
  const TAXA = 0.0652;

  const pagamento = dadosCliente.pagamento.toLowerCase();
  const parcelas = parseInt(dadosCliente.parcelas || "1");

  // 👉 Cartão crédito SEMPRE tem juros (mesmo 1x)
  const temJuros = pagamento.includes("credito");

  const totalComJuros = temJuros ? total * (1 + TAXA) : total;
  const valorParcela = parcelas > 1 ? totalComJuros / parcelas : null;

  return {
    totalOriginal: total,
    totalFinal: totalComJuros,
    parcelas,
    valorParcela,
    temJuros
  };

}

// ===================== DASHBOARD ==================== //

export function atualizarDashboard() {
  console.log("🔥 atualizarDashboard FOI CHAMADA");

  const historico = obterHistorico();

  const qtd = historico.length;

  let total = 0;
  let pix = 0;
  let credito = 0;
  let debito = 0;

historico.forEach(reg => {
  const forma = (reg.pagamento || "").toLowerCase();
  const valor = Number(reg.total) || 0;

  total += valor;

  if (forma.includes("pix")) pix += valor;
  if (forma.includes("credito")) credito += valor;
  if (forma.includes("debito")) debito += valor;
});


  const ticket = qtd ? total / qtd : 0;

  document.getElementById("dash-qtd").textContent = qtd;
  document.getElementById("dash-total").textContent = total.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
  document.getElementById("dash-ticket").textContent = ticket.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
  document.getElementById("dash-pix").textContent = pix.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
  document.getElementById("dash-credito").textContent = credito.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
  document.getElementById("dash-debito").textContent = debito.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

//==================== GERAR PDF ==================== //

export function gerarPDF(carrinho, dadosCliente) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y = 15;

  // ================= LOGO ================= //

  const logo = new Image();
  logo.src = "/assets/logo.png";

  // ================= DATAS ================= //

  const dataGeracao = new Date();
  const validade = new Date();
  validade.setDate(dataGeracao.getDate() + 7);

  const dataFormatada = dataGeracao.toLocaleDateString("pt-BR");
  const validadeFormatada = validade.toLocaleDateString("pt-BR");

  const numeroOrcamento = gerarNumeroOrcamento();

  logo.onload = () => {

    // ================= MARCA D'ÁGUA =================//

    adicionarMarcaDagua(doc, logo);

    //================== Cabeçalho ====================//

    doc.setFillColor(13, 71, 161);
    doc.rect(0, 0, 210, 30, "F");
    doc.addImage(logo, "PNG", 15, 6, 24, 18);

    doc.setTextColor(255);
    doc.setFontSize(18);
    doc.text("ORÇAMENTO", 200, 18, { align: "right" });

    // ==================== INFO TOPO ===================//

    y = 40;
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.text(`Orçamento Nº: ${numeroOrcamento}`, 15, y);
    doc.text(`Data: ${dataFormatada}`, 150, y);

    y += 8;
    doc.text(`Validade: ${validadeFormatada}`, 15, y);

    // ===================== CLIENTE =====================//

    y += 12;
    doc.setFontSize(13);
    doc.setTextColor(13, 71, 161);
    doc.text("Dados do Cliente", 15, y);

    y += 6;
    doc.setDrawColor(220);
    doc.line(15, y, 195, y);

    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Nome: ${dadosCliente.nome}`, 15, y);

    // ====================== PAGAMENTO ======================//
    y += 12;
    doc.setFontSize(13);
    doc.setTextColor(13, 71, 161);
    doc.text("Forma de Pagamento", 15, y);

    y += 6;
    doc.setDrawColor(220);
    doc.line(15, y, 195, y);

    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Método: ${dadosCliente.pagamento}`, 15, y);


    // ===================== SERVIÇOS ====================== //
    y += 14;
    doc.setFontSize(13);
    doc.setTextColor(13, 71, 161);
    doc.text("Serviços Orçados", 15, y);

    y += 8;
    doc.setDrawColor(180);
    doc.line(15, y, 195, y);

    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(0);


// ==================== TABELA DE SERVIÇOS ==================== //
y += 6;

// Cabeçalho da tabela
doc.setFillColor(230, 240, 255);
doc.rect(15, y, 180, 8, "F");

doc.setFontSize(10);
doc.setTextColor(13, 71, 161);
doc.text("QTD", 18, y + 5);
doc.text("DESCRIÇÃO", 35, y + 5);
doc.text("UNIT.", 150, y + 5, { align: "right" });
doc.text("TOTAL", 190, y + 5, { align: "right" });

y += 10;

doc.setFontSize(10);
doc.setTextColor(0);

let total = 0;

carrinho.forEach(item => {
  const subtotal = item.preco * item.qtd;

  const descricao = `${item.marca || ""} ${item.modelo || ""} - ${item.nome}`;
  const unitario = item.preco.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
  const totalItem = subtotal.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  // Quebra de página automática
  if (y > 260) {
    doc.addPage();
    adicionarMarcaDagua(doc, logo);
    y = 20;
  }

  // Colunas
  doc.text(`${item.qtd}x`, 18, y);
  doc.text(descricao, 35, y, { maxWidth: 105 });
  doc.text(unitario, 150, y, { align: "right" });
  doc.text(totalItem, 190, y, { align: "right" });

  y += 7;
  total += subtotal;
});


// ===================== TOTAL ===================== //
const pagamentoCalc = calcularPagamento(total, dadosCliente);

y += 10;
doc.setFillColor(240, 248, 255);
doc.rect(120, y - 6, 75, 14, "F");

doc.setFontSize(14);
doc.setTextColor(13, 71, 161);
doc.text("TOTAL:", 125, y + 4);

doc.text(
  pagamentoCalc.totalFinal.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  }),
  190,
  y + 4,
  { align: "right" }
);

// ===================== PARCELAMENTO ===================== //
if (pagamentoCalc.valorParcela) {
  y += 12;
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(
    `Parcelamento: ${pagamentoCalc.parcelas}x de ${pagamentoCalc.valorParcela.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })}`,
    15,
    y
  );
}

// ======================= TERMOS ======================== //

y += 18;

const termos = [
  "TERMO E CONDIÇÕES",
  "• Este orçamento possui validade de 7 dias a partir da data de emissão.",
  "• Valores e disponibilidade de peças estão sujeitos a alteração sem aviso prévio.",
  "• Serviços somente serão iniciados após aprovação do orçamento.",
  "• Garantia conforme Código de Defesa do Consumidor.",
  "• Prazo de execução poderá variar conforme disponibilidade de peças.",
  "• Pagamentos em cartão de crédito possuem acréscimo de juros.",
  "• Não nos responsabilizamos por dados armazenados no aparelho do cliente."
];

doc.setFontSize(9);
doc.setTextColor(90);

termos.forEach((linha, index) => {
  // Quebra de página automática
  if (y > 270) {
    doc.addPage();
    adicionarMarcaDagua(doc, logo);
    y = 20;
  }

  // Título em destaque
  if (index === 0) {
    doc.setFontSize(11);
    doc.setTextColor(13, 71, 161);
    doc.text(linha, 15, y);
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(90);
  } else {
    doc.text(linha, 15, y, { maxWidth: 180 });
    y += 5;
  }
});


    // ====================== RODAPÉ ====================== //

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      "Monteiro Intech • WhatsApp: (55) 99700-5039 • Instagram: @intech.monteiro",
      105,
      290,
      { align: "center" }
    );

   
    // ================= SALVAR ================= //

const pdfBase64 = doc.output("datauristring");

console.log("🚀 Enviando para salvarOrcamento", {
  numero: numeroOrcamento,
  pdf: pdfBase64?.length
});


salvarOrcamento({
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

setTimeout(() => {
  if (document.getElementById("painel-admin")?.classList.contains("hidden") === false) {
    atualizarDashboard();
    carregarRelatorio();
  }
}, 300);



doc.save(`Orcamento_${dadosCliente.nome}_${numeroOrcamento}.pdf`);

  };
} 
