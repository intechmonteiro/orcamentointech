



// ---------------------BANCO DE DADOS (FIREBASE + CSV LEGADO)------------------ //


import { db } from "./firebase.js";
import { dados, colunasServicos, marcas } from "./state.js";
import { mostrarLoading, ocultarLoading, montarHomeEAbas } from "./ui.js";
import { collection, getDocs, addDoc, writeBatch, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// URL da sua planilha antiga (para migração)
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTLVINumL_bd-huXi3YRvNVit0IjNSijek8TJLrXYsX1uIEwr-UogRTacUkz0cgvkA1ikSPWqymGzw4/pub?output=csv";

// ================= CARREGAR DADOS (Híbrido) ================= //

export async function carregarDados() {
  mostrarLoading();

  try {
    // 1. Tenta buscar do Firebase primeiro
    const querySnapshot = await getDocs(collection(db, "produtos"));
    
    if (!querySnapshot.empty) {
      console.log("🔥 Carregando dados do Firebase...");
      processarDadosFirebase(querySnapshot);
    } else {
      console.warn("⚠️ Firebase vazio. Carregando do CSV antigo...");
      await carregarDoCSV();
      
      // Avisa que precisa migrar
      setTimeout(() => {
        alert("ATENÇÃO: Seu banco de dados está vazio. Os dados exibidos vieram da planilha antiga. \n\nVá no Painel Admin e clique no botão 'MIGRAR CSV PARA BANCO' para salvar tudo na nuvem.");
        criarBotaoMigracao();
      }, 2000);
    }

  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    alert("Erro ao carregar produtos.");
  }

  ocultarLoading();
}

// ================= PROCESSAMENTO FIREBASE ================= //

function processarDadosFirebase(snapshot) {
  // Limpa estados
  marcas.length = 0;
  dados.length = 0;
  colunasServicos.length = 0;

  let todosServicos = new Set();
  let tempDados = [];

  // 1. Coleta todas as colunas de serviços possíveis
  snapshot.forEach((doc) => {
    const produto = doc.data();
    // Guarda ID do firebase para poder editar depois
    const id = doc.id; 
    
    if (produto.servicos) {
      Object.keys(produto.servicos).forEach(s => todosServicos.add(s));
    }
    
    tempDados.push({ id, ...produto });
  });

  // Converte Set para Array
  colunasServicos.push(...Array.from(todosServicos));

  // 2. Monta a estrutura igual a que o UI espera (Array de preços)
  tempDados.forEach(prod => {
    const precosOrdenados = colunasServicos.map(servico => {
      // Se tiver preço, usa. Se não, é 0.
      return prod.servicos[servico] || 0;
    });

    dados.push({
      id: prod.id, // Importante para edição futura
      marca: prod.marca,
      modelo: prod.modelo,
      precos: precosOrdenados,
      servicosMap: prod.servicos // Guardamos o original também
    });

    if (!marcas.includes(prod.marca)) marcas.push(prod.marca);
  });

  marcas.sort();
  montarHomeEAbas();
}


// ================= PROCESSAMENTO CSV (LEGADO) ================= //

async function carregarDoCSV() {
  const resp = await fetch(CSV_URL);
  const texto = await resp.text();
  const linhas = parseCSV(texto);

  // Lógica antiga de processamento
  const header = linhas[0].map(h => h.trim());
  const idxMarca = header.findIndex(h => h.toLowerCase() === "marca");
  const idxModelo = header.findIndex(h => h.toLowerCase() === "modelo");

  // Define colunas
  header.forEach((col, i) => {
    if (i !== idxMarca && i !== idxModelo) colunasServicos.push(col);
  });

  linhas.slice(1).forEach(linha => {
    const marca = linha[idxMarca]?.trim();
    const modelo = linha[idxModelo]?.trim();
    if (!marca || !modelo) return;

    const precos = linha
      .filter((_, i) => i !== idxMarca && i !== idxModelo)
      .map(v => parseFloat(v.replace("R$", "").replace(",", ".") || 0));

    // Cria objeto de serviços para o futuro Firebase
    const servicosObj = {};
    colunasServicos.forEach((nomeServico, index) => {
        servicosObj[nomeServico] = precos[index];
    });

    dados.push({ marca, modelo, precos, servicosMap: servicosObj });
    if (!marcas.includes(marca)) marcas.push(marca);
  });

  marcas.sort();
  montarHomeEAbas();
}

function parseCSV(texto) {
  return texto.trim().split("\n").map(l => l.split(","));
}

// ================= MIGRAÇÃO (BOTÃO MÁGICO) ================= //
function criarBotaoMigracao() {
    const painel = document.getElementById("painel-admin");
    const btn = document.createElement("button");
    btn.textContent = "🚀 MIGRAR CSV PARA BANCO AGORA";
    btn.style.backgroundColor = "orange";
    btn.style.color = "black";
    btn.style.fontWeight = "bold";
    btn.style.marginTop = "20px";
    btn.style.width = "100%";
    btn.onclick = migrarCsvParaFirebase;
    
    // Adiciona no topo do painel admin
    painel.insertBefore(btn, painel.firstChild);
}

async function migrarCsvParaFirebase() {
    if(!confirm("Isso vai pegar todos os dados do CSV e salvar no Banco de Dados. Continuar?")) return;
    
    mostrarLoading();
    let contador = 0;

    try {
        // Salva um por um (ou poderia usar batch, mas assim é mais seguro pra ver erros)
        for (const item of dados) {
            await addDoc(collection(db, "produtos"), {
                marca: item.marca,
                modelo: item.modelo,
                servicos: item.servicosMap // Salva como objeto: { "Tela": 100, "Bateria": 50 }
            });
            contador++;
            console.log(`Migrado: ${item.modelo}`);
        }
        
        alert(`Sucesso! ${contador} produtos migrados para o Firebase. Agora atualize a página.`);
        location.reload();

    } catch (erro) {
        console.error(erro);
        alert("Erro na migração. Olhe o console.");
    }
    ocultarLoading();
}
// ================================================================= //
// ==================== EDITOR DE PREÇOS (ADMIN) ==================== //
// ================================================================= //

export function iniciarEditorPrecos() {
  const container = document.getElementById("lista-editor-produtos");
  const inputBusca = document.getElementById("busca-editor");
  
  if (!container || !inputBusca) return;

  // Função para desenhar a lista
  const renderizar = (textoBusca = "") => {
    container.innerHTML = "";
    
    // Filtra os dados globais que já carregamos
    const filtrados = dados.filter(item => {
      const termo = `${item.marca} ${item.modelo}`.toLowerCase();
      return termo.includes(textoBusca.toLowerCase());
    });

    if (filtrados.length === 0) {
      container.innerHTML = "<p>Nenhum produto encontrado.</p>";
      return;
    }

    // Limita a 50 itens para não travar a tela se tiver vazio
    filtrados.slice(0, 50).forEach(produto => {
      const div = document.createElement("div");
      div.className = "item-editor";
      div.style.border = "1px solid #ccc";
      div.style.padding = "10px";
      div.style.marginBottom = "10px";
      div.style.borderRadius = "5px";
      div.style.backgroundColor = "#fff";

      let htmlServicos = "";
      
      // Cria um input para cada serviço existente nesse produto
      // produto.servicosMap vem da carga inicial do banco
      if (produto.servicosMap) {
        Object.keys(produto.servicosMap).forEach(servico => {
          const valor = produto.servicosMap[servico];
          htmlServicos += `
            <div style="margin-top: 5px; display: flex; align-items: center; gap: 10px;">
              <label style="width: 100px; font-size: 0.9em;">${servico}:</label>
              <input type="number" 
                     class="input-preco" 
                     data-id="${produto.id}" 
                     data-servico="${servico}" 
                     value="${valor}" 
                     style="padding: 5px; width: 80px;"
              >
            </div>
          `;
        });
      }

      div.innerHTML = `
        <div style="font-weight: bold; color: #333; margin-bottom: 5px;">
          ${produto.marca} - ${produto.modelo}
        </div>
        <div style="background: #f9f9f9; padding: 10px; border-radius: 4px;">
           ${htmlServicos}
           <button class="btn-salvar-preco" data-id="${produto.id}" style="margin-top: 10px; background: green; color: white; border: none; padding: 5px 15px; cursor: pointer; border-radius: 4px;">
             💾 Salvar Alterações
           </button>
        </div>
      `;

      container.appendChild(div);
    });

    // Adiciona evento aos botões de salvar desta renderização
    document.querySelectorAll(".btn-salvar-preco").forEach(btn => {
      btn.addEventListener("click", (e) => salvarProduto(e.target.dataset.id, e.target));
    });
  };

  // Escuta a digitação na busca
  inputBusca.addEventListener("input", (e) => renderizar(e.target.value));
  
  // Renderiza inicial (vazio ou tudo)
  renderizar("");
}

async function salvarProduto(id, btnElemento) {
  const containerPai = btnElemento.parentElement;
  const inputs = containerPai.querySelectorAll(".input-preco");
  const novosPrecos = {};

  btnElemento.textContent = "⏳ Salvando...";
  btnElemento.disabled = true;

  try {
    // 1. Coleta os valores dos inputs
    inputs.forEach(input => {
      const nomeServico = input.dataset.servico;
      const valor = parseFloat(input.value) || 0;
      novosPrecos[nomeServico] = valor;
    });

    // 2. Atualiza no Firebase
    // Nota: "servicos" é o nome do campo objeto lá no Firestore
    const docRef = doc(db, "produtos", id);
    await updateDoc(docRef, {
      servicos: novosPrecos
    });

    alert("✅ Preços atualizados com sucesso!");
    
    // Opcional: Recarregar a página para atualizar a tela principal também
    // location.reload(); 

  } catch (erro) {
    console.error("Erro ao salvar:", erro);
    alert("❌ Erro ao salvar. Veja o console.");
  } finally {
    btnElemento.textContent = "💾 Salvar Alterações";
    btnElemento.disabled = false;
  }
}