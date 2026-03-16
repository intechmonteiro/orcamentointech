// servicos.js (legacy compatibility)
import { getCatalogoOnce } from "./firebase.js";

function normalizar(s) {
  return String(s || "").trim().toLowerCase();
}

export async function mostrarServicos(marca, modelo) {
  const container = document.getElementById("lista-servicos");
  if (!container) return;

  const catalogo = await getCatalogoOnce();
  const itens = catalogo.filter((item) =>
    normalizar(item.marca) === normalizar(marca) && normalizar(item.modelo) === normalizar(modelo)
  );

  container.innerHTML = `
    <h2>${marca} ${modelo}</h2>
    <div class="servicos-legacy-list"></div>
  `;

  const list = container.querySelector(".servicos-legacy-list");
  if (!list) return;

  if (!itens.length) {
    list.innerHTML = `<p>Nenhum serviço encontrado para este modelo.</p>`;
    return;
  }

  list.innerHTML = itens
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
    .map((item) => `
      <div class="servico-item" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;">
        <span>${item.nome}</span>
        <strong>${Number(item.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
      </div>
    `)
    .join("");
}

export async function mostrarModelosPorMarca(marca) {
  const container = document.getElementById("lista-servicos");
  if (!container) return;

  const catalogo = await getCatalogoOnce();
  const modelos = Array.from(
    new Set(
      catalogo
        .filter((item) => normalizar(item.marca) === normalizar(marca))
        .map((item) => String(item.modelo || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  container.innerHTML = `
    <h2>${marca}</h2>
    <input type="text" class="input-busca-modelo" placeholder="Buscar modelo..." />
    <div class="modelos-scroll"></div>
  `;

  const input = container.querySelector(".input-busca-modelo");
  const scroll = container.querySelector(".modelos-scroll");
  if (!input || !scroll) return;

  function renderModelos(lista) {
    scroll.innerHTML = "";
    lista.forEach((modelo) => {
      const btn = document.createElement("button");
      btn.className = "modelo-item";
      btn.textContent = modelo;
      btn.addEventListener("click", () => mostrarServicos(marca, modelo));
      scroll.appendChild(btn);
    });
  }

  renderModelos(modelos);

  input.addEventListener("input", (e) => {
    const termo = String(e.target?.value || "").toLowerCase().trim();
    const filtrados = modelos.filter((m) => m.toLowerCase().includes(termo));
    renderModelos(filtrados);
  });
}