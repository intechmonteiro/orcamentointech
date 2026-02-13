



//------------------------------ CONEXÃO PARA O SALVAR NA NUVEM ------------------------------//


import { collection, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase.js";


// Cache local para o sistema continuar rápido e não quebrar o seu painel
let historicoCache = [];

// Escuta o banco de dados em TEMPO REAL (Se salvar no celular, aparece no PC na hora)
const q = query(collection(db, "orcamentos"), orderBy("data", "desc"));

onSnapshot(q, (snapshot) => {
  historicoCache = [];
  snapshot.forEach((doc) => {
    // Guarda os dados e a ID única gerada pela nuvem
    historicoCache.push({ id: doc.id, ...doc.data() });
  });

  // Atualiza as telas automaticamente se o admin estiver aberto
  if (typeof window.carregarRelatorio === "function") window.carregarRelatorio();
  if (typeof window.atualizarDashboard === "function") window.atualizarDashboard();
});

// ------------ Ações Principais ------------ //

// Salva um orçamento na Nuvem
export async function salvarOrcamento(registro) {
  try {
    await addDoc(collection(db, "orcamentos"), registro);
    console.log("✅ Orçamento salvo na nuvem com sucesso!");

  } catch (erro) {
    console.error("❌ Erro ao salvar na nuvem: ", erro);
    alert("Erro ao salvar orçamento. Verifique sua internet.");
  }
}

// Retorna todos os orçamentos (Lê do cache que é atualizado em tempo real)
export function obterHistorico() {
  return historicoCache;
}

export function limparHistorico() {
  // Apenas avisamos, apagar tudo da nuvem requer outra função pra segurança
  alert("Para limpar o histórico da nuvem, acesse o painel do Firebase.");
}

// ================= BACKUP MANUAL ================= //
export function gerarBackupManual() {
  if (historicoCache.length === 0) {
    alert("Nenhum dado na nuvem para fazer backup.");
    return; 
  }

  const data = new Date();
  const timestamp = data.toISOString().replace(/[:.]/g, "-");
  const nomeArquivo = `backup-orcamentos-${timestamp}.json`;

  const blob = new Blob(
    [JSON.stringify(historicoCache, null, 2)],
    { type: "application/json" }
  );

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  console.log("✅ Backup manual gerado:", nomeArquivo);
}

// ================= RESTAURAR BACKUP PARA A NUVEM ================= //
export function restaurarBackup(arquivo) {
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const dados = JSON.parse(e.target.result);

      if (!Array.isArray(dados)) {
        alert("❌ Backup inválido.");
        return;
      }

      alert("⏳ Subindo backup antigo para a nuvem... Clique em OK e aguarde.");

      // Sobe cada orçamento antigo para o Firebase
      for (const item of dados) {
        // Limpa a ID antiga se tiver, pro Firebase gerar uma nova
        delete item.id; 
        await addDoc(collection(db, "orcamentos"), item);
      }

      alert("✅ Backup restaurado para a nuvem com sucesso!");
    } catch (err) {
      alert("❌ Erro ao ler arquivo de backup.");
      console.error(err);
    }
  };

  reader.readAsText(arquivo);
}