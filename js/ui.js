// ================= IMPORTAÇÕES NECESSÁRIAS ================= //
import { dados, marcas } from "./dados.js"; 
import { carrinho } from "./state.js"; 
import { removerDoCarrinho } from "./carrinho.js";

// ================= UTILITÁRIOS VISUAIS ================= //

export function mostrarLoading() {
  let el = document.getElementById("loading");
  if (!el) {
    el = document.createElement("div");
    el.id = "loading";
    el.className = "loading-overlay";
    el.innerHTML = `<div class="spinner"></div><p style="color:white; margin-top:10px;">Carregando...</p>`;
    el.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center;";
    document.body.appendChild(el);
  }
  el.classList.remove("hidden");
  el.style.display = "flex";
}

export function ocultarLoading() {
  const el = document.getElementById("loading");
  if (el) {
    el.classList.add("hidden");
    el.style.display = "none";
  }
}

export function mostrarAvisoCarrinho(modelo, servico) {
  const aviso = document.createElement("div");
  aviso.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; background: #25d366; color: white;
    padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    font-weight: bold; z-index: 5000; opacity: 0; transition: opacity 0.3s;
  `;
  aviso.innerHTML = `✅ Adicionado: ${modelo} - ${servico}`;
  document.body.appendChild(aviso);
  
  setTimeout(() => aviso.style.opacity = "1", 10);
  setTimeout(() => {
    aviso.style.opacity = "0";
    setTimeout(() => aviso.remove(), 300);
  }, 3000);
}

// ================= CONTROLE DO CARRINHO (SIDEBAR) ================= //

export function configurarSidebarToggle() {
  const btnOpen = document.getElementById("cart-toggle");
  const btnClose = document.getElementById("cart-close");
  const sidebar = document.getElementById("cart-sidebar");

  if (btnOpen && sidebar) btnOpen.onclick = () => sidebar.classList.add("open");
  if (btnClose && sidebar) btnClose.onclick = () => sidebar.classList.remove("open");
}

export function destacarCarrinho() {
  const btn = document.getElementById("cart-toggle");
  if (!btn) return;
  btn.classList.add("bounce"); 
  setTimeout(() => btn.classList.remove("bounce"), 400);
}

export function atualizarSidebar() {
  const lista = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  if (!lista || !totalEl) return;

  lista.innerHTML = "";
  let total = 0;

  if (carrinho.length === 0) {
    lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">O orçamento está vazio.</p>';
    totalEl.textContent = "Total: R$ 0,00";
    return;
  }

  carrinho.forEach(item => {
    total += item.preco * item.qtd;
    const div = document.createElement("div");
    div.className = "cart-item";
    div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #f0f0f0;";
    
    div.innerHTML = `
      <div style="flex-grow:1;">
        <div style="font-weight:bold; font-size:0.9rem; color:#333;">${item.modelo}</div>
        <div style="font-size:0.8rem; color:#004aad; font-weight:600;">${item.nome} (x${item.qtd})</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800; color:#333;">R$ ${(item.preco * item.qtd).toFixed(2)}</div>
        <button class="remove-btn" data-modelo="${item.modelo}" data-nome="${item.nome}" 
                style="background:none; border:none; color:#e53e3e; cursor:pointer; font-size:0.75rem; font-weight:bold; padding:5px 0;">
                Remover
        </button>
      </div>
    `;
    lista.appendChild(div);
  });

  totalEl.textContent = `Total: ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
}

// ================= RENDERIZAÇÃO DE PRODUTOS E BUSCA ================= //

export function configurarBusca() {
  const searchInput = document.getElementById("app-search");
  if (!searchInput) return;

  searchInput.oninput = (e) => {
    const termo = e.target.value.toLowerCase().trim();
    if (termo === "") {
      if (marcas.length > 0) renderizarLista(dados.filter(p => p.marca === marcas[0]));
      return;
    }
    
    const filtrados = dados.filter(p => 
      p.modelo.toLowerCase().includes(termo) || 
      p.marca.toLowerCase().includes(termo)
    );
    
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    renderizarLista(filtrados);
  };
}

export function montarHomeEAbas() {
  const container = document.getElementById("brand-tabs");
  if (!container) return;
  container.innerHTML = "";

  marcas.forEach((marca, idx) => {
    const btn = document.createElement("button");
    btn.textContent = marca;
    btn.className = `tab-btn ${idx === 0 ? 'active' : ''}`;
    
    btn.onclick = () => {
      const search = document.getElementById("app-search");
      if(search) search.value = ""; 

      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderizarLista(dados.filter(p => p.marca === marca));
    };
    
    container.appendChild(btn);
  });

  if (marcas.length > 0) {
    renderizarLista(dados.filter(p => p.marca === marcas[0]));
  }
}

export function renderizarLista(produtos) {
  const container = document.getElementById("lista-servicos");
  if (!container) return;
  
  const heroHtml = container.querySelector(".hero-home")?.outerHTML || "";
  container.innerHTML = heroHtml;

  if (produtos.length === 0) {
    container.innerHTML += `<p style="text-align:center; padding:30px; color:#666;">Nenhum aparelho encontrado.</p>`;
    return;
  }

  produtos.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    
    let servicosHtml = "";
    Object.keys(p.servicosMap || {}).forEach(nome => {
      const preco = p.servicosMap[nome];
      if (preco > 0) {
        servicosHtml += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee;">
            <span style="font-size:0.95rem; color:#555;">${nome}</span>
            <button class="add-btn-final" 
                    data-marca="${p.marca}" data-modelo="${p.modelo}" 
                    data-servico="${nome}" data-preco="${preco}"
                    style="background:white; color:#004aad; border:1px solid #004aad; border-radius:20px; padding:6px 15px; font-weight:bold; cursor:pointer; transition:0.2s;">
              + R$ ${preco.toFixed(2)}
            </button>
          </div>
        `;
      }
    });

    card.innerHTML = `
      <div class="card-header" style="cursor:pointer; padding:15px; background:#fff; border:1px solid #d1e3f8; border-radius:8px; margin-bottom:5px; display:flex; justify-content:space-between;">
        <h3 style="margin:0; color:#004aad;">📱 ${p.modelo}</h3>
        <span style="color:#888;">▼</span>
      </div>
      <div class="card-services" style="display:none; padding:5px 15px; background:#fdfdfd; border:1px solid #eee; border-top:none; border-radius: 0 0 8px 8px;">
        ${servicosHtml || "<p style='color:#999; text-align:center;'>Nenhum preço cadastrado.</p>"}
      </div>
    `;

    card.querySelector(".card-header").onclick = () => {
      const body = card.querySelector(".card-services");
      const seta = card.querySelector(".card-header span");
      if (body.style.display === "none") {
        body.style.display = "block";
        seta.textContent = "▲";
      } else {
        body.style.display = "none";
        seta.textContent = "▼";
      }
    };

    container.appendChild(card);
  });
}