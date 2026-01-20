// ---------- ORQUESTRAÇÃO GERAL -----------

import { carregarCSV } from "./csv.js";
import { restaurarCarrinho, limparCarrinho } from "./carrinho.js";
import { gerarPDF, enviarWhatsApp } from "./acoes.js";
import { montarHomeEAbas, configurarSidebarToggle } from "./ui.js";
import { configurarPWAInstall } from "./pwa.js";
import { salvarOrcamento, obterHistorico } from "./storage.js";
import { carrinho } from "./state.js";
import { atualizarDashboard } from "./acoes.js";
import { restaurarBackup } from "./storage.js";


document.addEventListener("DOMContentLoaded", async () => {
  restaurarCarrinho();
  await carregarCSV();
  montarHomeEAbas();
  configurarSidebarToggle();
  configurarPWAInstall();

// =================  MODAL CHECKOUT (PDF / WHATS ======================== //

const modal = document.getElementById("modal-orcamento");
const btnClose = document.getElementById("modal-orcamento-fechar");
const btnConfirmar = document.getElementById("btn-confirmar-orcamento");

const inputNome = document.getElementById("cliente-nome");
const selectPagamento = document.getElementById("forma-pagamento");
const selectParcelas = document.getElementById("parcelas");

let acaoAtual = null;

// Abrir modal
function abrirCheckout(acao) {
  acaoAtual = acao;
  modal.classList.remove("hidden");
}
// Fechar modal
function fecharCheckout() {
  modal.classList.add("hidden");
  acaoAtual = null;
  inputNome.value = "";
  selectPagamento.value = "";
  selectParcelas.classList.add("hidden");
  selectParcelas.value = "";
}
// Botões abrir
document.getElementById("btn-gerar-pdf")?.addEventListener("click", () => {
  if (!carrinho.length) return alert("Carrinho vazio");
  abrirCheckout("pdf");
});
document.getElementById("btn-open-wa")?.addEventListener("click", () => {
  if (!carrinho.length) return alert("Carrinho vazio");
  abrirCheckout("whats");
});
// Fechar modal
btnClose?.addEventListener("click", fecharCheckout);
// Mostrar parcelas
selectPagamento?.addEventListener("change", () => {
  if (
    selectPagamento.value === "Credito" ||
    selectPagamento.value === "Parcelado"
  ) {
    selectParcelas.classList.remove("hidden");
  } else {
    selectParcelas.classList.add("hidden");
    selectParcelas.value = "";
  }
});
// Confirmar
btnConfirmar?.addEventListener("click", () => {
  if (!inputNome.value.trim()) {
    alert("Informe o nome do cliente");
    return;
  }

  if (!selectPagamento.value) {
    alert("Selecione a forma de pagamento");
    return;
  }

  if (
    (selectPagamento.value === "Credito" ||
      selectPagamento.value === "Parcelado") &&
    !selectParcelas.value
  ) {
    alert("Selecione o número de parcelas (máx. 3x)");
    return;
  }

  const dadosCliente = {
    nome: inputNome.value.trim(),
    pagamento: selectPagamento.value,
    parcelas: selectParcelas.value || null,
    validade: "7 dias",
    data: new Date().toLocaleString("pt-BR")
  };

  if (acaoAtual === "pdf") gerarPDF(carrinho, dadosCliente);
  if (acaoAtual === "whats") enviarWhatsApp(carrinho, dadosCliente);

  fecharCheckout();
});
});

// =================  BUFFER DE TECLAS ======================== //

let bufferTeclas = "";

// =================  ACESSO ADMINISTRATIVO ======================== //

window.addEventListener("keydown", (e) => {
  if (!e.key || typeof e.key !== "string") return;

  bufferTeclas += e.key.toLowerCase();
  bufferTeclas = bufferTeclas.slice(-10);

  if (bufferTeclas.includes("admin")) {
    bufferTeclas = "";
    solicitarPinAdmin();
  }
});

const PIN_ADMIN = "1322"; // seu PIN

function solicitarPinAdmin() {
  const pin = prompt("🔐 Área administrativa — Digite o PIN:");

  if (pin === PIN_ADMIN) {
    abrirPainelAdmin();
  } else {
    alert("❌ PIN incorreto.");
  }
}
function abrirPainelAdmin() {
  const painel = document.getElementById("painel-admin");
  painel.classList.remove("hidden");

  atualizarDashboard();
  carregarRelatorio();
}


document
  .getElementById("btn-fechar-admin")
  ?.addEventListener("click", () => {
    document.getElementById("painel-admin").classList.add("hidden");
  });


// ================= RELATÓRIO ================= //

function carregarRelatorio() {
  console.log("🚀 carregarRelatorio disparou");

  const lista = document.getElementById("relatorio-lista");
  const historico = obterHistorico();

  const busca = document.getElementById("busca-relatorio")?.value.toLowerCase() || "";
  const filtroPagamento = document.getElementById("filtro-pagamento")?.value || "";

  let filtrados = historico.filter(reg => {
    const texto =
      `${reg.cliente} ${reg.numero}`.toLowerCase();

    const bateBusca = texto.includes(busca);
    const batePagamento = !filtroPagamento || reg.pagamento === filtroPagamento;

    return bateBusca && batePagamento;
  });

  if (!filtrados.length) {
    lista.innerHTML = "<p>Nenhum resultado encontrado.</p>";
    return;
  }

  lista.innerHTML = "";

  filtrados.forEach((reg, index) => {
    const div = document.createElement("div");
    div.className = "relatorio-item";

    const total = Number(reg.total) || 0;

    div.innerHTML = `
      <strong>#${index + 1} — ${reg.numero}</strong><br>
      👤 Cliente: ${reg.cliente}<br>
      💳 Pagamento: ${reg.pagamento}<br>
📤 Origem: ${reg.origem || "PDF"}<br>

      💰 Total: ${total.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      })}<br>
      🕒 Data: ${new Date(reg.data).toLocaleString("pt-BR")}<br><br>

      <button class="btn-abrir-pdf">📄 Abrir PDF</button>
    `;

    div.querySelector(".btn-abrir-pdf").addEventListener("click", () => {
      if (!reg.pdf) {
        alert("❌ Este orçamento não possui PDF salvo.");
        return;
      }

      const novaJanela = window.open();
      novaJanela.document.write(`
        <iframe 
          src="${reg.pdf}" 
          width="100%" 
          height="100%" 
          style="border:none;"
        ></iframe>
      `);
    });

    lista.appendChild(div);
  });
}

document.getElementById("busca-relatorio")?.addEventListener("input", carregarRelatorio);
document.getElementById("filtro-pagamento")?.addEventListener("change", carregarRelatorio);


// ================= BACKUP ================= //

document
  .getElementById("btn-exportar-backup")
  ?.addEventListener("click", () => {
    const historico = localStorage.getItem("MI_HISTORICO_ORCAMENTOS");

    if (!historico) {
      alert("Nenhum dado para backup.");
      return;
    }

    const blob = new Blob([historico], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_orcamentos_${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  });

  // ================= IMPORTAR BACKUP ================= //

const btnImportar = document.getElementById("btn-importar-backup");
const inputImportar = document.getElementById("input-importar-backup");

btnImportar?.addEventListener("click", () => {
  inputImportar.click();
});
inputImportar?.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const conteudo = e.target.result;
      const dados = JSON.parse(conteudo);

      if (!Array.isArray(dados)) {
        alert("❌ Arquivo inválido.");
        return;
      }

      localStorage.setItem("MI_HISTORICO_ORCAMENTOS", JSON.stringify(dados));
      alert("✅ Backup importado com sucesso!");

      // Atualiza painel automaticamente
      carregarRelatorio();
    } catch (err) {
      console.error(err);
      alert("❌ Erro ao importar o backup.");
    }
  };

  reader.readAsText(file);
});
document.getElementById("btn-exportar-relatorio")?.addEventListener("click", () => {
  const historico = obterHistorico();

  if (!historico.length) {
    alert("Nenhum dado para exportar.");
    return;
  }

  const cabecalho = [
    "Número",
    "Cliente",
    "Pagamento",
    "Total",
    "Data"
  ];

  const linhas = historico.map(reg => [
    reg.numero,
    reg.cliente,
    reg.pagamento,
    Number(reg.total || 0).toFixed(2),
    new Date(reg.data).toLocaleString("pt-BR")
  ]);

  const csv = [
    cabecalho.join(";"),
    ...linhas.map(l => l.join(";"))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio_orcamentos_${Date.now()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
});


// ================= RESTAURAR BACKUP ================= //


const btnBackup = document.getElementById("btn-restaurar-backup");
const inputBackup = document.getElementById("input-backup");

btnBackup.addEventListener("click", () => {
  inputBackup.click();
});

inputBackup.addEventListener("change", (e) => {
  const arquivo = e.target.files[0];
  if (arquivo) {
    restaurarBackup(arquivo);
  }
});