import { db } from "./firebase.js";
import { collection, getDocs, addDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { dados, colunasServicos, marcas } from "./state.js";
import { mostrarLoading, ocultarLoading, montarHomeEAbas } from "./ui.js";

// URL da planilha (backup legado)
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTLVINumL_bd-huXi3YRvNVit0IjNSijek8TJLrXYsX1uIEwr-UogRTacUkz0cgvkA1ikSPWqymGzw4/pub?output=csv";

// ================= CARREGAR DADOS ================= //
export async function carregarDados() {
  mostrarLoading();

  try {
    const querySnapshot = await getDocs(collection(db, "produtos"));
    
    if (!querySnapshot.empty) {
      console.log("🔥 Carregando do Firebase...");
      processarDadosFirebase(querySnapshot);
    } else {
      console.warn("⚠️ Firebase vazio. Usando CSV...");
      await carregarDoCSV();
    }

  } catch (error) {
    console.error("Erro geral:", error);
  }

  ocultarLoading();
}

function processarDadosFirebase(snapshot) {
  marcas.length = 0;
  dados.length = 0;
  colunasServicos.length = 0;

  let todosServicos = new Set();
  let tempDados = [];

  snapshot.forEach((doc) => {
    const produto = doc.data();
    if (produto.servicos) {
      Object.keys(produto.servicos).forEach(s => todosServicos.add(s));
    }
    tempDados.push({ id: doc.id, ...produto });
  });

  colunasServicos.push(...Array.from(todosServicos));

  tempDados.forEach(prod => {
    const servicosMap = prod.servicos || {};
    const precosOrdenados = colunasServicos.map(s => servicosMap[s] || 0);

    dados.push({
      id: prod.id,
      marca: prod.marca,
      modelo: prod.modelo,
      precos: precosOrdenados,
      servicosMap: servicosMap
    });

    if (!marcas.includes(prod.marca)) marcas.push(prod.marca);
  });

  marcas.sort();
  // Atualiza a tela da loja se estiver nela
  if (typeof montarHomeEAbas === "function") montarHomeEAbas();
}

async function carregarDoCSV() {
  try {
      const resp = await fetch(CSV_URL);
      const texto = await resp.text();
      console.log("CSV carregado (Backup)");
      // Lógica simplificada de CSV apenas para garantir que não quebre
  } catch (e) { console.error(e) }
}

/// ================= EDITOR DE PREÇOS (PAINEL ADMIN) ================= //
export function iniciarEditorPrecos() {
  const containerLista = document.getElementById("lista-editor-produtos");
  const containerAbas = document.getElementById("admin-brand-tabs");
  const inputBusca = document.getElementById("busca-editor");
  
  if (!containerLista || !inputBusca || !containerAbas) return;

  // --- BOTÃO DE EMERGÊNCIA (CORRIGIR PREÇOS) ---
  // Cria um botão no topo para corrigir os valores de 1.14 para 1140 automaticamente
  const btnCorrigir = document.createElement("button");
  btnCorrigir.textContent = "🪄 Corrigir Erro dos Milhares (x1000)";
  btnCorrigir.style.cssText = "width: 100%; margin-bottom: 20px; padding: 15px; background: #ff9800; color: white; border: none; font-weight: bold; border-radius: 8px; cursor: pointer;";
  
  btnCorrigir.onclick = async () => {
    if(!confirm("Isso vai multiplicar por 1000 todos os preços que estiverem entre 1.00 e 10.00 (ex: 1.14 vira 1140).\n\nTem certeza?")) return;
    
    btnCorrigir.textContent = "⏳ Corrigindo... (Não feche a página)";
    btnCorrigir.disabled = true;
    
    let totalCorrigidos = 0;

    for (const produto of dados) {
      if (!produto.servicosMap) continue;

      let mudouAlgo = false;
      const novosPrecos = { ...produto.servicosMap };

      Object.keys(novosPrecos).forEach(servico => {
        const valorAtual = novosPrecos[servico];
        
        // A LÓGICA: Se o valor for maior que 1 e menor que 10, é quase certeza que é erro de milhar
        // Ex: 1.14 (era pra ser 1140) ou 2.50 (era pra ser 2500)
        if (valorAtual > 1 && valorAtual < 10) {
          novosPrecos[servico] = valorAtual * 1000;
          mudouAlgo = true;
          totalCorrigidos++;
        }
      });

      if (mudouAlgo) {
        try {
          // Atualiza no Firebase
          const docRef = doc(db, "produtos", produto.id);
          await updateDoc(docRef, { servicos: novosPrecos });
          console.log(`Corrigido: ${produto.modelo}`);
        } catch (e) {
          console.error(`Erro ao corrigir ${produto.modelo}`, e);
        }
      }
    }

    alert(`✅ Pronto! ${totalCorrigidos} preços foram corrigidos.`);
    btnCorrigir.textContent = "🪄 Corrigir Erro dos Milhares (x1000)";
    btnCorrigir.disabled = false;
    
    // Recarrega a tela para ver as mudanças
    document.querySelector(".admin-tab-btn.active")?.click();
  };

  // Adiciona o botão antes das abas
  containerAbas.parentNode.insertBefore(btnCorrigir, containerAbas);

  // --- FIM DO BOTÃO DE EMERGÊNCIA ---

  // 1. Cria as Abas do Admin
  const marcasUnicas = [...new Set(dados.map(item => item.marca))].sort();
  containerAbas.innerHTML = "";
  
  marcasUnicas.forEach(marca => {
    const btn = document.createElement("button");
    btn.textContent = marca;
    btn.className = "tab-btn";
    btn.style.marginRight = "5px";
    btn.style.marginBottom = "5px";
    
    btn.onclick = () => {
      document.querySelectorAll("#admin-brand-tabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderizarEditor(marca, "");
    };
    containerAbas.appendChild(btn);
  });

  // 2. Função que desenha os inputs na tela
  const renderizarEditor = (filtroMarca, filtroTexto) => {
    containerLista.innerHTML = "";
    
    const filtrados = dados.filter(item => {
      if (filtroTexto.length > 0) {
        const termo = `${item.marca} ${item.modelo}`.toLowerCase();
        return termo.includes(filtroTexto.toLowerCase());
      }
      return item.marca === filtroMarca;
    });

    if (filtrados.length === 0) {
      containerLista.innerHTML = "<p>Nenhum produto encontrado.</p>";
      return;
    }

    filtrados.forEach(produto => {
      const div = document.createElement("div");
      div.style.border = "1px solid #ddd";
      div.style.padding = "15px";
      div.style.marginBottom = "10px";
      div.style.borderRadius = "8px";
      div.style.backgroundColor = "#fff";

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
        <h3 style="margin: 0 0 10px 0; color: #1347a1;">${produto.modelo}</h3>
        <div style="background: #f4f6f8; padding: 10px; border-radius: 5px;">
           ${htmlServicos}
        </div>
        <button class="btn-salvar-preco" style="margin-top: 15px; width: 100%; background: #28a745; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px; font-weight: bold;">
          💾 Salvar Alterações
        </button>
      `;

      const btnSalvar = div.querySelector(".btn-salvar-preco");
      btnSalvar.addEventListener("click", async () => {
        btnSalvar.textContent = "⏳ Salvando...";
        btnSalvar.disabled = true;
        
        try {
          const novosPrecos = {};
          div.querySelectorAll(".input-preco").forEach(input => {
             novosPrecos[input.dataset.servico] = parseFloat(input.value) || 0;
          });

          const docRef = doc(db, "produtos", produto.id);
          await updateDoc(docRef, { servicos: novosPrecos });

          alert(`✅ Preços do ${produto.modelo} atualizados!`);
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

  inputBusca.addEventListener("input", (e) => {
    document.querySelectorAll("#admin-brand-tabs .tab-btn").forEach(b => b.classList.remove("active"));
    renderizarEditor(null, e.target.value);
  });
}