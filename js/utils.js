



// ----------HELPERS ($,FORMATAR A MOEDA)-------------//


export function $(id) {
  return document.getElementById(id);
}

export function formatBR(valor) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
