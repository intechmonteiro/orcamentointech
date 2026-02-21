// Este arquivo contém os dados dos produtos, marcas, e os serviços
export const dados = []; // Armazenará os produtos com seus preços
export const marcas = []; // Armazenará as marcas dos produtos
export const colunasServicos = []; // Armazenará os nomes dos serviços (ex: "Troca de Tela", "Troca de Bateria")

// Função para adicionar um novo produto
export function adicionarProduto(produto) {
  dados.push(produto);
  if (!marcas.includes(produto.marca)) {
    marcas.push(produto.marca);
  }
  if (!colunasServicos.length) {
    colunasServicos.push(...Object.keys(produto.servicos));
  }
}

// Função para atualizar os dados de um produto
export function atualizarProduto(id, novosPrecos) {
  const produto = dados.find(p => p.id === id);
  if (produto) {
    produto.servicos = novosPrecos;
  }
}