// ================= IMPORTAÇÕES DE DADOS E BANCO ================= //
import { db } from './firebase.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { dados, marcas, colunasServicos } from "./dados.js"; 
import { carrinho } from "./state.js"; 

// ================= IMPORTAÇÕES VISUAIS E AÇÕES ================= //
import { 
  mostrarLoading, ocultarLoading, montarHomeEAbas, 
  configurarSidebarToggle, configurarBusca, 
  mostrarAvisoCarrinho, atualizarSidebar 
} from "./ui.js";
import { adicionarAoCarrinho, removerDoCarrinho, limparCarrinho, restaurarCarrinho } from "./carrinho.js";
import { gerarPDF, enviarWhatsApp, atualizarDashboard } from "./acoes.js";


// ================= 1. CARREGAR DADOS (O que você me mandou) ================= //
export async function carregarDados() {
  mostrarLoading();
  try {
    const querySnapshot = await getDocs(collection(db, "produtos"));
    if (!querySnapshot.empty) {
      console.log("🔥 Carregando dados do Firebase...");
      processarDadosFirebase(querySnapshot);
    } else {
      console.warn("⚠️ Firebase vazio. Usando CSV...");
      await carregarDoCSV();
    }
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    alert("❌ Erro ao carregar dados. Verifique a conexão.");
  } finally {
    ocultarLoading();
  }
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

  colunasServicos.push(...Array.from(todosServicos).sort());

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

  marcas.sort((a, b) => a.localeCompare(b, "pt-BR"));
  montarHomeEAbas(); 
}

async function carregarDoCSV() {
  try {
    const resp = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vTLVINumL_bd-huXi3YRvNVit0IjNSijek8TJLrXYsX1uIEwr-UogRTacUkz0cgvkA1ikSPWqymGzw4/pub?output=csv");
    if (!resp.ok) throw new Error("Falha no fetch");
    const csvText = await resp.text();
    console.log("CSV carregado (Backup).");
  } catch (e) {
    console.error("Erro no CSV fallback:", e);
  }
}


// ================= 2. INICIALIZAÇÃO E CLIQUES (O Cérebro) ================= //
async function inicializarApp() {
  await carregarDados(); // Puxa do Firebase
  restaurarCarrinho();   // Puxa o carrinho salvo

  // Liga os eventos visuais
  configurarSidebarToggle();
  configurarBusca();

  // Escuta TODOS os cliques na tela
  document.addEventListener("click", (e) => {
    
    // 🛒 ADICIONAR ITEM AO CARRINHO
    if (e.target.classList.contains("add-btn-final")) {
      const { modelo, servico, preco, marca } = e.target.dataset;
      adicionarAoCarrinho({ marca, modelo, nome: servico, preco: parseFloat(preco) });
      mostrarAvisoCarrinho(modelo, servico);
      atualizarSidebar();
    }

    // 🗑️ REMOVER ITEM DO CARRINHO
    if (e.target.classList.contains("remove-btn")) {
      const { modelo, nome } = e.target.dataset;
      removerDoCarrinho(modelo, nome);
      atualizarSidebar();
    }

    // 📱 ABRIR MODAL DE PDF OU WHATSAPP
    if (e.target.id === "btn-gerar-pdf" || e.target.id === "btn-open-wa") {
      if (carrinho.length === 0) return alert("Seu orçamento está vazio!");
      const modal = document.getElementById("modal-orcamento");
      modal.dataset.acaoPendente = e.target.id; 
      modal.classList.remove("hidden");
    }

    // ✅ CONFIRMAR NOME E PAGAMENTO (Dispara o WA ou PDF)
    if (e.target.id === "btn-confirmar-orcamento") {
      const nome = document.getElementById("cliente-nome").value;
      const pagamento = document.getElementById("forma-pagamento").value;
      const parcelas = document.getElementById("parcelas").value || "1";

      if (!nome || !pagamento) return alert("Preencha o nome e a forma de pagamento!");

      const dadosCliente = { nome, pagamento, parcelas };
      const acao = document.getElementById("modal-orcamento").dataset.acaoPendente;

      if (acao === "btn-gerar-pdf") gerarPDF(carrinho, dadosCliente);
      else enviarWhatsApp(carrinho, dadosCliente);

      document.getElementById("modal-orcamento").classList.add("hidden");
      document.getElementById("cliente-nome").value = "";
    }

    // ❌ FECHAR MODAIS
    if (e.target.classList.contains("close-btn") || e.target.id === "modal-orcamento-fechar") {
      const modal = e.target.closest(".modal");
      if (modal) modal.classList.add("hidden");
    }

    // 🧹 LIMPAR CARRINHO
    if (e.target.id === "btn-clear-cart") {
      if(confirm("Deseja limpar o orçamento atual?")) {
        limparCarrinho();
        atualizarSidebar();
      }
    }

    // ⚙️ ABRIR E LOGAR NO ADMIN
    if (e.target.id === "abrir-admin") document.getElementById("modal-login").classList.remove("hidden");
    
    if (e.target.id === "btn-entrar-admin") {
      if (document.getElementById("input-senha-admin").value === "1322") {
        document.getElementById("modal-login").classList.add("hidden");
        document.getElementById("painel-admin").classList.remove("hidden");
        iniciarEditorPrecos(); 
        if(typeof atualizarDashboard === "function") atualizarDashboard();
      } else {
        alert("Senha incorreta!");
      }
    }
    
    // 🚪 SAIR DO ADMIN
    if (e.target.id === "btn-sair-admin") {
      document.getElementById("painel-admin").classList.add("hidden");
    }
  });

  // Mostra campo de parcelas se for Cartão de Crédito
  document.getElementById("forma-pagamento")?.addEventListener("change", (e) => {
    const parcelas = document.getElementById("parcelas");
    if (e.target.value === "Credito") parcelas.classList.remove("hidden");
    else parcelas.classList.add("hidden");
  });
}

// Inicia tudo quando a página carrega
window.addEventListener("DOMContentLoaded", inicializarApp);


// ================= 3. EDITOR DE PREÇOS (O que você me mandou) ================= //
export function iniciarEditorPrecos() {
  const containerLista = document.getElementById("lista-editor-produtos");
  const containerAbas = document.getElementById("admin-brand-tabs");
  const inputBusca = document.getElementById("busca-editor");

  if (!containerLista || !inputBusca || !containerAbas) return;

  const btnCorrigir = document.createElement("button");
  btnCorrigir.textContent = "🪄 Corrigir Erro dos Milhares (x1000)";
  btnCorrigir.style.cssText = "width: 100%; margin-bottom: 20px; padding: 15px; background: #ff9800; color: white; border: none; font-weight: bold; border-radius: 8px; cursor: pointer;";

  btnCorrigir.onclick = async () => {
    if (!confirm("Deseja corrigir preços entre 1.00 e 10.00 multiplicando por 1000?")) return;
    mostrarLoading();
    btnCorrigir.disabled = true;
    let totalCorrigidos = 0;
    const updates = [];

    for (const produto of dados) {
      if (!produto.servicosMap) continue;
      let mudouAlgo = false;
      const novosPrecos = { ...produto.servicosMap };

      Object.keys(novosPrecos).forEach(servico => {
        const valorAtual = novosPrecos[servico];
        if (valorAtual > 1 && valorAtual < 10) {
          novosPrecos[servico] = valorAtual * 1000;
          mudouAlgo = true;
          totalCorrigidos++;
        }
      });

      if (mudouAlgo) {
        const docRef = doc(db, "produtos", produto.id);
        updates.push(updateDoc(docRef, { servicos: novosPrecos }));
      }
    }

    try {
      await Promise.all(updates); 
      alert(`✅ ${totalCorrigidos} preços corrigidos!`);
    } catch (err) {
      console.error("Erro na correção:", err);
      alert("❌ Erro ao corrigir preços.");
    } finally {
      btnCorrigir.disabled = false;
      ocultarLoading();
      document.querySelector("#admin-brand-tabs .tab-btn.active")?.click(); 
    }
  };

  if (!document.getElementById("btn-corrigir-id")) {
    btnCorrigir.id = "btn-corrigir-id";
    containerAbas.parentNode.insertBefore(btnCorrigir, containerAbas);
  }

  const marcasUnicas = [...new Set(dados.map(item => item.marca))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  containerAbas.innerHTML = "";

  marcasUnicas.forEach(marca => {
    const btn = document.createElement("button");
    btn.textContent = marca;
    btn.className = "tab-btn";
    btn.onclick = () => {
      document.querySelectorAll("#admin-brand-tabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderizarEditor(marca, "");
    };
    containerAbas.appendChild(btn);
  });

  const renderizarEditor = (filtroMarca, filtroTexto) => {
    containerLista.innerHTML = "";
    const filtrados = dados.filter(item => {
      const busca = `${item.marca} ${item.modelo}`.toLowerCase();
      if (filtroTexto.length > 0) return busca.includes(filtroTexto.toLowerCase());
      return item.marca === filtroMarca;
    });

    filtrados.forEach(produto => {
      const div = document.createElement("div");
      div.className = "editor-card";
      div.style.cssText = "border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fff;";

      let htmlServicos = "";
      Object.keys(produto.servicosMap || {}).forEach(servico => {
        htmlServicos += `
          <div style="margin-top: 8px; display: flex; justify-content: space-between;">
            <label>${servico}:</label>
            <input type="number" class="input-preco" data-servico="${servico}" value="${produto.servicosMap[servico]}" style="width: 80px; padding:5px;">
          </div>`;
      });

      div.innerHTML = `
        <h3 style="color:#004aad; margin-top:0;">${produto.modelo}</h3>
        ${htmlServicos}
        <button class="btn-salvar-preco" style="width:100%; margin-top:15px; background:#004aad; color:#fff; border:none; padding:10px; border-radius:6px; cursor:pointer; font-weight:bold;">💾 Salvar</button>`;

      div.querySelector(".btn-salvar-preco").onclick = async () => {
        try {
          const novosPrecos = {};
          div.querySelectorAll(".input-preco").forEach(i => novosPrecos[i.dataset.servico] = parseFloat(i.value) || 0);
          const docRef = doc(db, "produtos", produto.id);
          await updateDoc(docRef, { servicos: novosPrecos });
          alert("✅ Preço salvo no Firebase!");
        } catch (err) {
          console.error("Erro ao salvar preço:", err);
          alert("❌ Erro ao salvar.");
        }
      };
      containerLista.appendChild(div);
    });
  };

  inputBusca.oninput = (e) => renderizarEditor(null, e.target.value);
}