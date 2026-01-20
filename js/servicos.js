// -------------- js/servicos.js -------------- //


import { dados, colunasServicos, carrinho } from "./state.js";
import { adicionarAoCarrinho, removerDoCarrinho } from "./carrinho.js";
import { atualizarSidebar, mostrarAvisoFlutuante, destacarCarrinho } from "./ui.js";
import { $, formatBR } from "./utils.js";

export function mostrarServicosDoModelo(modelo) {
  const container = $("lista-servicos");
  if (!container || !modelo) return;

  container.innerHTML = "";

  const item = dados.find(d => d.modelo === modelo);
  if (!item) return;

  const servicosComPreco = colunasServicos
    .map((nome, i) => ({ nome, preco: item.precos[i] }))
    .filter(s => s.preco > 0);

  if (!servicosComPreco.length) {
    container.innerHTML = `<p>Nenhum serviço disponível para este modelo.</p>`;
    return;
  }

  const categorias = {
    "Hardware - Display": ["Tela", "Display"],
    "Hardware - Bateria": ["Bateria"],
    "Hardware - Conectores": ["Conector"],
    "Hardware - Câmeras": ["Câmera", "Lente"],
    "Hardware - Componentes": ["Flex", "Placa", "Alto Falante", "Auricular", "Microfone"],
    "Software": ["Desbloqueio", "Atualização", "Conta"],
    "Outros": []
  };

  const servicosAgrupados = {};

  servicosComPreco.forEach(s => {
    let catFound = false;
    for (const cat in categorias) {
      if (categorias[cat].some(k =>
        s.nome.toLowerCase().includes(k.toLowerCase())
      )) {
        servicosAgrupados[cat] ??= [];
        servicosAgrupados[cat].push(s);
        catFound = true;
        break;
      }
    }
    if (!catFound) {
      servicosAgrupados["Outros"] ??= [];
      servicosAgrupados["Outros"].push(s);
    }
  });

  for (const categoria in servicosAgrupados) {
    const divCat = document.createElement("div");
    divCat.className = "categoria-servicos";
    divCat.innerHTML = `<h3>${categoria.replace("Hardware - ", "")}</h3>`;

    servicosAgrupados[categoria].forEach((s, i) => {
      const id = `chk-${modelo}-${i}`;
      const noCarrinho = carrinho.some(
        c => c.modelo === modelo && c.nome === s.nome
      );

      const div = document.createElement("div");
      div.className = "servico-item";
      div.innerHTML = `
        <input type="checkbox" id="${id}" ${noCarrinho ? "checked" : ""}>
        <label for="${id}">${s.nome}</label>
        <span>R$ ${formatBR(s.preco)}</span>
      `;

      div.querySelector("input").onchange = e => {
        if (e.target.checked) {
          adicionarAoCarrinho({ modelo, nome: s.nome, preco: s.preco });
          destacarCarrinho();
          mostrarAvisoFlutuante("Adicionado ao carrinho!");
        } else {
          removerDoCarrinho(modelo, s.nome);
          mostrarAvisoFlutuante("Removido do carrinho!");
        }
        atualizarSidebar();
      };

      divCat.appendChild(div);
    });

    container.appendChild(divCat);
  }
}
export function mostrarServicos(marca, modelo) {
  const container = $("lista-servicos");
  if (!container) return;

  const registro = dados.find(
    d => d.marca === marca && d.modelo === modelo
  );

  if (!registro) {
    container.innerHTML = "<p>Modelo não encontrado</p>";
    return;
  }

  container.innerHTML = `
    <h2>${marca} – ${modelo}</h2>
    <div class="lista-servicos"></div>
  `;

  const lista = container.querySelector(".lista-servicos");

  colunasServicos.forEach((nomeServico, i) => {
    const preco = registro.precos[i];
    if (!preco) return;

    const item = document.createElement("div");
    item.className = "servico-item";

    item.innerHTML = `
      <div class="info-servico">
        <strong>${nomeServico}</strong>
        <span class="srv-preco">R$ ${preco.toFixed(2)}</span>
      </div>

      <button class="btn-add-cart" title="Adicionar ao carrinho">
        <span>Adicionar</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4h-2l-1 2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96
          0 1.1.9 2 2 2h12v-2h-11.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.72
          c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48
          0-.55-.45-1-1-1h-16.31l-.94-2z"/>
        </svg>
      </button>
    `;

    const btnAdd = item.querySelector(".btn-add-cart");

btnAdd.addEventListener("click", () => {
  // 🔒 trava o botão
  btnAdd.disabled = true;
  btnAdd.classList.add("disabled");

  adicionarAoCarrinho({
    marca,
    modelo,
    nome: nomeServico,
    preco
  });

  // 🔓 libera após 1 segundo
  setTimeout(() => {
    btnAdd.disabled = false;
    btnAdd.classList.remove("disabled");
  }, 1000);
});


    lista.appendChild(item);
  });
}
