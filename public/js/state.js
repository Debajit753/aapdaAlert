// What the app keeps on the phone: device ID, details, settings, chat log and the outbox.

const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export { ls };

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export function deviceId() {
  let id = ls.get("aa.deviceId");
  if (!id) { id = uid(); ls.set("aa.deviceId", id); }
  return id;
}

// ---------- settings ----------
export const settings = {
  get lang() { return ls.get("aa.lang", null); },
  set lang(v) { ls.set("aa.lang", v); },
  get introDone() { return ls.get("aa.introDone", false); },
  set introDone(v) { ls.set("aa.introDone", v); },
};

// ---------- household details (PRD F4) ----------
export const EMPTY_PROFILE = { name: "", phone: "", people: 0, elderly: 0, children: 0, pregnant: 0, disabled: 0, medical: "", contacts: [] };
export function getProfile() { return { ...EMPTY_PROFILE, ...(ls.get("aa.profile") || {}) }; }
export function setProfile(p) { ls.set("aa.profile", p); }
export function hasProfile() { return getProfile().people > 0; }
/** Counts only. Name and phone never go to the AI. */
export function profileCounts() {
  const p = getProfile();
  return { people: p.people, elderly: p.elderly, children: p.children, pregnant: p.pregnant, disabled: p.disabled, medical: p.medical };
}

// ---------- chat log on the phone ----------
export function getChat() { return ls.get("aa.chat", []); }
export function setChat(list) { ls.set("aa.chat", list.slice(-200)); }
export function addChat(msg) {
  const list = getChat();
  list.push(msg);
  setChat(list);
  return msg;
}

// ---------- outbox in IndexedDB (PRD F3) ----------
// Internal storage name from before the rename to aapdaAlert. Kept on purpose: changing it would strand
// any SOS still waiting in a phone's outbox. Nobody sees this name.
const DB_NAME = "apadaAlert";
const STORE = "outbox";
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("No IndexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
    });
  } catch {
    // Fallback when IndexedDB is blocked (private mode on some phones)
    const box = ls.get("aa.outbox", {});
    return fn({
      put: (item) => { box[item.key] = item; ls.set("aa.outbox", box); },
      delete: (key) => { delete box[key]; ls.set("aa.outbox", box); },
      getAll: () => ({ result: Object.values(box) }),
    })?.result;
  }
}

export const outbox = {
  put: (item) => tx("readwrite", (s) => s.put(item)),
  delete: (key) => tx("readwrite", (s) => s.delete(key)),
  all: () => tx("readonly", (s) => s.getAll()),
};
