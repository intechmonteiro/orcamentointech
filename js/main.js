import {
  listenOrcamentos,
  getCatalogoOnce,
  importCatalogoFromCsvRows,
  CATALOGO_COLLECTION,
  upsertTabelaPrecos
} from "./firebase.js";

let __acoesCache = null;
async function getAcoes() {
  if (__acoesCache) return __acoesCache;
  __acoesCache = await import("./acoes.js");
  return __acoesCache;
}

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

  // Painel Admin e Dashboar
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

// =========================== CONFIGURAÇÕES ===========================//

const ADMIN_PASSWORD = "132205";
const ADMIN_SESSION_KEY = "mi_admin_authed";
const CART_STORAGE_KEY = "mi_cart_v1";

let pendingCheckoutAction = null; // "wa" | "pdf"

// =========================== ESTADO DA APLICAÇÃO ===========================//

let cart = [];
let relatorios = [];
let catalogo = [];
let activeBrand = "Todos";
let searchText = "";

//============================ FUNÇÕES AUXILIARES ===========================//

function normalizePagamento(p) {
  const s = String(p || "").trim().toLowerCase();
  const noAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (noAccents.includes("pix")) return "pix";
  if (noAccents.includes("deb")) return "debito";
  if (noAccents.includes("cred")) return "credito";
  return "outro";
}

function formatBRL(value) {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcTotal() {
  return cart.reduce((acc, item) => acc + (item.preco * (item.qtd || 1)), 0);
}

function showLoading(v) {ui.loading?.classList.toggle("hidden", !v);}
function openPanel(node) { node?.classList.remove("hidden"); }
function closePanel(node) { node?.classList.add("hidden"); }
function isOpen(node) { return node && !node.classList.contains("hidden"); }

// =========================== DASHBOARD ADMIN ===========================//

function atualizarDashboardAdmin() {
  if (!relatorios) return;

  const qtd = relatorios.length;
  let total = 0, pix = 0, debito = 0, credito = 0;

  // 1. Processamento dos dados
  for (const r of relatorios) {
    const v = Number(r.total || 0);
    total += v;

    const tipo = normalizePagamento(r.pagamento);
    if (tipo === "pix") pix += v;
    else if (tipo === "debito") debito += v;
    else if (tipo === "credito") credito += v;
  }

  const ticket = qtd > 0 ? total / qtd : 0;

  // 2. Atualização da Interface (DOM)
  // Usamos o atalho el() para manter o padrão do seu projeto
  const mapeamento = {
    "dash-qtd": String(qtd),
    "dash-total": formatBRL(total),
    "dash-pix": formatBRL(pix),
    "dash-debito": formatBRL(debito),
    "dash-credito": formatBRL(credito),
    "dash-ticket": formatBRL(ticket)
  };

  // Itera sobre o mapeamento e atualiza apenas os campos que existirem na tela
  Object.entries(mapeamento).forEach(([id, valor]) => {
    const elemento = document.getElementById(id);
    if (elemento) {
      elemento.textContent = valor;
    }
  });

  // Log para controle na bancada da Rua Paulo Gelson Padilha, 58
  console.log(`[ADMIN] Dashboard atualizado: ${qtd} orçamentos.`);
}

// ===========================  CARRINHO (LÓGICA E UI) ===========================//

function saveCart() { 
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch {}
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (raw) cart = JSON.parse(raw);
  } catch {}
}

function addToCart(servico) {
  if (!servico) return;

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
  // 1. Verificações de segurança
  if (!ui.cartItems || !ui.cartTotal) return;
  
  // Limpa o carrinho visualmente antes de renderizar de novo
  ui.cartItems.innerHTML = "";

  // 2. Se o carrinho estiver vazio
  if (!cart.length) {
    ui.cartItems.innerHTML = `<p style="opacity:.8; text-align:center; padding:20px;">Seu orçamento está vazio.</p>`;
    ui.cartTotal.textContent = `Total: ${formatBRL(0)}`;
    return;
  }

  // 3. Agrupar por Marca + Modelo
  const groups = new Map();
  for (const item of cart) {
    // Cria uma chave única para agrupar (ex: "samsung|||a32")
    const key = `${item.marca}|||${item.modelo}`.toLowerCase();
    
    if (!groups.has(key)) {
      groups.set(key, { marca: item.marca, modelo: item.modelo, items: [] });
    }
    groups.get(key).items.push(item);
  }

  // 4. Renderizar (Iterar sobre os grupos)
  groups.forEach((g) => {
    // --- Cabeçalho do Grupo (Marca e Modelo) ---
    const header = document.createElement("div");
    header.className = "cart-group-header"; // Usa classe do CSS
    // Estilo inline de garantia caso o CSS falhe
    header.style.cssText = "padding: 12px 0 5px; font-weight: 900; border-bottom: 1px solid #eee; color: #004aad;";
    header.textContent = `${g.marca} ${g.modelo}`;
    ui.cartItems.appendChild(header);

    // --- Itens do Grupo ---
    g.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "cart-item"; // Usa classe do CSS
      // Estilo inline de garantia
      row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed #eee;";

      const qtd = item.qtd || 1;
      const preco = Number(item.preco || 0);
      const lineTotal = preco * qtd;
      const showQtyLine = qtd > 1;

      // HTML do Item
      row.innerHTML = `
        <div>
          <div style="font-weight:600; font-size:.95rem; display:flex; gap:8px; align-items:baseline;">
            <span>${item.nome}</span>
            ${qtd > 1 ? `<span style="font-weight:800; opacity:.7;">x${qtd}</span>` : ""}
          </div>
          ${showQtyLine ? `<div style="opacity:.78; font-size:.84rem; margin-top:2px;">Unit: ${formatBRL(preco)}</div>` : ""}
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-weight:900; font-size:.95rem; white-space:nowrap;">
            ${formatBRL(lineTotal)}
          </div>
          <button type="button" class="close-btn" data-remove-key="${item.key}" title="Remover" style="border:none; background:transparent; color:red; font-weight:bold; cursor:pointer; margin-left:10px;">✕</button>
        </div>
      `;

      ui.cartItems.appendChild(row);
    });
  });

  // 5. Atualizar Total Geral
  ui.cartTotal.textContent = `Total: ${formatBRL(calcTotal())}`;

  // 6. Ativar botões de remover
  ui.cartItems.querySelectorAll("[data-remove-key]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation(); // Evita cliques acidentais
      const k = btn.getAttribute("data-remove-key");
      // Remove o item filtrando pelo ID único (key)
      cart = cart.filter((x) => String(x.key) !== String(k));
      saveCart();
      renderCart();
    };
  });
}


// =========================== CATALOGO (UI, BUSCA, ABAS) ===========================//

function ensureCatalogUI() {
  if (!ui.listaServicos) return;

  const hero = ui.listaServicos.querySelector(".hero-home");

  // 1. Garante que o container de BUSCA exista
  let searchWrap = document.getElementById("search-wrap");
  if (!searchWrap) {
    searchWrap = document.createElement("div");
    searchWrap.id = "search-wrap";
    searchWrap.className = "search-container";
    searchWrap.innerHTML = `<input id="app-search" class="input-standard" type="text" placeholder="🔍 Buscar peças e serviços..." />`;
    
    // Insere logo após o Hero (título)
    if (hero) hero.after(searchWrap);
    else ui.listaServicos.prepend(searchWrap);
  }

  // 2. Garante que o container de ABAS exista
  let tabsWrap = document.getElementById("tabs-wrap");
  if (!tabsWrap) {
    tabsWrap = document.createElement("div");
    tabsWrap.id = "tabs-wrap";
    tabsWrap.className = "brand-tabs-container";
    tabsWrap.innerHTML = `<div class="brand-tabs" id="brand-tabs"></div>`;
    
    // Insere logo após a Busca (agora garantido que searchWrap existe)
    searchWrap.after(tabsWrap);
  }

  // 3. Garante que o input tenha o evento de digitação
  const input = document.getElementById("app-search");
  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.addEventListener("input", (e) => {
      searchText = e.target.value;
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
  let grid = document.getElementById("servicos-grid");
  
  // Garante que o grid existe
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "servicos-grid";
    if(ui.listaServicos) ui.listaServicos.appendChild(grid);
    else return;
  }

  grid.innerHTML = ""; 

  const q = (searchText || "").trim().toLowerCase();
  
  // 1. Filtros
  let list = (activeBrand === "Todos") 
    ? catalogo 
    : catalogo.filter(s => (s.marca || "").trim() === activeBrand);

  if (q) {
    list = list.filter(s => 
      `${s.marca} ${s.modelo} ${s.nome}`.toLowerCase().includes(q)
    );
  }

  // 2. Agrupamento
  const groups = new Map();
  list.forEach(s => {
    const familia = obterFamiliaModelo(s.modelo); // Ex: "IPHONE 11"
    const key = `${s.marca}|||${familia}`.toUpperCase();
    
    if (!groups.has(key)) {
      groups.set(key, { 
        marca: s.marca, 
        modeloDisplay: familia, 
        items: [] 
      });
    }
    groups.get(key).items.push(s);
  });

  if (groups.size === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--muted);">Nenhum modelo encontrado.</p>`;
    return;
  }

  // 3. Renderização
  const html = Array.from(groups.values())
    .sort((a, b) => a.modeloDisplay.localeCompare(b.modeloDisplay))
    .map(g => {
      
      // LÓGICA DA "LINHA":
      // Cria um Set com os nomes dos modelos originais. 
      // Se tiver mais de 1 nome diferente (ex: "11" e "11 Pro"), o tamanho será > 1.
      const modelosUnicos = new Set(g.items.map(i => i.modelo.trim().toUpperCase()));
      const ehLinha = modelosUnicos.size > 1;

      // Ordena itens dentro do card
      g.items.sort((a, b) => a.modelo.localeCompare(b.modelo));

      const rows = g.items.map(item => `
        <div class="model-service-row">
          <div style="flex:1;">
             ${ehLinha ? `<div style="font-size:0.75rem; color:#94a3b8; font-weight:700; margin-bottom:2px;">${item.modelo.toUpperCase()}</div>` : ''}
             <span class="ms-name">${item.nome}</span>
          </div>
          
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="ms-price">${formatBRL(item.preco)}</span>
            <button type="button" class="ms-add" data-add="${item.id}">Add</button>
          </div>
        </div>
      `).join("");

      // Monta o título do Card
      let htmlTitulo = `${g.marca} ${g.modeloDisplay}`;
      if (ehLinha) {
          htmlTitulo += ` <span style="font-size:0.75rem; background:#e0f2fe; color:#0284c7; padding:2px 6px; border-radius:4px; margin-left:5px; font-weight:700; text-transform:uppercase;">LINHA</span>`;
      }

      return `
        <div class="model-card">
          <div class="model-card-header" onclick="this.parentElement.classList.toggle('active')">
            <h4 class="model-card-title" style="display:flex; align-items:center;">
                ${htmlTitulo}
            </h4>
          </div>
          <div class="model-card-body">
            ${rows}
          </div>
        </div>
      `;
    }).join("");

  grid.innerHTML = html;

  // Reativa botões
  grid.querySelectorAll(".ms-add").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-add");
      const serv = catalogo.find(x => String(x.id) === String(id));
      if (serv) addToCart(serv);
    };
  });
}

function obterFamiliaModelo(modelo) {
  if (!modelo) return "Outros";
  let base = modelo.toUpperCase().trim();

  // Remove variações comuns para agrupar
  const sufixos = [
    "PRO MAX", "PRO", "MAX", "MAXX", "PLUS", "ULTRA", 
    "MINI", "LITE", "FE", "5G", "4G", "PRIME", "CORE", "NOTE", "S"
  ];

  sufixos.forEach(sufixo => {
    const regex = new RegExp(`\\s+${sufixo}(\\s+|$)`, "gi");
    base = base.replace(regex, "");
  });

  return base.trim();
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


// =========================== Admin  ===========================//


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


// =========================== Relatórios (Admin) ===========================//


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

    // ✅ mantém PDF/URL se existir no Firestore
    pdf: r.pdf ?? null,                 // ex: "data:application/pdf;base64,...."
    pdfUrl: r.pdfUrl ?? r.pdf_url ?? null // ex: URL do Storage (recomendado)
  };
}

// 2) Helpers para abrir PDF (URL ou DataURI)
function abrirPdfDoRegistro(reg) {
  if (!reg) return;

  // prioridade: URL (melhor)
  if (reg.pdfUrl) {
    window.open(reg.pdfUrl, "_blank", "noopener,noreferrer");
    return;
  }

  // datauri/base64
  if (reg.pdf && String(reg.pdf).startsWith("data:application/pdf")) {
    const dataUri = String(reg.pdf);

    // converte base64 em Blob para abrir mais estável no PC
    const base64 = dataUri.split(",")[1] || "";
    const bytes = atob(base64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);

    const blob = new Blob([buf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    window.open(url, "_blank", "noopener,noreferrer");

    // limpa depois (não precisa ficar pra sempre)
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  alert("Este orçamento ainda não tem PDF salvo.");
}

// 3) Atualize o renderRelatorios() para colocar o botão "Abrir PDF"
function renderRelatorios() {
  if (!ui.relatorioLista || !ui.dashQtd) return;

  ui.dashQtd.textContent = String(relatorios.length);
  ui.relatorioLista.innerHTML = "";

  if (!relatorios.length) {
    ui.relatorioLista.innerHTML = `<p style="opacity:.8">Sem orçamentos ainda.</p>`;
    return;
  }

  relatorios.forEach((r) => {
    const hasPdf = !!(r.pdfUrl || r.pdf);

    const card = document.createElement("div");
    card.className = "dash-card";
    card.style.marginTop = "10px";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div style="font-weight:900">${r.cliente || "-"}</div>
          <div style="opacity:.85; font-size:.9rem">${r.pagamento || "-"}</div>
          <div style="opacity:.75; font-size:.85rem">${new Date(r.dataISO).toLocaleString("pt-BR")}</div>

          <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button"
              data-open-pdf="${r.id}"
              class="btn-secondary-pdf"
              style="width:auto; padding:10px 12px; border-radius:12px; ${hasPdf ? "" : "opacity:.5; pointer-events:none;"}">
              📄 Abrir PDF
            </button>
          </div>
        </div>

        <div style="font-weight:900; white-space:nowrap;">${formatBRL(r.total || 0)}</div>
      </div>
    `;

    ui.relatorioLista.appendChild(card);
  });

  // bind do botão abrir PDF
  ui.relatorioLista.querySelectorAll("[data-open-pdf]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-pdf");
      const reg = relatorios.find((x) => String(x.id) === String(id));
      abrirPdfDoRegistro(reg);
    });
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


// =========================== Importação CSV (Admin)  ===========================//


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


// =========================== Eventos gerais ===========================//


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
  const acoes = await getAcoes();
  if (pendingCheckoutAction === "pdf") {
    await acoes.gerarPDF(cart, dadosCliente);
  } else {
    await acoes.enviarWhatsApp(cart, dadosCliente);
  }
  closeModalOrcamento();
} catch (e) {
  console.error(e);
  alert("Erro ao carregar ações (PDF/WhatsApp). Veja o console (F12).");
}
});
ui.modalOrc?.addEventListener("click", (e) => { if (e.target === ui.modalOrc) closeModalOrcamento(); });
ui.abrirAdmin?.addEventListener("click", () => { if (isAdminAuthed()) openAdminPanel(); else openAdminLogin(); });
ui.modalAdminFechar?.addEventListener("click", closeAdminLogin);
ui.adminUser = el("admin-user");
ui.btnAdminEntrar?.addEventListener("click", () => {
  const user = (ui.adminUser?.value || "").trim();
  const pass = (ui.adminPass?.value || "").trim();

  // Defina aqui seu usuário e senha
  if (user === "lucas" && pass === "132205") { 
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    closePanel(ui.modalAdminLogin);
    openPanel(ui.painelAdmin); // Abre a tela cheia configurada no CSS
    atualizarDashboardAdmin(); // Garante que os números apareçam
  } else {
    if (ui.adminErr) ui.adminErr.style.display = "block";
  }
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

function parseMoneyBR(str) {
  // pega o ÚLTIMO número da linha (funciona com "R$65,00" e também "C/ARO165,00")
  const cleaned = String(str || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function normalizeSpaces(s) {
  return String(s || "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


//=============================== ROBO AUTOMATIZAÇÃO DE PREÇO ==========================//

const MAPA_MARCAS = {
    "MI": "Xiaomi",
    "REDMI": "Xiaomi",
    "POCO": "Pocophone",
    "POCOPHONE": "Pocophone",
    "MOTO": "Motorola",
    "EDGE": "Motorola",
    "IPHONE": "Apple",
    "IP": "Apple",
    "GALAXY": "Samsung",
    "SAMSUNG": "Samsung",
    "INFINIX": "Infinix",
    "REALME": "Realme",
    "HOT": "Infinix", 
    "SMART": "Infinix"
};

function parseLinhaTabela(line) {
  const raw = normalizeSpaces(line);

  const priceMatch = raw.match(/(?:R\$\s*)?(\d[\d.]*[,\.]\d{2,3})\s*$/i);
  if (!priceMatch) return { error: "Sem preço no final (ex: R$65,00)" };

  const precoBase = parseMoneyBR(priceMatch[1]);
  if (precoBase === null) return { error: "Preço inválido" };

  let left = normalizeSpaces(raw.slice(0, priceMatch.index));

  // remove C/ARO / COM ARO / SEM ARO do texto (mas NÃO usa isso no nome do serviço)
  left = left.replace(/(C\/\s*ARO|COM\s+ARO)/ig, " ");
  left = left.replace(/(S\/\s*ARO|SEM\s+ARO)/ig, " ");

  let categoria = "Tela Incell";
  const has = (re) => re.test(left);

  if (has(/\bOLED\b/i)) {
    categoria = "Tela OLED";
    left = left.replace(/\bOLED\b/ig, " ");
  } else if (has(/\bINCEL(L)?\b/i)) {
    categoria = "Tela Incell";
    left = left.replace(/\bINCEL(L)?\b/ig, " ");
  } else if (has(/\b(NACIONAL|VIVID|ORI|ORIGINAL)\b/i)) {
    // vivid/original -> nacional
    categoria = "Tela Nacional";
    left = left.replace(/\b(NACIONAL|VIVID|ORI|ORIGINAL)\b/ig, " ");
  }

  left = normalizeSpaces(left);

  let modelStr = left.replace(/\s+E\s+/gi, "/").replace(/\s+e\s+/g, "/");
  const parts = modelStr.split("/").map(p => normalizeSpaces(p)).filter(Boolean);

  const modelos = [];
  if (parts.length === 2 && /^(4g|5g)$/i.test(parts[1]) && parts[0].includes(" ")) {
    const base = parts[0].split(" ")[0];
    modelos.push(parts[0], `${base} ${parts[1].toUpperCase()}`);
  } else {
    modelos.push(...parts);
  }

  // ✅ SEM "C/ARO" no serviço
  const servico = categoria.trim();

  return { modelos, servico, precoBase };
}

function limparNomeServico(textoOriginal) {
    if (!textoOriginal) return "";

    // 1. Converte tudo para maiúsculo para facilitar a busca
    let nome = textoOriginal.toUpperCase();

    // 2. Lógica da Linha JK -> Vira INCELL
    // Se tiver "JK", a gente remove o "JK" e garante que tenha "INCELL"
    if (nome.includes("JK")) {
        nome = nome.replace(/JK/g, ""); // Remove o termo JK
        if (!nome.includes("INCELL")) {
            nome += " INCELL"; // Adiciona INCELL se já não tiver
        }
    }

    // 3. Correção do MAXX -> MAX
    nome = nome.replace(/MAXX/g, "MAX");

    // 4. Lista de termos para ELIMINAR (Sumiu, tchau!)
    const termosProibidos = [
        "TROCA CI", 
        "ARO", 
        "SEM MENSAGEM",
        "SEM MENSAGEM DE TELA", // Variação comum
        "COM ARO"               // Caso queira remover variações de aro também
    ];

    termosProibidos.forEach(termo => {
        // Substitui o termo por vazio
        nome = nome.split(termo).join("");
    });

    // 5. Faxina Final: Remove espaços duplos que ficaram buracos
    // Ex: "IPHONE  11   INCELL" vira "IPHONE 11 INCELL"
    nome = nome.replace(/\s+/g, " ").trim();

    return nome;
}

function limparNomeModelo(texto) {
    if (!texto) return "";
    let nome = texto.toUpperCase();

    // Remove termos técnicos que não devem aparecer no nome do modelo
    const remover = [
        "JK", "TROCA CI", "SEM MENSAGEM", "DIAMONDS", 
        "C/ARO", "S/ARO", "COM ARO", "SEM ARO"
    ];

    remover.forEach(termo => {
        nome = nome.split(termo).join("");
    });

    // Corrige o MAXX para MAX
    nome = nome.replace(/MAXX/g, "MAX");

    // Limpa espaços duplos
    return nome.replace(/\s+/g, " ").trim();
}

function detectarMarcaPeloModelo(modeloBruto) {
    if (!modeloBruto) return "Outros";
    const m = modeloBruto.toUpperCase().trim();

    // Primeiro: Tenta o dicionário de marcas
    for (const [chave, marcaDestino] of Object.entries(MAPA_MARCAS)) {
        if (m.includes(chave)) return marcaDestino;
    }

    // Segundo: Regras de Iniciais (Samsung A, S, M, J / LG K)
    if (/^[AMJS]\d{1,3}/.test(m)) return "Samsung";
    if (/^K\d{1,3}/.test(m) || m.startsWith("LG")) return "LG";

    // Terceiro: Se for uma linha de título com emoji (📱MARCA📱)
    if (m.includes("📱")) {
        const nomeLimpo = m.replace(/📱/g, "").trim();
        return nomeLimpo.charAt(0).toUpperCase() + nomeLimpo.slice(1).toLowerCase();
    }

    return "Outros"; 
}

function consolidarMaiorPreco(entries) {
  const map = new Map(); // key -> entry com maior precoFinal

  for (const e of entries) {
    const marca = String(e.marca || "").trim().toLowerCase();
    const modelo = String(e.modelo || "").trim().toLowerCase();
    const servico = String(e.servico || "").trim().toLowerCase();
    const key = `${marca}|||${modelo}|||${servico}`;

    const atual = map.get(key);
    if (!atual || Number(e.precoFinal || 0) > Number(atual.precoFinal || 0)) {
      map.set(key, e);
    }
  }

  return Array.from(map.values());
}

function arredondaPraCimaDe10(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n / 10) * 10;
}

function calcularFinal(precoBase, mao, frete, perc) {
  const base = Number(precoBase || 0) + Number(mao || 0) + Number(frete || 0);
  const mult = 1 + (Number(perc || 0) / 100);
  const bruto = base * mult;
  return arredondaPraCimaDe10(bruto);
}

function aplicarRegrasTabela(entries) {

  const keyCat = (e) => {
    const cat = String(e.servico || "").replace(/\s+C\/ARO$/i, "").trim();
    return `${String(e.marca).toLowerCase()}|||${String(e.modelo).toLowerCase()}|||${cat.toLowerCase()}`;
  };

  const hasAro = new Set();
  for (const e of entries) {
    if (/\sC\/ARO$/i.test(e.servico)) {
      hasAro.add(keyCat(e));
    }
  }

  const filtered = entries.filter((e) => {
    const catKey = keyCat(e);
    const isAro = /\sC\/ARO$/i.test(e.servico);
    if (!isAro && hasAro.has(catKey)) return false;
    return true;
  });

  return filtered;
}

function setTabelaStatus(msg, isError = false) {
  const el = document.getElementById("tabela-status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#dc2626" : "#111827";
}

function renderPreviewTabela(entries) {
  const box = document.getElementById("tabela-preview-box");
  if (!box) return;

  if (!entries.length) {
    box.innerHTML = `<div style="opacity:.8;">Sem itens para mostrar.</div>`;
    return;
  }

  box.innerHTML = entries.slice(0, 80).map(e => `
    <div style="display:grid; grid-template-columns: 1fr auto; gap:10px; padding:8px 0; border-bottom:1px solid rgba(0,0,0,.06);">
      <div>
        <div style="font-weight:900;">${e.marca} ${e.modelo}</div>
        <div style="opacity:.75; font-size:.9rem;">${e.servico}</div>
      </div>
      <div style="font-weight:950; color:#004aad; white-space:nowrap;">${formatBRL(e.precoFinal)}</div>
    </div>
  `).join("") + (entries.length > 80 ? `<div style="padding-top:8px; opacity:.7;">... +${entries.length - 80} itens</div>` : "");
}

function bindTabelaFerramenta() {
    // 1. CAPTURA - Buscamos os elementos no HTML
    const ta = document.getElementById("tabela-raw");
    const inMao = document.getElementById("tabela-mao");
    const inFrete = document.getElementById("tabela-frete");
    const inPerc = document.getElementById("tabela-perc");
    const btnPrev = document.getElementById("tabela-preview");
    const btnAplicar = document.getElementById("tabela-aplicar");
    const CONFIG_MARCAS = {
    "APPLE": { nome: "Apple", prefixo: "iPhone" },
    "SAMSUNG": { nome: "Samsung", prefixo: "" },
    "MOTOROLA": { nome: "Motorola", prefixo: "" },
    "LG": { nome: "LG", prefixo: "" },
    "INFINIX": { nome: "Infinix", prefixo: "" }
};

    // 2. SEGURANÇA - Se os botões não existirem, paramos aqui para evitar o erro de "not defined"
    if (!btnPrev || !btnAplicar || !ta) {
        console.warn("Atenção: Botões da ferramenta de importação não encontrados no HTML.");
        return;
    }

    let lastEntries = [];

    // 3. PROCESSAMENTO - A lógica que limpa os nomes e detecta marcas
function processar() {
    const mao = Number(inMao?.value || 0);
    const frete = Number(inFrete?.value || 0);
    const perc = Number(inPerc?.value || 0);

    const lines = String(ta.value || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const entries = [];
    const erros = [];

    // Variável para lembrar a marca do título atual (Ex: Apple)
    let marcaAtualDoBloco = "Outros"; 

    for (const line of lines) {
        // 1. Detectar Títulos de Marca (Ex: 📱 APPLE 📱 ou 📱 REALME 📱)
        if (line.includes("📱") || line.includes("---")) {
            const detectada = detectarMarcaPeloModelo(line);
            if (detectada !== "Outros") {
                marcaAtualDoBloco = detectada;
            }
            continue; 
        }

        const p = parseLinhaTabela(line);
        
        // Se a linha for apenas o nome da marca sem emoji, atualiza o bloco
        if (p.error) {
            const detectada = detectarMarcaPeloModelo(line);
            if (detectada !== "Outros") marcaAtualDoBloco = detectada;
            continue; 
        }

        // 2. Processar cada modelo encontrado na linha
        for (const modeloBruto of p.modelos) {
            // Inteligência de Marca: Prioriza a detecção automática
            let marcaFinal = detectarMarcaPeloModelo(modeloBruto);
            if (marcaFinal === "Outros") {
                marcaFinal = marcaAtualDoBloco;
            }

            // Limpeza e Padronização (JK, OLED, VIVID e Prefixo iPhone)
            let modeloLimpo = limparNomeModelo(modeloBruto); 
            
            // Adiciona "iPhone" automaticamente se for Apple e não tiver o nome
            if (marcaFinal === "Apple" && !modeloLimpo.includes("IPHONE")) {
                modeloLimpo = "IPHONE " + modeloLimpo;
            }

            const servicoLimpo = limparNomeServico(p.servico);
            const precoFinal = calcularFinal(p.precoBase, mao, frete, perc);
            
            entries.push({
                marca: marcaFinal,
                modelo: modeloLimpo, 
                servico: servicoLimpo,
                precoBase: p.precoBase,
                precoFinal: precoFinal
            });
        }
    }

    lastEntries = consolidarMaiorPreco(entries);
    setTabelaStatus(`Linhas: ${lines.length} | Válidos: ${lastEntries.length} | Erros: ${erros.length}`, erros.length > 0);
    renderPreviewTabela(lastEntries);

    if (erros.length > 0) console.warn("[TABELA] Erros:", erros);
}
    // 4. EVENTOS - Adicionamos os cliques usando as variáveis já conferidas
    btnPrev.onclick = () => {
        try { 
            processar(); 
        } catch (e) { 
            console.error("Erro no Preview:", e); 
            setTabelaStatus("Erro ao processar dados.", true);
        }
    };

    btnAplicar.onclick = async () => {
        try {
            processar();
            if (!lastEntries.length) return setTabelaStatus("Nada para aplicar.", true);

            setTabelaStatus("Aplicando no Firebase...");
            const r = await upsertTabelaPrecos(lastEntries, { 
                marcaPadrao: "Automático", 
                collectionName: CATALOGO_COLLECTION 
            });

            setTabelaStatus(`Aplicado ✅ Modelos: ${r.modelsUpdated} | Serviços: ${r.servicesUpdated}`);
            await window.__reloadCatalogo?.();
        } catch (e) {
            console.error("Erro ao Aplicar:", e);
            setTabelaStatus("Falha ao salvar. Verifique a cota do Firebase.", true);
        }
    };
}
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
    bindTabelaFerramenta();
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
      atualizarDashboardAdmin
    },
    (err) => console.error(err)
  );
})();