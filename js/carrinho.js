import { carrinho, setCarrinho } from "./state.js";
import { atualizarSidebar } from "./ui.js";

function salvarLocal() {
  localStorage.setItem("MI_CARRINHO", JSON.stringify(carrinho));
}

export function restaurarCarrinho() {
  const salvo = localStorage.getItem("MI_CARRINHO");
  if (salvo) {
    setCarrinho(JSON.parse(salvo));
    atualizarSidebar();
  }
}

export function adicionarAoCarrinho(produto) {
  const existente = carrinho.find(item => item.modelo === produto.modelo && item.nome === produto.nome);
  
  if (existente) {
    existente.qtd += 1;
  } else {
    carrinho.push({ ...produto, qtd: 1 });
  }
  
  salvarLocal();
  atualizarSidebar();
}

export function removerDoCarrinho(modelo, nome) {
  const index = carrinho.findIndex(item => item.modelo === modelo && item.nome === nome);
  
  if (index !== -1) {
    if (carrinho[index].qtd > 1) {
      carrinho[index].qtd -= 1;
    } else {
      carrinho.splice(index, 1);
    }
    salvarLocal();
    atualizarSidebar();
  }
}

export function limparCarrinho() {
  carrinho.length = 0;
  salvarLocal();
  atualizarSidebar();
}