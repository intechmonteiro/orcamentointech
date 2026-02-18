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
  if (typeof montarHomeEAbas === "function") montarHomeEAbas();
}

async function carregarDoCSV() {
  try {
    const resp = await fetch(CSV_URL);
    console.log("CSV carregado (Backup)");
  } catch (e) { console.error(e) }
}

// ================= EDITOR DE PREÇOS (PAINEL ADMIN) ================= //
export function iniciarEditorPrecos() {
  const containerLista = document.getElementById("lista-editor-produtos");
  const containerAbas = document.getElementById("admin-brand-tabs");
  const inputBusca = document.getElementById("busca-editor");
  
  if (!containerLista || !inputBusca || !containerAbas) return;

  const btnCorrigir = document.createElement("button");
  btnCorrigir.textContent = "🪄 Corrigir Erro dos Milhares (x1000)";
  btnCorrigir.style.cssText = "width: 100%; margin-bottom: 20px; padding: 15px; background: #ff9800; color: white; border: none; font-weight: bold; border-radius: 8px; cursor: pointer;";
  
  btnCorrigir.onclick = async () => {
    if(!confirm("Deseja corrigir preços entre 1.00 e 10.00 multiplicando por 1000?")) return;
    btnCorrigir.disabled = true;
    let totalCorrigidos = 0;

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
        await updateDoc(docRef, { servicos: novosPrecos });
      }
    }
    alert(`✅ ${totalCorrigidos} preços corrigidos!`);
    btnCorrigir.disabled = false;
    document.querySelector(".admin-tab-btn.active")?.click();
  };

  if (!document.getElementById("btn-corrigir-id")) {
      btnCorrigir.id = "btn-corrigir-id";
      containerAbas.parentNode.insertBefore(btnCorrigir, containerAbas);
  }

  const marcasUnicas = [...new Set(dados.map(item => item.marca))].sort();
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
      if (filtroTexto.length > 0) {
        return `${item.marca} ${item.modelo}`.toLowerCase().includes(filtroTexto.toLowerCase());
      }
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
            <input type="number" class="input-preco" data-servico="${servico}" value="${produto.servicosMap[servico]}" style="width: 80px;">
          </div>`;
      });

      div.innerHTML = `
        <h3>${produto.modelo}</h3>
        ${htmlServicos}
        <button class="btn-salvar-preco" style="width:100%; margin-top:10px; background:#28a745; color:#fff; border:none; padding:8px; border-radius:4px; cursor:pointer;">💾 Salvar</button>`;

      div.querySelector(".btn-salvar-preco").onclick = async (e) => {
        const novosPrecos = {};
        div.querySelectorAll(".input-preco").forEach(i => novosPrecos[i.dataset.servico] = parseFloat(i.value) || 0);
        await updateDoc(doc(db, "produtos", produto.id), { servicos: novosPrecos });
        alert("Salvo!");
      };
      containerLista.appendChild(div);
    });
  };

  inputBusca.oninput = (e) => renderizarEditor(null, e.target.value);
}


// ================= IMPORTADOR COM TRAVA DE SEGURANÇA ================= //

// ================= IMPORTADOR INTELIGENTE (LIMPEZA TOTAL DE NOMES) ================= //
export function iniciarImportador() {
  const btnProcessar = document.getElementById("btn-processar-importacao");
  const txtArea = document.getElementById("texto-importacao");
  const logArea = document.getElementById("log-importacao");
  
  if (!btnProcessar) return;

  btnProcessar.onclick = async () => {
    const texto = txtArea.value.trim();
    if (!texto) return alert("Cole a lista primeiro!");
    
    const maoObra = parseFloat(document.getElementById("config-mao-obra").value) || 0;
    const frete = parseFloat(document.getElementById("config-frete").value) || 0;
    const margem = parseFloat(document.getElementById("config-margem").value) || 0;
    const multiplicador = 1 + (margem / 100);

    btnProcessar.disabled = true;
    logArea.style.display = "block";
    logArea.innerHTML = "🔍 Classificando e limpando nomes dos modelos...<br>";

    const linhas = texto.split("\n");
    const bufferPrecos = {}; 
    let marcaAtual = "Outros"; 

    for (let linha of linhas) {
      linha = linha.trim();
      if (!linha) continue;
      if (linha.includes("📱")) { marcaAtual = linha.replace(/📱/g, "").trim(); continue; }

      const matchPreco = linha.match(/R\$\s?([\d.,]+)/i);
      if (!matchPreco) continue;

      let precoCusto = parseFloat(matchPreco[1].replace(".", "").replace(",", "."));
      if (precoCusto < 10 && linha.includes("1.")) precoCusto *= 1000; 

      const linhaUP = linha.toUpperCase();
      
      const matchAro = linhaUP.includes("C/ARO") || linhaUP.includes("COM ARO") || linhaUP.includes("C/ ARO");
      const matchSemAro = linhaUP.includes("SEM ARO") || linhaUP.includes("S/ARO") || linhaUP.includes("S/ ARO");
      const matchNacional = linhaUP.includes("NACIONAL");
      const matchOled = linhaUP.includes("OLED");
      const matchOriginal = linhaUP.includes("ORIGINAL") || linhaUP.includes("ORI ") || linhaUP.includes("- ORI");
      const matchVivid = linhaUP.includes("VIVID");

      // --- LÓGICA DE CATEGORIA (Invisível para o cliente) ---
      let tipoServico = "Tela Incell (Sem Aro)"; 

      if (matchAro) {
        tipoServico = "Tela Incell (C/ Aro)";
      } else if (matchOled) {
        tipoServico = "Tela OLED";
      } else if (matchNacional || matchOriginal || matchVivid) {
        tipoServico = "Tela Nacional";
      } else if (matchSemAro) {
        // Se for caro (>500), vira Nacional. Se for barato, Incell.
        tipoServico = precoCusto >= 500 ? "Tela Nacional" : "Tela Incell (Sem Aro)";
      }

      // --- LIMPEZA TOTAL (Não deixa sobrar nada de termo técnico no nome) ---
      let modeloLimpo = linha.replace(matchPreco[0], "")
        .replace(/C\/ARO|COM ARO|C\/ ARO|SEM ARO|S\/ARO|S\/ ARO|NACIONAL|OLED|ORIGINAL|ORI |VIVID|- ORI/ig, "")
        .replace(/\s+/g, " ") // Remove espaços duplos
        .replace(/-/g, "")
        .trim();

      const precoFinal = Math.ceil(((precoCusto + maoObra + frete) * multiplicador) / 10) * 10;
      const chaveDuelo = `${marcaAtual}_${modeloLimpo}`;

      if (!bufferPrecos[chaveDuelo] || precoFinal > bufferPrecos[chaveDuelo].preco) {
        bufferPrecos[chaveDuelo] = { 
            marca: marcaAtual, 
            modelo: modeloLimpo, 
            servico: tipoServico, 
            preco: precoFinal 
        };
      }
    }

    const listaFinal = Object.values(bufferPrecos);
    let contadorAlterados = 0;
    let contadorMantidos = 0;

    for (const item of listaFinal) {
      const alterou = await atualizarOuCriarProduto(item.marca, item.modelo, item.servico, item.preco);
      if (alterou) {
        logArea.innerHTML += `🚀 UP: ${item.modelo} (Salvo como ${item.servico}) -> R$ ${item.preco}<br>`;
        contadorAlterados++;
      } else {
        contadorMantidos++;
      }
    }

    alert(`Concluído!\n📈 Alterados/Novos: ${contadorAlterados}\n✅ Mantidos: ${contadorMantidos}`);
    btnProcessar.disabled = false;
    document.querySelector(".admin-tab-btn[data-tab='tab-produtos']")?.click();
  };
}
// Função auxiliar com a trava de segurança
async function atualizarOuCriarProduto(marca, modelo, servico, precoNovo) {
  const produtoExistente = dados.find(p => p.modelo.toUpperCase() === modelo.toUpperCase());

  if (produtoExistente) {
    const precoAtual = produtoExistente.servicosMap[servico] || 0;

    // TRAVA DE SEGURANÇA: Só altera se o preço NOVO for MAIOR que o ATUAL
    if (precoNovo > precoAtual) {
      const novosServicos = { ...produtoExistente.servicosMap };
      novosServicos[servico] = precoNovo;
      
      const docRef = doc(db, "produtos", produtoExistente.id);
      await updateDoc(docRef, { servicos: novosServicos });
      return true; // Indica que houve alteração
    }
    return false; // Indica que o valor era menor ou igual
  } else {
    // Se o produto não existe, ele é criado do zero
    await addDoc(collection(db, "produtos"), {
      marca: marca,
      modelo: modelo,
      servicos: { [servico]: precoNovo }
    });
    return true;
  }
}