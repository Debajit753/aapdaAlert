// Talking to the server, and the outbox that keeps retrying until the network is back.
import { outbox } from "./state.js";
import { apiUrl } from "./apiurl.js";

let netOk = navigator.onLine;
let sending = false;
let retryTimer = null;
let retryDelay = 3000;

// The feature tour can pretend the network is down, to show that nothing is lost.
let simOffline = false;
export const isSimOffline = () => simOffline;
export function simulateOffline(on) {
  simOffline = Boolean(on);
  setStatus();
  if (!simOffline) { retryDelay = 3000; flush(); }
}

export const isOnline = () => !simOffline && navigator.onLine && netOk;

function setStatus() {
  window.dispatchEvent(new CustomEvent("net-status", { detail: { online: isOnline(), sending } }));
}

/** fetch with a timeout. Throws {status} on HTTP errors and {offline:true} on network errors. */
export async function api(path, { method = "GET", body, timeout = 10000 } = {}) {
  if (simOffline) throw Object.assign(new Error("Network error"), { offline: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!netOk) { netOk = true; setStatus(); flush(); }
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
    return data;
  } catch (e) {
    if (e.status) throw e;
    if (e.name === "AbortError") throw Object.assign(new Error("Timed out"), { timeout: true });
    if (netOk) { netOk = false; setStatus(); }
    throw Object.assign(new Error("Network error"), { offline: true });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Saves a request in the outbox and tries to send it.
 * Using the same key again replaces the waiting copy, so only the newest version is sent (no duplicates).
 */
export async function queue(key, path, body, method = "POST") {
  await outbox.put({ key, path, body, method, at: Date.now() });
  return flush();
}

export async function flush() {
  if (sending) return;
  clearTimeout(retryTimer);
  const items = ((await outbox.all()) || []).sort((a, b) => a.at - b.at);
  if (!items.length) return;
  sending = true; setStatus();
  let failed = false;
  for (const item of items) {
    try {
      const res = await api(item.path, { method: item.method, body: item.body });
      // Only delete if nothing newer was queued under the same key meanwhile
      const latest = ((await outbox.all()) || []).find((x) => x.key === item.key);
      if (latest && latest.at === item.at) await outbox.delete(item.key);
      window.dispatchEvent(new CustomEvent("outbox-sent", { detail: { key: item.key, res } }));
    } catch (e) {
      if (e.offline || e.timeout || e.status >= 500 || e.status === 429) { failed = true; break; }
      await outbox.delete(item.key); // bad request: drop it so it doesn't block the rest
    }
  }
  sending = false; setStatus();
  if (failed) {
    retryTimer = setTimeout(flush, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  } else {
    retryDelay = 3000;
  }
}

window.addEventListener("online", () => { netOk = true; setStatus(); flush(); });
window.addEventListener("offline", () => { netOk = false; setStatus(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) flush(); });
