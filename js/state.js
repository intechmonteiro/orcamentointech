



// ------------ DADOS GLOBAIS (CARRINHO, MARCAS, DADOS) ------------------ //

export const carrinho = [];
export const dados = [];
export const marcas = [];
export const colunasServicos = [];

export function setCarrinho(novo) {
  carrinho.length = 0;
  carrinho.push(...novo);
}
