import { db } from "./firebase.js";
// A linha abaixo é a única importação do Firestore necessária
import { collection, getDocs, addDoc, writeBatch, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { dados, colunasServicos, marcas } from "./state.js";
import { mostrarLoading, ocultarLoading, montarHomeEAbas } from "./ui.js";

// URL da sua planilha antiga (para migração)
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTLVINumL_bd-huXi3YRvNVit0IjNSijek8TJLrXYsX1uIEwr-UogRTacUkz0cgvkA1ikSPWqymGzw4/pub?output=csv";

// ================= CARREGAR DADOS (Híbrido) ================= //
export async function carregarDados() {
  mostrarLoading();

  try {
    const querySnapshot = await getDocs(collection(db, "produtos"));
    
    if (!querySnapshot.empty) {
      console.log("🔥 Carregando dados do Firebase...");
      processarDadosFirebase(querySnapshot);
    } else {
      console.warn("⚠️ Firebase vazio. Carregando do CSV antigo...");
      await carregarDoCSV();
      
      setTimeout(() => {
        // Só mostra alerta se estiver no painel admin
        if(document.body.classList.contains("admin-mode")) {
             alert("ATENÇÃO: Banco vazio. Clique em 'MIGRAR' para salvar os dados.");
             criarBotaoMigracao();
        }
      }, 2000);
    }

  } catch (error) {
    console.error("Erro ao carregar dados:", error);
  }

  ocultarLoading();
}

// ================= PROCESSAMENTO FIREBASE ================= //
function processarDadosFirebase(snapshot) {
  marcas.length = 0;
  dados.length = 0;
  colunasServicos.length = 0;

  let todosServicos = new Set();
  let tempDados = [];

  snapshot.forEach((doc) => {
    const produto = doc.data();
    const id = doc.id; 
    
    if (produto.servicos) {
      Object.keys(produto.servicos).forEach(s => todosServicos.add(s));
    }
    
    tempDados.push({ id, ...produto });
  });

  colunasServicos.push(...Array.from(todosServicos));

  tempDados.forEach(prod => {
    const precosOrdenados = colunasServicos.map(servico => {
      return prod.servicos[servico] || 0;
    });

    dados.push({
      id: prod.id,
      marca: prod.marca,
      modelo: prod.modelo,
      precos: precosOrdenados,
      servicosMap: prod.servicos
    });

    if (!marcas.includes(prod.marca)) marcas.push(prod.marca);
  });

  marcas.sort();
  montarHomeEAbas();
}


// ================= PROCESSAMENTO CSV (LEGADO) ================= //
async function carregarDoCSV() {
  try {
      const resp = await fetch(CSV_URL);
      const texto = await resp.text();
      const linhas = parseCSV(texto);

      const header = linhas[0].map(h => h.trim());
      const idxMarca = header.findIndex(h => h.toLowerCase() === "marca");
      const idxModelo = header.findIndex(h => h.toLowerCase() === "modelo");

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

        const servicosObj = {};
        colunasServicos.forEach((nomeServico, index) => {
            servicosObj[nomeServico] = precos[index];
        });

        dados.push({ marca, modelo, precos, servicosMap: servicosObj });
        if (!marcas.includes(marca)) marcas.push(marca);
      });

      marcas.sort();
      montarHomeEAbas();
  } catch (e) { console.error(e) }
}

function parseCSV(texto) {
  return texto.trim().split("\n").map(l => l.split(","));
}

// ================= MIGRAÇÃO ================= //
function criarBotaoMigracao() {
    const painel = document.getElementById("painel-admin");
    if(!painel) return;
    const btn = document.createElement("button");
    btn.textContent = "🚀 MIGRAR CSV PARA BANCO AGORA";
    btn.style.backgroundColor = "orange";
    btn.style.marginTop = "20px";
    btn.style.width = "100%";
    btn.onclick = migrarCsvParaFirebase;
    painel.insertBefore(btn, painel.firstChild);
}

async function migrarCsvParaFirebase() {
    if(!confirm("Continuar migração?")) return;
    mostrarLoading();
    try {
        for (const item of dados) {
            await addDoc(collection(db, "produtos"), {
                marca: item.marca,
                modelo: item.modelo,
                servicos: item.servicosMap
            });
        }
        alert(`Sucesso! Atualize a página.`);
        location.reload();
    } catch (erro) {
        console.error(erro);
        alert("Erro na migração.");
    }
    ocultarLoading();
}

// ================= EDITOR DE PREÇOS (COM ABAS) ================= //
export function iniciarEditorPrecos() {
  const containerLista = document.getElementById("lista-editor-produtos");
  const containerAbas = document.getElementById("admin-brand-tabs");
  const inputBusca = document.getElementById("busca-editor");
  
  if (!containerLista || !inputBusca || !containerAbas) return;

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
      renderizarLista(marca, "");
    };
    containerAbas.appendChild(btn);
  });

  const renderizarLista = (filtroMarca, filtroTexto) => {
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
              <label>${servico}:</label>
              <div style="display: flex; align-items: center;">
                <span style="margin-right: 5px;">R$</span>
                <input type="number" class="input-preco" data-servico="${servico}" value="${valor}" style="padding: 5px; width: 100px;">
              </div>
            </div>
          `;
        });
      }

      div.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #1347a1;">${produto.marca} - ${produto.modelo}</h3>
        <div style="background: #f4f6f8; padding: 10px; border-radius: 5px;">${htmlServicos}</div>
        <button class="btn-salvar-preco" style="margin-top: 15px; width: 100%; background: #28a745; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px;">💾 Salvar Alterações</button>
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
          alert(`✅ Preços atualizados!`);
        } catch (erro) {
          console.error(erro);
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
    renderizarLista(null, e.target.value);
  });
}