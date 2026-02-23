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

/* ============================
   CONFIG CATÁLOGO
   IMPORTANTE: troque se sua coleção não for "modelos"
   Exemplos: "Modelos", "catalogo", "aparelhos"
   ============================ */
export const CATALOGO_COLLECTION = "modelos";

/* ============================
   ORÇAMENTOS (/orcamentos)
   ============================ */
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

/* ============================
   CATÁLOGO (LER) — docs com:
   marca (string)
   modelo (string)
   servicos (map): { "Nome": numero, ... }
   ============================ */
const SHOW_ZERO_PRICES = false;

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

export async function getCatalogoOnce() {
  const modelosRef = collection(db, CATALOGO_COLLECTION);
  const modelosSnap = await getDocs(modelosRef);

  console.log(`[CATALOGO] lendo coleção: "${CATALOGO_COLLECTION}" | docs:`, modelosSnap.size);

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

    // servicos é MAP/OBJETO
    if (servicosMap && typeof servicosMap === "object" && !Array.isArray(servicosMap)) {
      for (const [nomeServico, precoRaw] of Object.entries(servicosMap)) {
        const preco = toNumber(precoRaw);
        if (!SHOW_ZERO_PRICES && preco <= 0) continue;

        items.push({
          id: `${docSnap.id}_${slug(nomeServico)}`,
          nome: String(nomeServico),
          preco,
          marca: String(marca),
          modelo: String(modelo),
          descricao: "",
          categoria: "",
          ordem: 0
        });
      }
    }
  });

  return items;
}

/* ============================
   IMPORTAR CSV -> coleção de catálogo
   CSV esperado:
   marca, modelo, (colunas de serviços...)
   ============================ */
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