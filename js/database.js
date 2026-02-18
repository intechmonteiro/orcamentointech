



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

// ==================== EDITOR DE PREÇOS (ADMIN) ==================== //


// ==================== EDITOR DE PREÇOS (COM ABAS) ==================== //

export function iniciarEditorPrecos() {
  const containerLista = document.getElementById("lista-editor-produtos");
  const containerAbas = document.getElementById("admin-brand-tabs");
  const inputBusca = document.getElementById("busca-editor");
  
  if (!containerLista || !inputBusca || !containerAbas) return;

  // 1. Organizar as Marcas
  const marcasUnicas = [...new Set(dados.map(item => item.marca))].sort();
  
  // 2. Criar os Botões das Abas
  containerAbas.innerHTML = "";
  
  marcasUnicas.forEach(marca => {
    const btn = document.createElement("button");
    btn.textContent = marca;
    btn.className = "tab-btn"; // Usa o mesmo estilo das abas da loja
    btn.style.marginRight = "5px";
    btn.style.marginBottom = "5px";
    
    btn.onclick = () => {
      // Remove ativo dos outros e adiciona neste
      document.querySelectorAll("#admin-brand-tabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderizarLista(marca, ""); // Mostra só essa marca
    };
    containerAbas.appendChild(btn);
  });

  // Função para desenhar a lista (Filtrada por Marca OU Busca)
  const renderizarLista = (filtroMarca, filtroTexto) => {
    containerLista.innerHTML = "";
    
    // Filtra os dados
    const filtrados = dados.filter(item => {
      // Se tiver texto na busca, ignora a marca e busca geral
      if (filtroTexto.length > 0) {
        const termo = `${item.marca} ${item.modelo}`.toLowerCase();
        return termo.includes(filtroTexto.toLowerCase());
      }
      // Se não tiver texto, usa a marca selecionada
      return item.marca === filtroMarca;
    });

    if (filtrados.length === 0) {
      containerLista.innerHTML = "<p>Nenhum produto encontrado.</p>";
      return;
    }

    // Cria os cards de edição
    filtrados.forEach(produto => {
      const div = document.createElement("div");
      div.style.border = "1px solid #ddd";
      div.style.padding = "15px";
      div.style.marginBottom = "10px";
      div.style.borderRadius = "8px";
      div.style.backgroundColor = "#fff";
      div.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";

      let htmlServicos = "";
      
      if (produto.servicosMap) {
        Object.keys(produto.servicosMap).forEach(servico => {
          const valor = produto.servicosMap[servico];
          htmlServicos += `
            <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
              <label style="font-weight: 500;">${servico}:</label>
              <div style="display: flex; align-items: center;">
                <span style="margin-right: 5px;">R$</span>
                <input type="number" 
                       class="input-preco" 
                       data-servico="${servico}" 
                       value="${valor}" 
                       style="padding: 5px; width: 100px; border: 1px solid #ccc; border-radius: 4px;"
                >
              </div>
            </div>
          `;
        });
      }

      div.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #1347a1;">${produto.marca} - ${produto.modelo}</h3>
        <div style="background: #f4f6f8; padding: 10px; border-radius: 5px;">
           ${htmlServicos}
        </div>
        <button class="btn-salvar-preco" style="margin-top: 15px; width: 100%; background: #28a745; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px; font-weight: bold;">
          💾 Salvar Alterações
        </button>
      `;

      // Lógica do Botão Salvar (Mantida igual)
      const btnSalvar = div.querySelector(".btn-salvar-preco");
      btnSalvar.addEventListener("click", async () => {
        btnSalvar.textContent = "⏳ Salvando...";
        btnSalvar.disabled = true;
        
        try {
          const novosPrecos = {};
          div.querySelectorAll(".input-preco").forEach(input => {
             novosPrecos[input.dataset.servico] = parseFloat(input.value) || 0;
          });

          // Precisamos do import 'doc' e 'updateDoc' e 'db' acessíveis aqui ou globais
          // Como estão no topo do arquivo, deve funcionar.
          const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
          const { db } = await import("./firebase.js");

          const docRef = doc(db, "produtos", produto.id);
          await updateDoc(docRef, { servicos: novosPrecos });

          alert(`✅ Preços atualizados!`);
        } catch (erro) {
          console.error("Erro ao salvar:", erro);
          alert("Erro ao salvar.");
        } finally {
          btnSalvar.textContent = "💾 Salvar Alterações";
          btnSalvar.disabled = false;
        }
      });

      containerLista.appendChild(div);
    });
  };

  // Escuta a busca (se digitar, limpa a seleção de abas)
  inputBusca.addEventListener("input", (e) => {
    document.querySelectorAll("#admin-brand-tabs .tab-btn").forEach(b => b.classList.remove("active"));
    renderizarLista(null, e.target.value);
  });
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