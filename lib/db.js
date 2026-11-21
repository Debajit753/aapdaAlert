// Storage layer. Uses Firebase Firestore when FIREBASE_SERVICE_ACCOUNT is set,
// otherwise a simple in-memory store (saved to data/dev-db.json during local development).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let firestore = null;
let mode = "memory";

async function initFirestore() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const account = JSON.parse(raw);
    if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, "\n");
    const app = getApps()[0] || initializeApp({ credential: cert(account) });
    const db = getFirestore(app);
    try { db.settings({ ignoreUndefinedProperties: true }); } catch { /* already set */ }
    mode = "firestore";
    return db;
  } catch (err) {
    console.error("[db] Firestore setup failed, using memory store:", err.message);
    return null;
  }
}

const ready = initFirestore().then((db) => { firestore = db; });

// ---------- memory store ----------
const DEV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "dev-db.json");
// Saved to a file only during local development: not on Vercel (read-only disk) and not in tests (clean every run)
const canPersist = !process.env.VERCEL && process.env.NODE_ENV !== "test";
let mem = {};
if (canPersist) {
  try { mem = JSON.parse(fs.readFileSync(DEV_FILE, "utf8")); } catch { mem = {}; }
}
let saveTimer = null;
function persist() {
  if (!canPersist) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DEV_FILE), { recursive: true });
      fs.writeFileSync(DEV_FILE, JSON.stringify(mem));
    } catch (err) { console.error("[db] could not save dev store:", err.message); }
  }, 200);
}
const col = (name) => (mem[name] ||= {});
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function stripUndefined(obj) { return JSON.parse(JSON.stringify(obj)); }

// ---------- public API ----------
export async function storeMode() { await ready; return mode; }

export async function get(collection, id) {
  await ready;
  if (firestore) {
    const snap = await firestore.collection(collection).doc(id).get();
    return snap.exists ? snap.data() : null;
  }
  return clone(col(collection)[id]) || null;
}

/** Writes a document. With merge, nested objects are merged one level deep. */
export async function put(collection, id, data, { merge = false } = {}) {
  await ready;
  const clean = stripUndefined(data);
  if (firestore) {
    await firestore.collection(collection).doc(id).set(clean, { merge });
    return;
  }
  const c = col(collection);
  c[id] = merge && c[id] ? { ...c[id], ...clean } : clean;
  persist();
}

export async function remove(collection, id) {
  await ready;
  if (firestore) { await firestore.collection(collection).doc(id).delete(); return; }
  delete col(collection)[id];
  persist();
}

/** Lists documents, optionally where field == value. Demo scale, so no paging. */
export async function list(collection, where = null) {
  await ready;
  if (firestore) {
    let q = firestore.collection(collection);
    if (where) q = q.where(where[0], "==", where[1]);
    const snap = await q.get();
    return snap.docs.map((d) => d.data());
  }
  let rows = Object.values(col(collection));
  if (where) rows = rows.filter((r) => r[where[0]] === where[1]);
  return clone(rows);
}
