import { db } from "./firebase.js";
import { carregarDados, iniciarEditorPrecos } from "./database.js";
import { carrinho, restaurarCarrinho } from "./state.js"; // Importa APENAS dados
import { configurarSidebarToggle, configurarPWAInstall, mostrarLoading, ocultarLoading, montarHomeEAbas } from "./ui.js";
import { atualizarDashboard, gerarPDF, enviarWhatsApp } from "./acoes.js";
import { salvarBackup, restaurarBackup, carregarRelatorio, exportarRelatorioExcel } from "./storage.js";

// ================= FUNÇÕES DO CARRINHO (LOCAIS) ================= //

function atualizarCarrinhoUI() {
  const container = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  const contador = document.getElementById("cart-text");

  if (!container) return;

  container.innerHTML = "";
  let total = 0;

  carrinho.forEach((item, index) => {
    const div = document.createElement("div");
    div.classList.add("cart-item");
    div.innerHTML = `
      <div class="cart-item-info">
        <strong>${item.marca} ${item.modelo}</strong>
        <span>${item.nome}</span>
        <span>R$ ${item.preco.toFixed(2)}</span>
      </div>
      <div class="cart-item-actions">
        <span class="qtd">x${item.qtd}</span>
        <button class="remove-item" data-index="${index}">🗑️</button>
      </div>
    `;
    container.appendChild(div);
    total += item.preco * item.qtd;
  });

  if (carrinho.length === 0) {
    container.innerHTML = "<p class='empty-cart'>Seu carrinho está vazio</p>";
  }

  const totalFormatado = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  totalEl.textContent = `Total: ${totalFormatado}`;
  contador.textContent = `Carrinho (${carrinho.reduce((acc, item) => acc + item.qtd, 0)})`;

  // Salva no localStorage
  localStorage.setItem("carrinho_compras", JSON.stringify(carrinho));
}

function adicionarAoCarrinho(novoItem) {
  // Verifica se já existe para aumentar qtd
  const existente = carrinho.find(
    (item) => item.marca === novoItem.marca && item.modelo === novoItem.modelo && item.nome === novoItem.nome
  );

  if (existente) {
    existente.qtd++;
  } else {
    carrinho.push({ ...novoItem, qtd: 1 });
  }
  
  atualizarCarrinhoUI();
  
  // Abre o sidebar para feedback visual
  const sidebar = document.getElementById("cart-sidebar");
  if (sidebar) sidebar.classList.add("open");
}

function removerDoCarrinho(index) {
  carrinho.splice(index, 1);
  atualizarCarrinhoUI();
}


// ================= INICIALIZAÇÃO ================= //

document.addEventListener("DOMContentLoaded", async () => {

  // 1. Verifica se é ADMIN (Nova Janela)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'admin') {
    document.body.classList.add("admin-mode");
    
    // Esconde elementos da loja
    document.querySelector("header").style.display = "none";
    document.querySelector("footer").style.display = "none";
    document.querySelector("main").style.display = "none";
    
    // Mostra Painel
    const painel = document.getElementById("painel-admin");
    if(painel) painel.classList.remove("hidden");
    
    // Carrega dados e ferramentas
    await carregarDados(); 
    atualizarDashboard();
    carregarRelatorio();
    iniciarEditorPrecos();
    
    return; // Para a execução aqui
  }

  // 2. Modo Loja Normal
  restaurarCarrinho();
  atualizarCarrinhoUI(); // Atualiza visual inicial
  
  await carregarDados(); 
  montarHomeEAbas();
  configurarSidebarToggle();
  configurarPWAInstall();

  // Botão Limpar Carrinho
  const btnLimpar = document.getElementById("btn-clear-cart");
  btnLimpar?.addEventListener("click", () => {
    if (carrinho.length === 0) return alert("O carrinho já está vazio!");
    if (confirm("Tem certeza que deseja limpar todo o carrinho?")) {
      carrinho.length = 0;
      atualizarCarrinhoUI();
      document.getElementById("cart-sidebar").classList.remove("open");
    }
  });

  // Eventos de Clique (Adicionar ao Carrinho)
  document.getElementById("lista-servicos").addEventListener("click", (e) => {
    if (e.target.classList.contains("add-btn")) {
      const card = e.target.closest(".card");
      const servico = {
        marca: card.dataset.marca,
        modelo: card.dataset.modelo,
        nome: e.target.dataset.servico,
        preco: parseFloat(e.target.dataset.preco)
      };
      adicionarAoCarrinho(servico);
    }
  });

  // Eventos de Clique (Remover do Carrinho)
  document.getElementById("cart-items").addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-item")) {
      const index = parseInt(e.target.dataset.index);
      removerDoCarrinho(index);
    }
  });

  // Botões de Ação
  document.getElementById("btn-gerar-pdf").addEventListener("click", () => abrirModalOrcamento("pdf"));
  document.getElementById("btn-open-wa").addEventListener("click", () => abrirModalOrcamento("whatsapp"));
  
  document.getElementById("modal-orcamento-fechar").addEventListener("click", fecharModalOrcamento);
  document.getElementById("btn-confirmar-orcamento").addEventListener("click", confirmarOrcamento);

  document.getElementById("forma-pagamento").addEventListener("change", (e) => {
    const parcelas = document.getElementById("parcelas");
    if (e.target.value === "Credito") {
      parcelas.classList.remove("hidden");
    } else {
      parcelas.classList.add("hidden");
      parcelas.value = "";
    }
  });

  // Atalho Admin (1322 -> Nova Janela)
  let keys = [];
  const senha = "1322";
  document.addEventListener("keydown", (e) => {
    keys.push(e.key);
    if (keys.length > senha.length) keys.shift();
    if (keys.join("") === senha) {
       const urlAdmin = window.location.href.split('?')[0] + "?mode=admin";
       window.open(urlAdmin, "_blank");
    }
  });

  // Botões Admin (Exportação)
  document.getElementById("btn-exportar-backup").addEventListener("click", salvarBackup);
  document.getElementById("btn-importar-backup").addEventListener("click", () => document.getElementById("input-importar-backup").click());
  document.getElementById("input-importar-backup").addEventListener("change", restaurarBackup);
  document.getElementById("btn-exportar-relatorio").addEventListener("click", exportarRelatorioExcel);
});

// ================= FUNÇÕES MODAL ================= //

let acaoAtual = "";

function abrirModalOrcamento(acao) {
  if (carrinho.length === 0) return alert("Carrinho vazio!");
  acaoAtual = acao;
  document.getElementById("modal-orcamento").classList.remove("hidden");
}

function fecharModalOrcamento() {
  document.getElementById("modal-orcamento").classList.add("hidden");
}

function confirmarOrcamento() {
  const nome = document.getElementById("cliente-nome").value.trim();
  const pag = document.getElementById("forma-pagamento").value;
  const parc = document.getElementById("parcelas").value;

  if (!nome || !pag) return alert("Preencha nome e forma de pagamento.");
  if (pag === "Credito" && !parc) return alert("Selecione as parcelas.");

  const dadosCliente = { nome, pagamento: pag, parcelas: parc };

  mostrarLoading();
  
  if (acaoAtual === "pdf") {
    gerarPDF(carrinho, dadosCliente);
  } else {
    enviarWhatsApp(carrinho, dadosCliente);
  }

  fecharModalOrcamento();
  ocultarLoading();
}