



//------------------------- IMPORTAÇÕES ---------------------------//


import { carregarDados, iniciarEditorPrecos } from "./database.js";
import { carrinho, adicionarAoCarrinho, removerDoCarrinho, atualizarCarrinhoUI, restaurarCarrinho } from "./state.js";
import { configurarSidebarToggle, configurarPWAInstall, mostrarLoading, ocultarLoading, montarHomeEAbas } from "./ui.js";
import { atualizarDashboard, gerarPDF, enviarWhatsApp } from "./acoes.js";
import { salvarBackup, restaurarBackup, carregarRelatorio, exportarRelatorioExcel } from "./storage.js";

// Inicialização
document.addEventListener("DOMContentLoaded", async () => {
  restaurarCarrinho();
});
  document.addEventListener("DOMContentLoaded", async () => {

  // === VERIFICAÇÃO SE É MODO ADMIN (NOVA JANELA) === //
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'admin') {
    // Modo Admin: Esconde loja, mostra painel
    document.body.classList.add("admin-mode"); // Opcional para CSS
    document.querySelector("header").style.display = "none";
    document.querySelector("footer").style.display = "none";
    document.querySelector("main").style.display = "none";
    document.getElementById("painel-admin").classList.remove("hidden");
    
    // Carrega dados e inicia editor
    await carregarDados(); 
    atualizarDashboard();
    carregarRelatorio();
    iniciarEditorPrecos();
    
    return; // Pára de carregar o resto do site (carrinho, etc)
  }
  // ==================================================== //

  restaurarCarrinho();
  // ... resto do código continua igual ...
  
  // Agora carrega do Banco de Dados (ou CSV se tiver vazio)
  await carregarDados(); 
  
  montarHomeEAbas();
  configurarSidebarToggle();
  configurarPWAInstall();

  // ================= BOTÃO LIMPAR CARRINHO ================= //
  const btnLimpar = document.getElementById("btn-clear-cart");
  
  btnLimpar?.addEventListener("click", () => {
    if (carrinho.length === 0) return alert("O carrinho já está vazio!");
    
    if (confirm("Tem certeza que deseja limpar todo o carrinho?")) {
      // Importe a função limparCarrinho do state.js se ela não estiver sendo usada globalmente
      // Ou limpamos manualmente aqui:
      carrinho.length = 0;
      localStorage.removeItem("carrinho_compras");
      atualizarCarrinhoUI();
      document.getElementById("cart-sidebar").classList.remove("open");
    }
  });

  // Eventos do Carrinho
  document.getElementById("lista-servicos").addEventListener("click", (e) => {
    if (e.target.classList.contains("add-btn")) {
      const card = e.target.closest(".card");
      const servico = {
        id: card.dataset.id || card.dataset.modelo + "-" + e.target.dataset.servico, // ID único
        marca: card.dataset.marca,
        modelo: card.dataset.modelo,
        nome: e.target.dataset.servico,
        preco: parseFloat(e.target.dataset.preco)
      };
      adicionarAoCarrinho(servico);
    }
  });

  document.getElementById("cart-items").addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-item")) {
      const index = parseInt(e.target.dataset.index);
      removerDoCarrinho(index);
    }
  });

  // Botões de Ação
  document.getElementById("btn-gerar-pdf").addEventListener("click", () => abrirModalOrcamento("pdf"));
  document.getElementById("btn-open-wa").addEventListener("click", () => abrirModalOrcamento("whatsapp"));
  
  // Modal Orçamento
  document.getElementById("modal-orcamento-fechar").addEventListener("click", fecharModalOrcamento);
  document.getElementById("btn-confirmar-orcamento").addEventListener("click", confirmarOrcamento);

  // Filtros de pagamento
  document.getElementById("forma-pagamento").addEventListener("change", (e) => {
    const parcelas = document.getElementById("parcelas");
    if (e.target.value === "Credito") {
      parcelas.classList.remove("hidden");
    } else {
      parcelas.classList.add("hidden");
      parcelas.value = "";
    }
  });

  // Admin Toggle (Atalho de teclado)
// Admin Toggle (Atalho de teclado)
  let keys = [];
  const senha = "1322";
  document.addEventListener("keydown", (e) => {
    keys.push(e.key);
    if (keys.length > senha.length) keys.shift();
    if (keys.join("") === senha) {
      // EM VEZ DE ABRIR DIRETO, ABRE NOVA JANELA COM "?mode=admin"
      const urlAdmin = window.location.href.split('?')[0] + "?mode=admin";
      window.open(urlAdmin, "_blank");
    }
  });

  // Botões Admin
  document.getElementById("btn-exportar-backup").addEventListener("click", salvarBackup);
  document.getElementById("btn-importar-backup").addEventListener("click", () => document.getElementById("input-importar-backup").click());
  document.getElementById("input-importar-backup").addEventListener("change", restaurarBackup);
  
  document.getElementById("btn-exportar-relatorio").addEventListener("click", exportarRelatorioExcel);
});

// ================= FUNÇÕES DE MODAL ================= //

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

function abrirPainelAdmin() {
  const painel = document.getElementById("painel-admin");
  painel.classList.remove("hidden");

  // Carrega os relatórios e gráficos
  atualizarDashboard();
  carregarRelatorio();
  
  // Inicia o editor de preços (Busca e Edição)
  iniciarEditorPrecos();
}