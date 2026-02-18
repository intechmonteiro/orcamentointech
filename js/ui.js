import { dados, marcas, colunasServicos } from "./state.js";

// ================= LOADING ================= //
export function mostrarLoading() {
  const loading = document.getElementById("loading");
  if (loading) loading.style.display = "flex";
}

export function ocultarLoading() {
  const loading = document.getElementById("loading");
  if (loading) loading.style.display = "none";
}

// ================= SIDEBAR ================= //
export function configurarSidebarToggle() {
  const toggleBtn = document.getElementById("cart-toggle");
  const sidebar = document.getElementById("cart-sidebar");
  const closeBtn = document.getElementById("cart-close");

  if (toggleBtn) toggleBtn.addEventListener("click", () => sidebar?.classList.add("open"));
  if (closeBtn) closeBtn.addEventListener("click", () => sidebar?.classList.remove("open"));
}

// ================= RENDERIZAÇÃO (A Mágica do Accordion) ================= //

function renderizarLista(listaDeProdutos) {
  const containerLista = document.getElementById("lista-servicos");
  if (!containerLista) return;

  containerLista.innerHTML = "";

  if (listaDeProdutos.length === 0) {
    containerLista.innerHTML = `<p style='text-align:center; padding:20px; color:#666;'>Nenhum modelo encontrado.</p>`;
    return;
  }

  listaDeProdutos.forEach(produto => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.marca = produto.marca;
    card.dataset.modelo = produto.modelo;

    let htmlServicos = "";
    let menorPreco = Infinity;
    let temServico = false;
    
    const chavesServicos = colunasServicos.length > 0 ? colunasServicos : (produto.servicosMap ? Object.keys(produto.servicosMap) : []);

    chavesServicos.forEach((servico) => {
      let preco = 0;
      if (produto.servicosMap) preco = produto.servicosMap[servico] || 0;
      
      if (preco > 0) {
        temServico = true;
        if (preco < menorPreco) menorPreco = preco;

        const precoFormatado = preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        htmlServicos += `
          <div class="service-row">
            <span class="service-name">${servico}</span>
            <button class="add-btn" data-servico="${servico}" data-preco="${preco}">
              + ${precoFormatado}
            </button>
          </div>
        `;
      }
    });

    if (!temServico) return; 

    const textoApartir = menorPreco < Infinity 
      ? `A partir de <strong>${menorPreco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>` 
      : "";

    card.innerHTML = `
      <div class="card-header">
        <div class="header-info">
          <h3>📱 ${produto.modelo}</h3>
          <span class="price-preview">${textoApartir}</span>
        </div>
        <div class="toggle-icon">▼</div>
      </div>
      <div class="card-services">${htmlServicos}</div>
    `;

    // Evento de abrir/fechar
    const header = card.querySelector(".card-header");
    header.addEventListener("click", () => {
      const estaAberto = card.classList.contains("open");
      document.querySelectorAll(".card.open").forEach(c => c.classList.remove("open"));
      if (!estaAberto) card.classList.add("open");
    });

    containerLista.appendChild(card);
  });
}

// ================= EXPORTS PARA O MAIN ================= //

export function montarHomeEAbas() {
  const containerAbas = document.getElementById("brand-tabs");
  if (!containerAbas) return;

  containerAbas.innerHTML = "";
  marcas.forEach((marca, index) => {
    const btn = document.createElement("button");
    btn.textContent = marca;
    btn.className = "tab-btn";
    if (index === 0) btn.classList.add("active");

    btn.addEventListener("click", () => {
      document.getElementById("app-search").value = ""; // Limpa busca
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const filtrados = dados.filter(p => p.marca === marca);
      renderizarLista(filtrados);
    });
    containerAbas.appendChild(btn);
  });

  if (marcas.length > 0) {
    const primeiraMarca = dados.filter(p => p.marca === marcas[0]);
    renderizarLista(primeiraMarca);
  }
}

export function configurarBusca() {
  const input = document.getElementById("app-search");
  if (!input) return;

  input.addEventListener("input", (e) => {
    const termo = e.target.value.toLowerCase();
    if (termo === "") {
      document.querySelector(".tab-btn.active")?.click();
      return;
    }
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    const filtrados = dados.filter(p => p.modelo.toLowerCase().includes(termo) || p.marca.toLowerCase().includes(termo));
    renderizarLista(filtrados);
  });
}