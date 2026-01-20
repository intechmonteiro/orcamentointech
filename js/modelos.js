



// ----------LISTA DE SERVIÇOS/MODELOS----------//

import { dados } from "./state.js";
import { $ } from "./utils.js";
import { mostrarServicos } from "./servicos.js";

export function mostrarModelosPorMarca(marca) {
  const container = $("lista-servicos");
  if (!container) return;

  // modelos únicos da marca
  const modelosDaMarca = [
    ...new Set(
      dados
        .filter(d => d.marca === marca)
        .map(d => d.modelo)
    )
  ].sort();

  // HTML base
  container.innerHTML = `
    <h2>${marca}</h2>

    <input
      type="text"
      class="input-busca-modelo"
      placeholder="Buscar modelo..."
    />

    <div class="modelos-scroll"></div>
  `;

  const input = container.querySelector(".input-busca-modelo");
  const scroll = container.querySelector(".modelos-scroll");

  function renderModelos(lista) {
    scroll.innerHTML = "";

    lista.forEach(modelo => {
      const btn = document.createElement("button");
      btn.className = "modelo-item";
      btn.textContent = modelo;

      btn.addEventListener("click", () => {
        mostrarServicos(marca, modelo);
      });

      scroll.appendChild(btn);
    });
  }

  // render inicial
  renderModelos(modelosDaMarca);

  // filtro em tempo real
  input.addEventListener("input", e => {
    const termo = e.target.value.toLowerCase();
    const filtrados = modelosDaMarca.filter(m =>
      m.toLowerCase().includes(termo)
    );
    renderModelos(filtrados);
  });
}
