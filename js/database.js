



// ---------------------BANCO DE DADOS (FIREBASE + CSV LEGADO)------------------ //


import { db } from "./firebase.js";
import { collection, getDocs, addDoc, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { dados, colunasServicos, marcas } from "./state.js";
import { mostrarLoading, ocultarLoading, montarHomeEAbas } from "./ui.js";

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