



// ---------- INTERFACE (DOM, SIDEBAR, HOME)  ----------- //


import { $ } from "./utils.js";
import { marcas, dados, carrinho } from "./state.js";
import { mostrarModelosPorMarca } from "./modelos.js";
import { removerDoCarrinho, limparCarrinho } from "./carrinho.js";
import { mostrarServicos } from "./servicos.js";



export function montarHomeEAbas() {
  const tabs = $("brand-tabs");
  if (!tabs) return;
  tabs.innerHTML = "";

  const btnHome = document.createElement("button");
  btnHome.className = "brand-tab-btn active";
  btnHome.dataset.marca = "Home";
  btnHome.textContent = "Home";
  btnHome.addEventListener("click", () => {
    document.querySelectorAll(".brand-tab-btn").forEach(b => b.classList.remove("active"));
    btnHome.classList.add("active");
    mostrarHome();
  });
  tabs.appendChild(btnHome);

  marcas.forEach(m => {
    const btn = document.createElement("button");
    btn.className = "brand-tab-btn";
    btn.textContent = m;
    btn.dataset.marca = m;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".brand-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      mostrarModelosPorMarca(m);
    });
    tabs.appendChild(btn);
  });

  mostrarHome();
}
export function mostrarHome() {
  const container = $("lista-servicos");
  if (!container) return;

  container.innerHTML = `
  <div class="home-intro">
    <h2>Bem-vindo à Monteiro Intech</h2>
    <p>Busque a marca ou modelo do aparelho para ver os serviços.</p>
  </div>

  <div class="busca-avancada">
    <input
      type="text"
      class="input-busca-global"
      placeholder="Ex: Samsung, A03, iPhone 11..."
    />
    <button class="btn-buscar">Buscar</button>
  </div>

  <div class="resultado-busca"></div>
`;

const input = container.querySelector(".input-busca-global");
const btn = container.querySelector(".btn-buscar");
const resultado = container.querySelector(".resultado-busca");

function buscarGlobal() {
  const termo = input.value.trim().toLowerCase();
  resultado.innerHTML = "";

  if (!termo) return;

  // 🔹 Buscar por MARCA
  const marcasEncontradas = marcas.filter(m =>
    m.toLowerCase().includes(termo)
  );

  marcasEncontradas.forEach(marca => {
    const card = document.createElement("div");
    card.className = "card-resultado";
    card.innerHTML = `<strong>Marca:</strong> ${marca}`;
    card.onclick = () => mostrarModelosPorMarca(marca);
    resultado.appendChild(card);
  });

  // 🔹 Buscar por MODELO
  const modelosEncontrados = dados.filter(d =>
    d.modelo.toLowerCase().includes(termo)
  );

  modelosEncontrados.forEach(d => {
    const card = document.createElement("div");
    card.className = "card-resultado";
    card.innerHTML = `
      <strong>${d.modelo}</strong><br>
      <small>${d.marca}</small>
    `;
    card.onclick = () => mostrarServicos(d.marca, d.modelo);
    resultado.appendChild(card);
  });

  if (!resultado.innerHTML) {
    resultado.innerHTML = `<p>Nenhum resultado encontrado.</p>`;
  }
}

btn.addEventListener("click", buscarGlobal);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") buscarGlobal();
});
}
export function atualizarSidebar() {
  const lista = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  if (!lista || !totalEl) return;

  lista.innerHTML = "";
  let total = 0;

  if (carrinho.length === 0) {
    lista.textContent = "(carrinho vazio)";
    totalEl.textContent = "Total: R$ 0,00";
    return;
  }

  carrinho.forEach(item => {
    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      <div>
        <strong>${item.nome}</strong><br>
        <small>${item.qtd}x R$ ${item.preco.toFixed(2)}</small>
      </div>
      <button class="btn-remover">−</button>
    `;

    div.querySelector(".btn-remover").addEventListener("click", () => {
      removerDoCarrinho(item.modelo, item.nome);
    });

    lista.appendChild(div);
    total += item.preco * item.qtd;
  });

  totalEl.textContent = total.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}
export function destacarCarrinho() {
  const btn = document.getElementById("cart-toggle");
  if (!btn) return;

  btn.classList.add("cart-alert");

  setTimeout(() => {
    btn.classList.remove("cart-alert");
  }, 1200);
}
export function mostrarAvisoFlutuante(msg) {
  const aviso = document.createElement("div");
  aviso.className = "aviso-flutuante";
  aviso.textContent = msg;

  document.body.appendChild(aviso);

  setTimeout(() => aviso.classList.add("show"), 10);

  setTimeout(() => {
    aviso.classList.remove("show");
    setTimeout(() => aviso.remove(), 300);
  }, 2000);
}
export function mostrarLoading() {
  let el = document.getElementById("loading");
  if (!el) {
    el = document.createElement("div");
    el.id = "loading";
    el.className = "loading-overlay";
    el.innerHTML = `<div class="spinner"></div>`;
    document.body.appendChild(el);
  }
  el.style.display = "flex";
}
export function ocultarLoading() {
  const el = document.getElementById("loading");
  if (el) el.style.display = "none";
}
export function configurarSidebarToggle() {
  const btnOpen = document.getElementById("cart-toggle");
  const btnClose = document.getElementById("cart-close");
  const sidebar = document.getElementById("cart-sidebar");

  if (!btnOpen || !btnClose || !sidebar) return;

  btnOpen.addEventListener("click", () => {
    sidebar.classList.add("open");
  });

  btnClose.addEventListener("click", () => {
    sidebar.classList.remove("open");
  });
}
export function abrirCheckout(carrinho) {
  const modal = document.getElementById("modal-checkout");
  const resumo = document.getElementById("checkout-resumo");

  if (!modal || !resumo) return;

  // resumo do carrinho
  resumo.innerHTML = carrinho.map(item => `
    <div>
      ${item.qtd}x ${item.nome} — R$ ${(item.preco * item.qtd).toFixed(2)}
    </div>
  `).join("");

  modal.setAttribute("aria-hidden", "false");
}
export function fecharCheckout() {
  const modal = document.getElementById("modal-checkout");
  if (modal) modal.setAttribute("aria-hidden", "true");
}

const pagamento = document.getElementById("checkout-pagamento");
const parcelas = document.getElementById("checkout-parcelas");

if (pagamento) {
  pagamento.addEventListener("change", () => {
    if (pagamento.value === "parcelado") {
      parcelas.style.display = "block";
    } else {
      parcelas.style.display = "none";
      parcelas.value = "";
    }
  });
}
document.getElementById("checkout-close")?.addEventListener("click", fecharCheckout);
