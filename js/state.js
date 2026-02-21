// ================= STATE.JS ================= //
// Focado EXCLUSIVAMENTE no estado do orçamento/carrinho do cliente.
// (Os produtos e marcas moram no dados.js agora!)

export const carrinho = [];

// Função pra setar/limpar carrinho (essencial para quando puxa do localStorage)
export function setCarrinho(novo) {
  carrinho.length = 0;    // Limpa o array atual sem quebrar a referência
  carrinho.push(...novo); // Adiciona os itens novos
}