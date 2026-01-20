




// ----------- CARREGA E PROCESSA PLANILHA ----------- //
import { mostrarLoading, ocultarLoading } from "./ui.js";
import { dados, colunasServicos, marcas } from "./state.js";
import { montarHomeEAbas } from "./ui.js";



const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTLVINumL_bd-huXi3YRvNVit0IjNSijek8TJLrXYsX1uIEwr-UogRTacUkz0cgvkA1ikSPWqymGzw4/pub?output=csv";

/* =========================
   FUNÇÃO PRINCIPAL
========================= */
export async function carregarCSV() {
  mostrarLoading();

  let csvText = null;
  let isFallback = false;

  try {
    const resp = await fetch(CSV_URL);
    if (!resp.ok) throw new Error(`Erro de rede: ${resp.status}`);
    csvText = await resp.text();
    salvarCSVCache(csvText);

  } catch (err) {
    console.warn("Falha ao carregar CSV da rede. Tentando cache...", err);
    csvText = carregarCSVCache();
    isFallback = true;

    if (!csvText) {
      ocultarLoading();
      alert("Não foi possível carregar os dados da planilha.");
      return;
    }
  }

  try {
    const parsed = parseCSV(csvText);
    console.log("CSV parseado:", parsed.length, "linhas");

    const header = parsed[0].map(h => h.toLowerCase());
    const idxMarca = header.indexOf("marca");
    const idxModelo = header.indexOf("modelo");

    if (idxMarca === -1 || idxModelo === -1) {
      alert("CSV precisa ter colunas 'marca' e 'modelo'");
      ocultarLoading();
      return;
    }

    // limpar estados
    marcas.length = 0;
    dados.length = 0;
    colunasServicos.length = 0;

    // colunas de serviços
    header.forEach((_, i) => {
      if (i !== idxMarca && i !== idxModelo) {
        colunasServicos.push(parsed[0][i]);
      }
    });

    parsed.slice(1).forEach(linha => {
      const marca = linha[idxMarca]?.trim();
      const modelo = linha[idxModelo]?.trim();
      if (!marca || !modelo) return;

      const precos = linha
        .filter((_, i) => i !== idxMarca && i !== idxModelo)
        .map(v =>
          parseFloat(
            String(v)
              .replace(/[R$\s]/g, "")
              .replace(/\./g, "")
              .replace(",", ".")
          ) || 0
        );

      dados.push({ marca, modelo, precos });

      if (!marcas.includes(marca)) marcas.push(marca);
    });

    marcas.sort((a, b) => a.localeCompare(b, "pt-BR"));

    console.log("Marcas:", marcas);
    console.log("Dados:", dados.slice(0, 5));
    console.log("Colunas serviços:", colunasServicos);

    montarHomeEAbas();

  } catch (err) {
    console.error("Erro ao processar CSV:", err);
  }

  ocultarLoading();

  if (isFallback) {
    console.warn("Dados carregados do cache");
  }
}
function parseCSV(texto) {
  return texto
    .trim()
    .split("\n")
    .map(linha =>
      linha
        .split(",")
        .map(cel => cel.replace(/^"|"$/g, "").trim())
    );
}
function salvarCSVCache(texto) {
  localStorage.setItem("csv_cache", texto);
}
function carregarCSVCache() {
  return localStorage.getItem("csv_cache");
}
