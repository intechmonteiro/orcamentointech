



// ---------- js/carrinho.js ---------- //
import { carrinho, setCarrinho } from "./state.js";
import { atualizarSidebar, destacarCarrinho } from "./ui.js";



export function adicionarAoCarrinho(item) {
  const existente = carrinho.find(
    c => c.modelo === item.modelo && c.nome === item.nome
  );

  if (existente) {
    existente.qtd += 1;
  } else {
    carrinho.push({ ...item, qtd: 1 });
  }

  salvarCarrinho();
  atualizarSidebar();
  destacarCarrinho(); // ✅ só aqui
}
export function removerDoCarrinho(modelo, nome) {
  const index = carrinho.findIndex(
    c => c.modelo === modelo && c.nome === nome
  );

  if (index === -1) return;

  if (carrinho[index].qtd > 1) {
    carrinho[index].qtd -= 1;
  } else {
    carrinho.splice(index, 1);
  }

  salvarCarrinho();
  atualizarSidebar();
}
export function limparCarrinho() {
  setCarrinho([]);
  salvarCarrinho();
  atualizarSidebar();
}
export function restaurarCarrinho() {
  const salvo = localStorage.getItem("carrinho");

  if (salvo) {
    try {
      setCarrinho(JSON.parse(salvo));
    } catch {
      setCarrinho([]);
    }
  }

  atualizarSidebar();
}
function salvarCarrinho() {
  localStorage.setItem("carrinho", JSON.stringify(carrinho));
}
