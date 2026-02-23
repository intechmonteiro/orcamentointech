import { listenOrcamentos, getCatalogoOnce, importCatalogoFromCsvRows, CATALOGO_COLLECTION } from "./firebase.js";
import { gerarPDF, enviarWhatsApp } from "./acoes.js";

const el = (id) => document.getElementById(id);

const ui = {
  loading: el("loading"),

  // Carrinho
  cartToggle: el("cart-toggle"),
  cartSidebar: el("cart-sidebar"),
  cartClose: el("cart-close"),
  cartItems: el("cart-items"),
  cartTotal: el("cart-total"),
  btnOpenWa: el("btn-open-wa"),
  btnGerarPdf: el("btn-gerar-pdf"),
  btnClearCart: el("btn-clear-cart"),

  // Admin
  abrirAdmin: el("abrir-admin"),
  painelAdmin: el("painel-admin"),
  sairAdmin: el("btn-sair-admin"),
  relatorioLista: el("relatorio-lista"),
  dashQtd: el("dash-qtd"),
  btnExportarRelatorio: el("btn-exportar-relatorio"),

  // Modal orçamento
  modalOrc: el("modal-orcamento"),
  modalOrcFechar: el("modal-orcamento-fechar"),
  btnConfirmarOrc: el("btn-confirmar-orcamento"),
  clienteNome: el("cliente-nome"),
  formaPagamento: el("forma-pagamento"),
  parcelas: el("parcelas"),

  // Modal login admin
  modalAdminLogin: el("modal-admin-login"),
  modalAdminFechar: el("modal-admin-fechar"),
  adminPass: el("admin-pass"),
  adminErr: el("admin-err"),
  btnAdminEntrar: el("btn-admin-entrar"),

  // Lista serviços
  listaServicos: el("lista-servicos"),
};

// =========================== CONFIG ===========================

const ADMIN_PASSWORD = "132205";
const ADMIN_SESSION_KEY = "mi_admin_authed";
const CART_STORAGE_KEY = "mi_cart_v1";

let pendingCheckoutAction = null; // "wa" | "pdf"

// =========================== Estado ===========================

let cart = [];
let relatorios = [];
let catalogo = [];
let activeBrand = "Todos";
let searchText = "";

// =========================== Helpers ===========================
function showLoading(v) {
  ui.loading?.classList.toggle("hidden", !v);
}
function openPanel(node) { node?.classList.remove("hidden"); }
function closePanel(node) { node?.classList.add("hidden"); }
function isOpen(node) { return node && !node.classList.contains("hidden"); }

function formatBRL(value) {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function calcTotal() {
  return cart.reduce((acc, item) => acc + (item.preco * (item.qtd || 1)), 0);
}

// ===========================
// Carrinho persistência
// ===========================
function saveCart() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch {}
}
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) cart = parsed;
  } catch {}
}

// =========================== Carrinho UI ===========================
function addToCart(servico) {
  if (!servico) return;

  // chave única por serviço + marca + modelo (não mistura modelos diferentes)
  const nome = String(servico.nome || "").trim();
  const marca = String(servico.marca || "").trim();
  const modelo = String(servico.modelo || "").trim();
  const key = `${nome}||${marca}||${modelo}`.toLowerCase();

  const idx = cart.findIndex((i) => String(i.key || "").toLowerCase() === key);

  if (idx >= 0) {
    cart[idx].qtd = (cart[idx].qtd || 1) + 1;
  } else {
    cart.push({
      key,
      nome,
      marca,
      modelo,
      preco: Number(servico.preco || 0),
      qtd: 1
    });
  }

  saveCart();
  renderCart();

  closeAdminPanel();
  openPanel(ui.cartSidebar);
}

function renderCart() {
  if (!ui.cartItems || !ui.cartTotal) return;

  ui.cartItems.innerHTML = "";

  if (!cart.length) {
    ui.cartItems.innerHTML = `<p style="opacity:.8">Seu orçamento está vazio.</p>`;
    ui.cartTotal.textContent = `Total: ${formatBRL(0)}`;
    return;
  }

  // 1) Agrupar por Marca + Modelo
  const groups = new Map();
  for (const item of cart) {
    const marca = String(item.marca || "").trim();
    const modelo = String(item.modelo || "").trim();
    const key = `${marca}|||${modelo}`.toLowerCase();

    if (!groups.has(key)) {
      groups.set(key, { marca, modelo, items: [] });
    }
    groups.get(key).items.push(item);
  }

  // 2) Ordenar grupos por marca/modelo
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const m = a.marca.localeCompare(b.marca);
    if (m !== 0) return m;
    return a.modelo.localeCompare(b.modelo);
  });

  // 3) Render dos grupos
  sortedGroups.forEach((g) => {
    // Cabeçalho do modelo (negrito)
    const header = document.createElement("div");
    header.style.padding = "12px 0 8px";
    header.style.fontWeight = "900";
    header.style.fontSize = "1.05rem";
    header.style.letterSpacing = "-.2px";
    header.style.borderBottom = "1px solid rgba(0,0,0,0.06)";
    header.textContent = `${g.marca ? g.marca + " " : ""}${g.modelo}`.trim();

    ui.cartItems.appendChild(header);

    // Ordenar itens por nome do serviço
    g.items.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));

    // Linhas do modelo (um pouco menor)
    g.items.forEach((item) => {
      const qtd = item.qtd || 1;
      const preco = Number(item.preco || 0);
      const lineTotal = preco * qtd;

      const row = document.createElement("div");
      row.className = "cart-item";
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto auto";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "10px 0";
      row.style.borderBottom = "1px solid rgba(0,0,0,0.06)";

const showQtyLine = qtd > 1;

row.innerHTML = `
  <div>
    <div style="font-weight:600; font-size:.95rem; line-height:1.15; display:flex; gap:8px; align-items:baseline;">
      <span>${item.nome}</span>
      ${qtd > 1 ? `<span style="font-weight:800; font-size:.85rem; opacity:.7;">x${qtd}</span>` : ""}
    </div>

    ${showQtyLine ? `<div style="opacity:.78; font-size:.84rem; margin-top:2px;">
      Unit: ${formatBRL(preco)}
    </div>` : ""}
  </div>

  <div style="font-weight:900; font-size:.95rem; white-space:nowrap;">
    ${formatBRL(lineTotal)}
  </div>

  <button type="button" class="close-btn light" data-remove-key="${item.key}" title="Remover">✕</button>
`;

      ui.cartItems.appendChild(row);
    });

    // Espaço entre grupos
    const spacer = document.createElement("div");
    spacer.style.height = "8px";
    ui.cartItems.appendChild(spacer);
  });

  ui.cartTotal.textContent = `Total: ${formatBRL(calcTotal())}`;

  // Remover pelo key (mais seguro do que idx quando está agrupado)
  ui.cartItems.querySelectorAll("[data-remove-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-remove-key");
      const idx = cart.findIndex((x) => String(x.key) === String(k));
      if (idx >= 0) cart.splice(idx, 1);
      saveCart();
      renderCart();
    });
  });
}

// =========================== Catálogo UI (busca + abas + grid) ===========================
function ensureCatalogUI() {
  if (!ui.listaServicos) return;

  const hero = ui.listaServicos.querySelector(".hero-home");

  let searchWrap = document.getElementById("search-wrap");
  if (!searchWrap) {
    searchWrap = document.createElement("div");
    searchWrap.id = "search-wrap";
    searchWrap.className = "search-container";
    searchWrap.innerHTML = `<input id="app-search" type="text" placeholder="Buscar serviços..." />`;
    hero?.after(searchWrap);
  }

  let tabsWrap = document.getElementById("tabs-wrap");
  if (!tabsWrap) {
    tabsWrap = document.createElement("div");
    tabsWrap.id = "tabs-wrap";
    tabsWrap.className = "brand-tabs-container";
    tabsWrap.innerHTML = `<div class="brand-tabs" id="brand-tabs"></div>`;
    searchWrap.after(tabsWrap);
  }

  let grid = document.getElementById("servicos-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "servicos-grid";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(240px, 1fr))";
    grid.style.gap = "14px";
    grid.style.marginTop = "18px";

    const container = ui.listaServicos.closest(".container") || ui.listaServicos;
    container.appendChild(grid);
  }

  const input = document.getElementById("app-search");
  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.addEventListener("input", () => {
      searchText = input.value || "";
      renderCatalogo();
    });
  }
}

function buildBrandTabs() {
  const tabs = document.getElementById("brand-tabs");
  if (!tabs) return;

  const brands = Array.from(new Set(catalogo.map((s) => (s.marca || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  const all = ["Todos", ...brands];

  tabs.innerHTML = all
    .map((b) => `<button type="button" class="tab-btn ${b === activeBrand ? "active" : ""}" data-brand="${b}">${b}</button>`)
    .join("");

  tabs.querySelectorAll("[data-brand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeBrand = btn.getAttribute("data-brand") || "Todos";
      buildBrandTabs();
      renderCatalogo();
    });
  });
}

function renderCatalogo() {
  const grid = document.getElementById("servicos-grid");
  if (!grid) return;

  const q = (searchText || "").trim().toLowerCase();

  // 1) filtra pela aba (marca)
  let list = [...catalogo];
  if (activeBrand !== "Todos") {
    list = list.filter((s) => (s.marca || "").trim() === activeBrand);
  }

  // 2) agrupa por marca + modelo
  const groups = new Map();
  for (const s of list) {
    const marca = (s.marca || "").trim();
    const modelo = (s.modelo || "").trim();
    const key = `${marca}|||${modelo}`.toLowerCase();

    if (!groups.has(key)) groups.set(key, { marca, modelo, items: [] });
    groups.get(key).items.push(s);
  }

  // 3) busca inteligente:
  // - se buscar por "S20", mostra todos os serviços do S20
  // - se buscar por "Tela", mostra só os serviços que têm "Tela"
  const visibleGroups = [];
  for (const g of groups.values()) {
    const modelHay = `${g.marca} ${g.modelo}`.toLowerCase();

    let itemsToShow = g.items;

    if (q) {
      const modelMatches = modelHay.includes(q);
      if (!modelMatches) {
        itemsToShow = g.items.filter((s) => String(s.nome || "").toLowerCase().includes(q));
      }
      if (!modelMatches && itemsToShow.length === 0) continue;
    }

    // ordena serviços dentro do modelo
    itemsToShow.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));

    visibleGroups.push({ ...g, items: itemsToShow });
  }

  // ordena grupos por marca e modelo
  visibleGroups.sort((a, b) => {
    const m = a.marca.localeCompare(b.marca);
    if (m !== 0) return m;
    return a.modelo.localeCompare(b.modelo);
  });

  if (!visibleGroups.length) {
    grid.innerHTML = `<div style="opacity:.8">Nenhum serviço encontrado.</div>`;
    return;
  }

  // 4) render: 1 card por modelo
  grid.innerHTML = visibleGroups
    .map((g) => {
      const headerTitle = `${g.marca} • ${g.modelo}`.trim();

      const rows = g.items
        .map((s) => {
          return `
            <div class="model-service-row">
              <div class="ms-name">${s.nome}</div>
              <div class="ms-price">${formatBRL(s.preco)}</div>
              <button type="button" class="ms-add" data-add="${s.id}">Adicionar</button>
            </div>
          `;
        })
        .join("");

      return `
        <div class="model-card">
          <div class="model-card-header">
            <div class="model-card-title">${headerTitle}</div>
            <div class="model-card-sub">Escolha o serviço abaixo</div>
          </div>
          <div class="model-card-body">
            ${rows}
          </div>
        </div>
      `;
    })
    .join("");

  // bind dos botões
  grid.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-add");
      const serv = catalogo.find((x) => String(x.id) === String(id));
      addToCart(serv);
    });
  });
}

// =========================== Modal orçamento ===========================//

function handlePagamentoChange() {
  const v = ui.formaPagamento?.value || "";
  const isCredito = v.toLowerCase() === "crédito" || v.toLowerCase() === "credito";
  ui.parcelas?.classList.toggle("hidden", !isCredito);
}

function openModalOrcamento(action) {
  pendingCheckoutAction = action || "wa";
  openPanel(ui.modalOrc);
  ui.clienteNome?.focus();
}

function closeModalOrcamento() {
  closePanel(ui.modalOrc);
  pendingCheckoutAction = null;
}

function getOrcamentoMeta() {
  const cliente = (ui.clienteNome?.value || "").trim();
  const pagamento = ui.formaPagamento?.value || "";
  const parcela = ui.parcelas && !ui.parcelas.classList.contains("hidden") ? (ui.parcelas.value || "1") : null;
  return { cliente, pagamento, parcela };
}

function buildWhatsAppMessage({ cliente, pagamento, parcela }) {
  const total = calcTotal();
  const linhas = cart.map((i) => `• ${i.nome} (x${i.qtd || 1}) — ${formatBRL(i.preco * (i.qtd || 1))}`).join("\n");

  const pag = pagamento
    ? (pagamento.toLowerCase().includes("cred") && parcela ? `Crédito (${parcela}x)` : pagamento)
    : "Não informado";

  const msg =
    `Olá! Segue meu orçamento na Monteiro Intech:\n\n` +
    `Cliente: ${cliente || "-"}\n` +
    `Pagamento: ${pag}\n\n` +
    `Itens:\n${linhas}\n\n` +
    `Total: ${formatBRL(total)}`;

  return encodeURIComponent(msg);
}

function sendToWhatsApp(meta) {
  window.open(`https://wa.me/5555997005039?text=${buildWhatsAppMessage(meta)}`, "_blank", "noopener,noreferrer");
}



// =========================== Admin  ===========================

function isAdminAuthed() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"; }
function setAdminAuthed(v) { sessionStorage.setItem(ADMIN_SESSION_KEY, v ? "1" : "0"); }

function openAdminLogin() {
  ui.adminErr && (ui.adminErr.style.display = "none");
  if (ui.adminPass) ui.adminPass.value = "";
  openPanel(ui.modalAdminLogin);
  setTimeout(() => ui.adminPass?.focus(), 50);
}
function closeAdminLogin() { closePanel(ui.modalAdminLogin); }

function openAdminPanel() {
  closePanel(ui.cartSidebar);
  openPanel(ui.painelAdmin);
}
function closeAdminPanel() { closePanel(ui.painelAdmin); }

// ===========================
// Relatórios (Admin)
// ===========================
function parseAnyDate(r) {
  const raw = r.dataISO ?? r.createdAt ?? r.data ?? r.created_at ?? null;
  if (!raw) return new Date(0);
  if (raw?.toDate) return raw.toDate();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date(0) : d;
}
function normalizeRelatorio(r) {
  const d = parseAnyDate(r);
  return {
    id: r.id,
    cliente: r.cliente ?? r.clienteNome ?? r.nomeCliente ?? "-",
    pagamento: r.pagamento ?? r.formaPagamento ?? "-",
    total: Number(r.total ?? r.valorTotal ?? 0),
    dataISO: d.toISOString(),
  };
}
function renderRelatorios() {
  if (!ui.relatorioLista || !ui.dashQtd) return;
  ui.dashQtd.textContent = String(relatorios.length);
  ui.relatorioLista.innerHTML = "";

  if (!relatorios.length) {
    ui.relatorioLista.innerHTML = `<p style="opacity:.8">Sem orçamentos ainda.</p>`;
    return;
  }

  relatorios.forEach((r) => {
    const card = document.createElement("div");
    card.className = "dash-card";
    card.style.marginTop = "10px";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px">
        <div>
          <div style="font-weight:900">${r.cliente || "-"}</div>
          <div style="opacity:.85; font-size:.9rem">${r.pagamento || "-"}</div>
          <div style="opacity:.75; font-size:.85rem">${new Date(r.dataISO).toLocaleString("pt-BR")}</div>
        </div>
        <div style="font-weight:900">${formatBRL(r.total || 0)}</div>
      </div>
    `;
    ui.relatorioLista.appendChild(card);
  });
}
function exportRelatorioCSV() {
  if (!relatorios.length) return alert("Sem dados para exportar.");

  const header = ["Cliente", "Pagamento", "Total", "Data"];
  const rows = relatorios.map((r) => [
    (r.cliente || "").replaceAll('"', '""'),
    (r.pagamento || "").replaceAll('"', '""'),
    String(r.total || 0).replace(".", ","),
    new Date(r.dataISO).toLocaleString("pt-BR"),
  ]);

  const csv = header.join(";") + "\n" + rows.map((row) => row.map((v) => `"${v}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio_orcamentos_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===========================
// Importação CSV (Admin)
// ===========================
function setImportStatus(msg, isError = false) {
  const box = document.getElementById("import-status");
  if (!box) return;
  box.textContent = msg || "";
  box.style.color = isError ? "#dc2626" : "#111827";
}

async function parseCsvTextToRows(csvText) {
  if (!window.Papa) throw new Error("PapaParse não carregou. Confira o script no HTML.");
  const res = window.Papa.parse(csvText, { header: true, skipEmptyLines: true, transformHeader: (h) => String(h || "").trim() });
  return res.data || [];
}

async function importCsvFromUrl() {
  const url = (document.getElementById("csv-url")?.value || "").trim();
  if (!url) return setImportStatus("Cole uma URL do CSV primeiro.", true);

  setImportStatus("Baixando CSV...");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar CSV: ${resp.status}`);

  const csvText = await resp.text();
  setImportStatus("Lendo CSV...");
  const rows = await parseCsvTextToRows(csvText);

  setImportStatus(`Importando ${rows.length} linhas para o Firebase (coleção "${CATALOGO_COLLECTION}")...`);
  const result = await importCatalogoFromCsvRows(rows, { includeZero: true, merge: true });

  setImportStatus(`Concluído. Gravados: ${result.written}. Ignorados: ${result.skipped}.`);
  await window.__reloadCatalogo?.();
}

async function importCsvFromFile(file) {
  if (!file) return;
  setImportStatus("Lendo arquivo CSV...");
  const csvText = await file.text();
  const rows = await parseCsvTextToRows(csvText);

  setImportStatus(`Importando ${rows.length} linhas para o Firebase (coleção "${CATALOGO_COLLECTION}")...`);
  const result = await importCatalogoFromCsvRows(rows, { includeZero: true, merge: true });

  setImportStatus(`Concluído. Gravados: ${result.written}. Ignorados: ${result.skipped}.`);
  await window.__reloadCatalogo?.();
}

function bindImportUI() {
  const btnUrl = document.getElementById("btn-importar-csv-url");
  const fileInput = document.getElementById("csv-file");

  btnUrl?.addEventListener("click", async () => {
    try { await importCsvFromUrl(); }
    catch (e) { console.error(e); setImportStatus(String(e.message || e), true); }
  });

  fileInput?.addEventListener("change", async () => {
    try {
      const f = fileInput.files?.[0];
      await importCsvFromFile(f);
      fileInput.value = "";
    } catch (e) {
      console.error(e);
      setImportStatus(String(e.message || e), true);
    }
  });
}

// =========================== Eventos gerais ===========================
ui.cartToggle?.addEventListener("click", () => {
  closeAdminPanel();
  if (isOpen(ui.cartSidebar)) closePanel(ui.cartSidebar);
  else openPanel(ui.cartSidebar);
});
ui.cartClose?.addEventListener("click", () => closePanel(ui.cartSidebar));
ui.btnClearCart?.addEventListener("click", () => { cart = []; saveCart(); renderCart(); });

ui.btnOpenWa?.addEventListener("click", () => { if (!cart.length) return alert("Carrinho vazio."); openModalOrcamento("wa"); });
ui.btnGerarPdf?.addEventListener("click", () => { if (!cart.length) return alert("Carrinho vazio."); openModalOrcamento("pdf"); });

ui.modalOrcFechar?.addEventListener("click", closeModalOrcamento);
ui.formaPagamento?.addEventListener("change", handlePagamentoChange);
ui.btnConfirmarOrc?.addEventListener("click", () => {
  const meta = getOrcamentoMeta();
  if (!meta.cliente) return alert("Informe o nome do cliente.");
  if (!meta.pagamento) return alert("Selecione a forma de pagamento.");
ui.btnConfirmarOrc?.addEventListener("click", async () => {
  const meta = getOrcamentoMeta();
  if (!meta.cliente) return alert("Informe o nome do cliente.");
  if (!meta.pagamento) return alert("Selecione a forma de pagamento.");

  const dadosCliente = {
    nome: meta.cliente,
    pagamento: meta.pagamento,
    parcelas: meta.parcela
  };

  try {
    if (pendingCheckoutAction === "pdf") {
      await gerarPDF(cart, dadosCliente);
    } else {
      await enviarWhatsApp(cart, dadosCliente);
    }

    closeModalOrcamento();
  } catch (e) {
    console.error(e);
    alert("Erro ao gerar PDF/WhatsApp. Veja o console (F12).");
  }
});
});
ui.modalOrc?.addEventListener("click", (e) => { if (e.target === ui.modalOrc) closeModalOrcamento(); });

ui.abrirAdmin?.addEventListener("click", () => { if (isAdminAuthed()) openAdminPanel(); else openAdminLogin(); });
ui.modalAdminFechar?.addEventListener("click", closeAdminLogin);
ui.btnAdminEntrar?.addEventListener("click", () => {
  const pass = (ui.adminPass?.value || "").trim();
  if (pass === ADMIN_PASSWORD) { setAdminAuthed(true); closeAdminLogin(); openAdminPanel(); }
  else { if (ui.adminErr) ui.adminErr.style.display = "block"; ui.adminPass?.focus(); }
});
ui.adminPass?.addEventListener("keydown", (e) => { if (e.key === "Enter") ui.btnAdminEntrar?.click(); });
ui.modalAdminLogin?.addEventListener("click", (e) => { if (e.target === ui.modalAdminLogin) closeAdminLogin(); });
ui.sairAdmin?.addEventListener("click", () => { setAdminAuthed(false); closeAdminPanel(); });

ui.btnExportarRelatorio?.addEventListener("click", () => { if (!isAdminAuthed()) return alert("Acesso negado."); exportRelatorioCSV(); });

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (isOpen(ui.modalOrc)) closeModalOrcamento();
  else if (isOpen(ui.modalAdminLogin)) closeAdminLogin();
  else if (isOpen(ui.painelAdmin)) closeAdminPanel();
  else if (isOpen(ui.cartSidebar)) closePanel(ui.cartSidebar);
});

// ===========================  INIT  ===========================
(async function init() {
  handlePagamentoChange();
  loadCart();
  renderCart();

  ensureCatalogUI();

  // função global para recarregar catálogo (usada após importar CSV)
  window.__reloadCatalogo = async () => {
    catalogo = await getCatalogoOnce();
    console.log("CATALOGO carregado:", catalogo.length, "| coleção:", CATALOGO_COLLECTION);
    buildBrandTabs();
    renderCatalogo();
  };

  try {
    showLoading(true);
    await window.__reloadCatalogo();
  } catch (e) {
    console.error(e);
    alert("Não consegui carregar o catálogo. Veja o Console (F12).");
  } finally {
    showLoading(false);
  }

  // ativa importação CSV (se os elementos existirem no HTML)
  bindImportUI();

  // orçamentos (admin)
  listenOrcamentos(
    (items) => {
      relatorios = items.map(normalizeRelatorio);
      relatorios.sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));
      renderRelatorios();
    },
    (err) => console.error(err)
  );
})();