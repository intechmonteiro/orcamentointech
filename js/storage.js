//------------------------------ CONEXÃO PARA O SALVAR NA NUVEM ------------------------------//

import { collection, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase.js";

// Cache local para o sistema continuar rápido
let historicoCache = [];

// ================= FUNÇÃO VISUAL (QUE ESTAVA FALTANDO) ================= //

export function carregarRelatorio() {
  const lista = document.getElementById("relatorio-lista");
  if (!lista) return;

  // Limpa a lista atual
  lista.innerHTML = "";

  if (historicoCache.length === 0) {
    lista.innerHTML = "<p>Nenhum orçamento encontrado na nuvem.</p>";
    return;
  }

  // Desenha os itens na tela
  historicoCache.forEach(item => {
    const div = document.createElement("div");
    div.classList.add("relatorio-item");
    div.style.borderBottom = "1px solid #eee";
    div.style.padding = "10px 0";
    
    // Tenta formatar a data, se der erro usa a data atual
    let dataFormatada = "Data inválida";
    try {
        const dataObj = new Date(item.data);
        dataFormatada = dataObj.toLocaleDateString("pt-BR") + " " + dataObj.toLocaleTimeString("pt-BR").slice(0,5);
    } catch(e) {}

    const valorFormatado = (item.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${item.cliente || "Cliente"}</strong> <small style="color: #666;">(${item.numero || "S/N"})</small><br>
          <span style="font-size: 0.9em; color: #444;">${dataFormatada} - ${item.pagamento || ""}</span>
        </div>
        <div style="font-weight: bold; color: #1347a1;">
          ${valorFormatado}
        </div>
      </div>
    `;
    lista.appendChild(div);
  });
}

// ================= LISTENER DO FIREBASE (TEMPO REAL) ================= //

const q = query(collection(db, "orcamentos"), orderBy("data", "desc"));

onSnapshot(q, (snapshot) => {
  historicoCache = [];
  snapshot.forEach((doc) => {
    historicoCache.push({ id: doc.id, ...doc.data() });
  });

  // Atualiza a tela automaticamente assim que chegar dados novos
  carregarRelatorio();
  
  // Se tiver a função de dashboard no main, chama ela também (via evento global se necessário)
  if (typeof window.atualizarDashboard === "function") window.atualizarDashboard();
  else {
      // Tenta despachar um evento para o main atualizar o dashboard
      document.dispatchEvent(new Event("dadosAtualizados"));
  }
});

// ================= AÇÕES PRINCIPAIS ================= //

export async function salvarOrcamento(registro) {
  try {
    await addDoc(collection(db, "orcamentos"), registro);
    console.log("✅ Orçamento salvo na nuvem com sucesso!");
  } catch (erro) {
    console.error("❌ Erro ao salvar na nuvem: ", erro);
    alert("Erro ao salvar orçamento. Verifique sua internet.");
  }
}

export function obterHistorico() {
  return historicoCache;
}

// ================= BACKUP E EXPORTAÇÃO ================= //

// Renomeado para 'salvarBackup' para bater com o main.js
export function salvarBackup() {
  if (historicoCache.length === 0) return alert("Nada para salvar.");

  const data = new Date();
  const timestamp = data.toISOString().replace(/[:.]/g, "-");
  const nomeArquivo = `backup-intech-${timestamp}.json`;

  const blob = new Blob([JSON.stringify(historicoCache, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;
  link.click();
}

// Ajustado para receber o Evento do input file
export function restaurarBackup(event) {
  const arquivo = event.target.files[0];
  if (!arquivo) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const dados = JSON.parse(e.target.result);
      if (!Array.isArray(dados)) return alert("❌ Arquivo inválido.");

      if(confirm(`Deseja subir ${dados.length} orçamentos antigos para a nuvem?`)) {
          alert("⏳ Enviando para a nuvem... Aguarde.");
          for (const item of dados) {
            delete item.id; // Remove ID antiga para gerar nova
            await addDoc(collection(db, "orcamentos"), item);
          }
          alert("✅ Importação concluída!");
      }
    } catch (err) {
      alert("Erro ao ler backup.");
      console.error(err);
    }
  };
  reader.readAsText(arquivo);
}

export function exportarRelatorioExcel() {
  if (historicoCache.length === 0) return alert("Nada para exportar.");

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Numero,Data,Cliente,Pagamento,Total\n";

  historicoCache.forEach(h => {
    const dataF = new Date(h.data).toLocaleDateString("pt-BR");
    const totalF = (h.total || 0).toFixed(2).replace(".", ",");
    csvContent += `${h.numero},${dataF},${h.cliente},${h.pagamento},"${totalF}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Relatorio_Vendas.csv");
  document.body.appendChild(link);
  link.click();
}