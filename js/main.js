import { carregarDados, iniciarEditorPrecos } from "./database.js";
import { carrinho } from "./state.js"; 
import { configurarSidebarToggle, montarHomeEAbas, configurarBusca, mostrarLoading, ocultarLoading } from "./ui.js";
import { atualizarDashboard, gerarPDF, enviarWhatsApp } from "./acoes.js";
import { salvarBackup, restaurarBackup, carregarRelatorio, exportarRelatorioExcel } from "./storage.js";

// ================= FUNÇÕES DO CARRINHO ================= //

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
        <strong>${item.modelo}</strong>
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

  if (carrinho.length === 0) container.innerHTML = "<p class='empty-cart'>Carrinho vazio</p>";

  const totalFormatado = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if(totalEl) totalEl.textContent = `Total: ${totalFormatado}`;
  if(contador) contador.textContent = `Carrinho (${carrinho.reduce((acc, item) => acc + item.qtd, 0)})`;

  localStorage.setItem("carrinho_compras", JSON.stringify(carrinho));
}

function restaurarCarrinho() {
  const salvo = localStorage.getItem("carrinho_compras");
  if (salvo) {
    try {
      const itens = JSON.parse(salvo);
      carrinho.length = 0;
      itens.forEach(i => carrinho.push(i));
    } catch (e) { console.error(e); }
  }
}

function adicionarAoCarrinho(novoItem) {
  const existente = carrinho.find(
    (item) => item.modelo === novoItem.modelo && item.nome === novoItem.nome
  );

  if (existente) {
    existente.qtd++;
  } else {
    carrinho.push({ ...novoItem, qtd: 1 });
  }
  
  atualizarCarrinhoUI();
  document.getElementById("cart-sidebar")?.classList.add("open");
}

function removerDoCarrinho(index) {
  carrinho.splice(index, 1);
  atualizarCarrinhoUI();
}

// ================= INICIALIZAÇÃO ================= //

document.addEventListener("DOMContentLoaded", async () => {

  // --- MODO ADMIN ---
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'admin') {
    document.body.classList.add("admin-mode");
    
    // Esconde elementos da loja
    document.querySelector("header").style.display = "none";
    document.querySelector("footer").style.display = "none";
    document.querySelector("main").style.display = "none";
    
    // Mostra o Painel
    const painel = document.getElementById("painel-admin");
    if (painel) painel.classList.remove("hidden");
    
    // 1. Carrega os dados do Banco
    await carregarDados(); 
    
    // 2. Inicia as ferramentas do Admin (AQUI ESTAVA O ERRO! AGORA VAI!)
    if(typeof atualizarDashboard === 'function') atualizarDashboard();
    if(typeof carregarRelatorio === 'function') carregarRelatorio();
    iniciarEditorPrecos(); // <--- ESSA LINHA FAZ OS PREÇOS APARECEREM!
    
    // Lógica das Abas internas do Admin
    const adminBtns = document.querySelectorAll(".admin-tab-btn");
    const adminContents = document.querySelectorAll(".admin-tab-content");

    if (adminBtns.length > 0) {
        adminBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                // Tira active de todos e esconde conteúdos
                adminBtns.forEach(b => b.classList.remove("active"));
                adminContents.forEach(c => c.style.display = "none");
                
                // Ativa o clicado
                btn.classList.add("active");
                const alvo = document.getElementById(btn.dataset.tab);
                if(alvo) alvo.style.display = "block";
            });
        });
    }

    return; // Para a execução aqui (não carrega loja)
  }

  // --- MODO LOJA (CLIENTE) ---
  restaurarCarrinho();
  atualizarCarrinhoUI();
  
  await carregarDados(); 
  montarHomeEAbas();     
  configurarBusca();     
  configurarSidebarToggle(); 

  // Eventos de Clique (Adicionar ao Carrinho)
  document.getElementById("lista-servicos").addEventListener("click", (e) => {
    if (e.target.classList.contains("add-btn")) {
      e.stopPropagation(); 
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

  // Eventos Carrinho
  document.getElementById("cart-items").addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-item")) {
      removerDoCarrinho(parseInt(e.target.dataset.index));
    }
  });
  
  document.getElementById("btn-clear-cart")?.addEventListener("click", () => {
      carrinho.length = 0;
      atualizarCarrinhoUI();
  });

  // Login Admin (Atalho "admin")
  let keys = [];
  const palavraMagica = "admin";
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("modal-login").classList.contains("hidden")) return;
    if (e.target.tagName === 'INPUT') return;

    keys.push(e.key);
    if (keys.length > palavraMagica.length) keys.shift();
    if (keys.join("").toLowerCase() === palavraMagica) {
      const modal = document.getElementById("modal-login");
      modal.classList.remove("hidden");
      setTimeout(() => document.getElementById("input-senha-admin").focus(), 100);
      keys = [];
    }
  });

  // Verificar Senha e Botões Modal Login
  const btnEntrar = document.getElementById("btn-entrar-admin");
  const modalLogin = document.getElementById("modal-login");
  const inputSenha = document.getElementById("input-senha-admin");

  function tentarLogin() {
      if (inputSenha.value === "1322") {
          window.open(window.location.href.split('?')[0] + "?mode=admin", "_blank");
          modalLogin.classList.add("hidden");
          inputSenha.value = "";
      } else {
          alert("Senha incorreta");
      }
  }

  btnEntrar?.addEventListener("click", tentarLogin);
  inputSenha?.addEventListener("keypress", (e) => { if(e.key === "Enter") tentarLogin(); });
  document.getElementById("btn-fechar-login")?.addEventListener("click", () => modalLogin.classList.add("hidden"));

  // Botões do Orçamento (Modal)
  document.getElementById("btn-gerar-pdf")?.addEventListener("click", () => {
     document.getElementById("modal-orcamento").classList.remove("hidden");
  });
  document.getElementById("btn-open-wa")?.addEventListener("click", () => {
     document.getElementById("modal-orcamento").classList.remove("hidden");
  });
  
  document.getElementById("modal-orcamento-fechar")?.addEventListener("click", () => {
     document.getElementById("modal-orcamento").classList.add("hidden");
  });
  
  // Botão Confirmar Orçamento
  document.getElementById("btn-confirmar-orcamento")?.addEventListener("click", () => {
      // Importa lógica de confirmação do UI ou executa aqui se preferir
      // Por simplicidade, assumimos que acoes.js trata isso ou adicionamos aqui:
      const nome = document.getElementById("cliente-nome").value;
      const pag = document.getElementById("forma-pagamento").value;
      if(nome && pag) {
         // Lógica de envio (PDF ou Zap)
         // Como exemplo simples:
         alert("Processando para " + nome);
         document.getElementById("modal-orcamento").classList.add("hidden");
      } else {
         alert("Preencha os dados");
      }
  });
});