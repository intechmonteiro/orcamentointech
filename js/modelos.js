// modelos.js

import { obterModelos } from './firebase.js';  // Importa a função obterModelos para buscar os dados do Firestore
import { mostrarServicos } from './servicos.js';  // Para exibir os serviços quando um modelo for clicado

export async function mostrarModelosPorMarca(marca) {
  const container = document.getElementById("lista-servicos");
  if (!container) return;

  // Obtém os modelos diretamente do Firestore
  const modelos = await obterModelos();
  console.log("Modelos carregados:", modelos);  // Log para verificar os dados carregados do Firestore

  if (!modelos || modelos.length === 0) {
    container.innerHTML = "<p>Nenhum modelo encontrado.</p>";
    return;
  }

  // Filtra os modelos da marca
  const modelosDaMarca = modelos.filter(modelo => modelo.marca === marca)
    .map(modelo => modelo.modelo)  // Mapeia para pegar apenas o nome do modelo
    .sort();  // Ordena os modelos
  console.log("Modelos da marca:", modelosDaMarca);  // Log para verificar se a filtragem da marca está funcionando corretamente

  // HTML base para exibir os modelos
  container.innerHTML = `
    <h2>${marca}</h2>
    <input type="text" class="input-busca-modelo" placeholder="Buscar modelo..." />
    <div class="modelos-scroll"></div>
  `;

  const input = container.querySelector(".input-busca-modelo");
  const scroll = container.querySelector(".modelos-scroll");

  // Função para renderizar os modelos na tela
  function renderModelos(lista) {
    scroll.innerHTML = "";  // Limpa a lista de modelos exibida

    lista.forEach(modelo => {
      const btn = document.createElement("button");
      btn.className = "modelo-item";
      btn.textContent = modelo;  // Exibe o nome do modelo

      // Quando clicar no modelo, chama a função para mostrar os serviços do modelo
      btn.addEventListener("click", () => {
        mostrarServicos(marca, modelo);  // Mostra os serviços ao clicar no modelo
      });

      scroll.appendChild(btn);  // Adiciona o modelo à lista na tela
    });
  }

  // Renderiza os modelos filtrados (ou todos, se não houver filtro)
  renderModelos(modelosDaMarca);

  // Filtro de busca em tempo real
  input.addEventListener("input", e => {
    const termo = e.target.value.toLowerCase();  // Obtém o termo de busca digitado
    const filtrados = modelosDaMarca.filter(m =>
      m.toLowerCase().includes(termo)  // Filtra os modelos conforme o termo digitado
    );
    renderModelos(filtrados);  // Atualiza a lista de modelos exibidos
  });
}