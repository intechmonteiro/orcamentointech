// ======================================================== //
// storage.js - Armazenamento na nuvem (Firestore)
// ======================================================== //
import { db } from './firebase.js'; 
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const COLLECTION_NAME = "orcamentos";

// 1. SALVAR NOVO ORÇAMENTO NA NUVEM
export async function salvarOrcamento(registro) {
  try {
    const cleanData = { 
      ...registro, 
      data: registro.data || serverTimestamp() 
    };
    
    // Salva no banco de dados
    const docRef = await addDoc(collection(db, COLLECTION_NAME), cleanData);
    console.log("✅ Orçamento salvo na nuvem com ID:", docRef.id);

    // Removemos o backup automático daqui para não baixar um arquivo a cada clique!
    
  } catch (err) {
    console.error("Erro ao salvar:", err);
    alert("❌ Erro ao salvar na nuvem. Verifique sua internet.");
  }
}

// 2. BUSCAR TODOS OS ORÇAMENTOS (Para o Dashboard)
export async function obterHistorico() {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("data", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("Erro ao obter histórico:", err);
    return []; // Retorna vazio se der erro, pra não travar a tela
  }
}

// 3. LIMPAR HISTÓRICO DO MÊS
export async function limparHistorico() {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    
    // Deleta um por um
    const promessas = snapshot.docs.map(docSnap => deleteDoc(doc(db, COLLECTION_NAME, docSnap.id)));
    await Promise.all(promessas);
    
    console.log("✅ Histórico limpo na nuvem.");
  } catch (err) {
    console.error("Erro ao limpar:", err);
    alert("❌ Erro ao limpar histórico.");
  }
}

// 4. EXPORTAR BACKUP GERAL (Botão do Admin)
export async function gerarBackupGeral() {
  try {
    const historico = await obterHistorico();
    if (historico.length === 0) return alert("Nenhum dado para fazer backup.");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const nomeArquivo = `backup-intech-${timestamp}.json`;
    
    const blob = new Blob([JSON.stringify(historico, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log("✅ Backup completo gerado:", nomeArquivo);
  } catch (err) {
    console.error("Erro ao gerar backup:", err);
  }
}

// 5. RESTAURAR BACKUP (Botão do Admin)
export function restaurarBackup(arquivo) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const dados = JSON.parse(e.target.result);
      if (!Array.isArray(dados)) {
        return alert("❌ Arquivo de backup inválido.");
      }

      // Restaura cada item
      for (const item of dados) {
        // Remove o ID antigo para o Firebase criar um novo sem conflitos
        delete item.id; 
        await salvarOrcamento(item);
      }

      alert("✅ Backup restaurado na nuvem com sucesso!");

      // Tenta recarregar a tela (se as funções estiverem ativas)
      if (typeof window.atualizarDashboard === "function") window.atualizarDashboard();
      
    } catch (err) {
      alert("❌ Erro ao ler arquivo de backup.");
      console.error(err);
    }
  };
  reader.readAsText(arquivo);
}