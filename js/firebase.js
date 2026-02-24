// js/firebase.js

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  onSnapshot,
  writeBatch,
  doc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyAxU22mYf7ctyPviMKO8M3_-QfM2S-4-2k",
  authDomain: "orcamentointech-f69f9.firebaseapp.com",
  projectId: "orcamentointech-f69f9",
  storageBucket: "orcamentointech-f69f9.firebasestorage.app",
  messagingSenderId: "508244564743",
  appId: "1:508244564743:web:1b315bc5e5299bcaad43a2"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);

/* ============================ CONFIG CATÁLOGO ============================ */

export const CATALOGO_COLLECTION = "modelos";
const SHOW_ZERO_PRICES = false;
/* ============================ ORÇAMENTOS (/orcamentos) ============================ */

export function listenOrcamentos(cb, onErr) {
  const ref = collection(db, "orcamentos");
  return onSnapshot(
    ref,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("Erro ao ler /orcamentos:", err);
      onErr?.(err);
    }
  );
}

/* ============================ CATÁLOGO (LER)  ============================ */


function toNumber(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function slug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]/g, "");
}

// ================================= GET CATÁLOGO  ================================= //

export async function getCatalogoOnce() {
  const modelosRef = collection(db, CATALOGO_COLLECTION);
  const modelosSnap = await getDocs(modelosRef);

  console.log(`[CATALOGO] coleção "${CATALOGO_COLLECTION}" docs:`, modelosSnap.size);

  if (modelosSnap.empty) {
    console.warn(`[CATALOGO] Coleção "${CATALOGO_COLLECTION}" vazia ou não existe.`);
    return [];
  }

  const items = [];

  modelosSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const marca = data.marca || "";
    const modelo = data.modelo || "";
    const servicosMap = data.servicos || {};

    if (!servicosMap || typeof servicosMap !== "object" || Array.isArray(servicosMap)) return;

    // ✅ condensa por nome normalizado (sem C/ARO) e pega MAIOR preço
    const bestByServico = new Map(); // nomeLower -> { nome, preco }

    for (const [nomeRaw, precoRaw] of Object.entries(servicosMap)) {
      let nome = String(nomeRaw || "").trim();

      // remove sufixo C/ARO na exibição
      nome = nome.replace(/\sC\/ARO\s*$/i, "").trim();

      const preco = toNumber(precoRaw);
      if (!SHOW_ZERO_PRICES && preco <= 0) continue;

      const key = nome.toLowerCase();
      const prev = bestByServico.get(key);
      if (!prev || preco > prev.preco) {
        bestByServico.set(key, { nome, preco });
      }
    }

    for (const { nome, preco } of bestByServico.values()) {
      items.push({
        id: `${docSnap.id}_${slug(nome)}`,
        nome,
        preco,
        marca: String(marca),
        modelo: String(modelo),
        descricao: "",
        categoria: "",
        ordem: 0
      });
    }
  });

  return items;
}

// ============================ IMPORTAR CSV ============================ //

export async function importCatalogoFromCsvRows(rows, opts = {}) {
  const {
    collectionName = CATALOGO_COLLECTION,
    includeZero = true,
    merge = true
  } = opts;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { written: 0, skipped: 0 };
  }

  const sample = rows.find((r) => r && typeof r === "object") || {};
  const headers = Object.keys(sample);

  const findKey = (candidates) => {
    const lowerMap = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
    for (const c of candidates) {
      const k = lowerMap.get(c);
      if (k) return k;
    }
    return null;
  };

  const marcaKey = findKey(["marca", "brand"]);
  const modeloKey = findKey(["modelo", "model", "aparelho", "device"]);

  if (!marcaKey || !modeloKey) {
    throw new Error(`CSV precisa ter colunas "marca" e "modelo". Colunas: ${headers.join(", ")}`);
  }

  const serviceCols = headers.filter((h) => h !== marcaKey && h !== modeloKey);

  let batch = writeBatch(db);
  let opCount = 0;
  let written = 0;
  let skipped = 0;

  for (const r of rows) {
    const marca = String(r[marcaKey] || "").trim();
    const modelo = String(r[modeloKey] || "").trim();

    if (!marca || !modelo) {
      skipped++;
      continue;
    }

    const servicos = {};
    for (const col of serviceCols) {
      const preco = toNumber(r[col]);
      if (!includeZero && preco <= 0) continue;
      if (col && String(col).trim()) servicos[String(col).trim()] = preco;
    }

    const docId = slug(`${marca}__${modelo}`);
    const ref = doc(db, collectionName, docId);

    batch.set(ref, { marca, modelo, servicos }, { merge });
    opCount++;
    written++;

    if (opCount >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();

  return { written, skipped };
}

// ============================= Robo para automatizar preços =================================== //

export async function upsertTabelaPrecos(entries, opts = {}) {
  const { marcaPadrao = "Samsung", collectionName = "modelos" } = opts;

  if (!Array.isArray(entries) || entries.length === 0) {
    return { modelsUpdated: 0, servicesUpdated: 0 };
  }

  // Carrega tudo existente para comparar e NÃO baixar preço
  const snap = await getDocs(collection(db, collectionName));

  // key (marca|||modelo) -> { id, servicos }
  const existingByKey = new Map();

  snap.forEach((d) => {
    const data = d.data() || {};
    const marca = String(data.marca || "").trim();
    const modelo = String(data.modelo || "").trim();
    if (!marca || !modelo) return;

    existingByKey.set(`${marca.toLowerCase()}|||${modelo.toLowerCase()}`, {
      id: d.id,
      servicos: (data.servicos && typeof data.servicos === "object" && !Array.isArray(data.servicos))
        ? data.servicos
        : {}
    });
  });

  const slugLocal = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");

  // ---------- REGRA "SEM ARO" ----------
  // base = remove " C/ARO" do final
  const baseServico = (nome) => String(nome || "").replace(/\sC\/ARO\s*$/i, "").trim();

  // 1) Descobre "bases" que já têm C/ARO no Firebase (por modelo)
  const aroExistente = new Set(); // key: marca|||modelo|||base
  for (const [key, ex] of existingByKey.entries()) {
    const servs = ex.servicos || {};
    for (const nome of Object.keys(servs)) {
      if (/\sC\/ARO\s*$/i.test(nome)) {
        const base = baseServico(nome).toLowerCase();
        if (base) aroExistente.add(`${key}|||${base}`);
      }
    }
  }

  // 2) Descobre "bases" que terão C/ARO no lote atual
  const aroNoLote = new Set();
  for (const e of entries) {
    const marca = String(e.marca || marcaPadrao).trim();
    const modelo = String(e.modelo || "").trim();
const servico = String(e.servico || "").trim().replace(/\sC\/ARO\s*$/i, "").trim();
    if (!marca || !modelo || !servico) continue;

    if (/\sC\/ARO\s*$/i.test(servico)) {
      const key = `${marca.toLowerCase()}|||${modelo.toLowerCase()}`;
      const base = baseServico(servico).toLowerCase();
      if (base) aroNoLote.add(`${key}|||${base}`);
    }
  }

  // ---------- Monta atualizações (somente aumentos) ----------
  const updates = new Map(); // docId -> { marca, modelo, servicos: {nome:preco} }
  let servicesUpdated = 0;

  for (const e of entries) {
    const marca = String(e.marca || marcaPadrao).trim();
    const modelo = String(e.modelo || "").trim();
    const servico = String(e.servico || "").trim();
    const novo = Number(e.precoFinal);

    if (!marca || !modelo || !servico) continue;
    if (!Number.isFinite(novo) || novo <= 0) continue;

    const key = `${marca.toLowerCase()}|||${modelo.toLowerCase()}`;
    const ex = existingByKey.get(key);
    const docId = ex?.id || slugLocal(`${marca}__${modelo}`);

    // REGRA "SEM ARO": se não é C/ARO e existe C/ARO dessa base (existente ou no lote), ignora
    const isAro = /\sC\/ARO\s*$/i.test(servico);
    const base = baseServico(servico).toLowerCase();
    const aroKey = `${key}|||${base}`;
    if (!isAro && base && (aroExistente.has(aroKey) || aroNoLote.has(aroKey))) {
      continue;
    }

    const atual = Number(ex?.servicos?.[servico] || 0);

    // REGRA: nunca diminui
    if (atual >= novo) continue;

    if (!updates.has(docId)) updates.set(docId, { marca, modelo, servicos: {} });
    updates.get(docId).servicos[servico] = novo;
    servicesUpdated++;
  }

  if (updates.size === 0) {
    return { modelsUpdated: 0, servicesUpdated: 0 };
  }

  // Commit em batch
  let batch = writeBatch(db);
  let ops = 0;

  for (const [docId, payload] of updates.entries()) {
    const ref = doc(db, collectionName, docId);
    batch.set(ref, payload, { merge: true });
    ops++;

    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  return { modelsUpdated: updates.size, servicesUpdated };
}