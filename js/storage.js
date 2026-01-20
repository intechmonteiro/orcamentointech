



//------------ Armazenamento local dos orçamentos ------------//


const STORAGE_KEY = "MI_HISTORICO_ORCAMENTOS";

// Salva um orçamento
export function salvarOrcamento(registro) {
  const lista = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  lista.unshift(registro);

  // mantém só os últimos 100
  if (lista.length > 100) lista.pop();

  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));

  gerarBackupAutomatico();

}
// Retorna todos os orçamentos
export function obterHistorico() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}
// Limpa tudo (se precisar no futuro)
export function limparHistorico() {
  localStorage.removeItem(STORAGE_KEY);
}


// ================= BACKUP AUTOMÁTICO ================= //
export function gerarBackupAutomatico() {
  const historico = obterHistorico();

  const data = new Date();
  const timestamp = data.toISOString().replace(/[:.]/g, "-");

  const nomeArquivo = `backup-orcamentos-${timestamp}.json`;

  const blob = new Blob(
    [JSON.stringify(historico, null, 2)],
    { type: "application/json" }
  );

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log("✅ Backup automático gerado:", nomeArquivo);
}


// ================= RESTAURAR BACKUP ================= //
export function restaurarBackup(arquivo) {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const dados = JSON.parse(e.target.result);

      if (!Array.isArray(dados)) {
        alert("❌ Backup inválido.");
        return;
      }

      localStorage.setItem(
        "MI_HISTORICO_ORCAMENTOS",
        JSON.stringify(dados)
      );

      alert("✅ Backup restaurado com sucesso!");

      // Atualiza telas automaticamente (se existirem)
      if (typeof carregarRelatorio === "function") carregarRelatorio();
      if (typeof atualizarDashboard === "function") atualizarDashboard();

    } catch (err) {
      alert("❌ Erro ao ler arquivo de backup.");
      console.error(err);
    }
  };

  reader.readAsText(arquivo);
}
