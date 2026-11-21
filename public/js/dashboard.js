// Rescue control room (PRD F16): live SOS map, ranked queue, AI reason, chat history, alerts and units.
import { h, fill } from "./ui.js";
import { icon, iconHtml, label } from "./icons.js";
import { addBaseMap } from "./basemap.js";
import { apiUrl } from "./apiurl.js";
import { QUESTIONS } from "../data/questions.js";
import { CAMPS, DEMO_CENTRE } from "../data/camps.js";

const $ = (s) => document.querySelector(s);
const state = { sos: [], units: [], reports: [], alerts: [], gemini: false, selected: null, tab: "sos", pickCentre: false, centre: { ...DEMO_CENTRE } };
const chats = new Map();   // sosId -> messages
const reasons = new Map(); // sosId -> {reason, flag}
const HAZARD_ICON = { flood: "flood", landslide: "landslide", earthquake: "earthquake", other: "help", unknown: "siren" };
const UNIT_ICON = { helicopter: "helicopter", boat: "directions_boat", ground: "ambulance" };

async function api(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.status), { status: res.status });
  return data;
}

const ago = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};
const answerLabel = (qid, v) => {
  const q = QUESTIONS.find((x) => x.id === qid);
  const one = (id) => q?.options.find((o) => o.id === id)?.label.en || id;
  return Array.isArray(v) ? v.map(one).join(", ") : one(v);
};
const scoreClass = (s) => (s >= 50 ? "hi" : s >= 25 ? "mid" : "lo");
const ACTIVE = new Set(["received", "dispatched", "queued"]);

// ---------------- map ----------------
const map = L.map("dmap").setView([DEMO_CENTRE.lat, DEMO_CENTRE.lon], 12);
addBaseMap(map);
const sosLayer = L.layerGroup().addTo(map);
const unitLayer = L.layerGroup().addTo(map);
const reportLayer = L.layerGroup().addTo(map);
const alertLayer = L.layerGroup().addTo(map);
for (const c of CAMPS) L.marker([c.lat, c.lon], { icon: pin(iconHtml("camping"), "camp") }).addTo(map).bindTooltip(c.name);
let centreMarker = null;
map.on("click", (e) => {
  if (!state.pickCentre) return;
  state.centre = { lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) };
  state.pickCentre = false;
  document.body.classList.remove("picking");
  render();
});

function pin(emoji, cls = "") {
  return L.divIcon({ className: `dpin ${cls}`, html: `<span>${emoji}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
}

let fitted = false;
function drawMap() {
  sosLayer.clearLayers();
  for (const s of state.sos) {
    if (s.lat == null) continue;
    const active = ACTIVE.has(s.status);
    const m = L.marker([s.lat, s.lon], {
      icon: pin(active ? `<b>${s.score}</b>` : iconHtml("check"), `sos ${active ? scoreClass(s.score) : "done"} ${state.selected === s.id ? "sel" : ""}`),
      zIndexOffset: active ? 1000 + s.score : 0,
    }).addTo(sosLayer);
    m.on("click", () => select(s.id));
    if (s.accuracyM && state.selected === s.id) L.circle([s.lat, s.lon], { radius: s.accuracyM, color: "#c81e1e", weight: 1, fillOpacity: 0.08 }).addTo(sosLayer);
  }
  unitLayer.clearLayers();
  for (const u of state.units) {
    L.marker([u.lat, u.lon], { icon: pin(iconHtml(UNIT_ICON[u.type] || "helicopter"), "unit"), zIndexOffset: 2000 }).addTo(unitLayer).bindTooltip(`${u.callSign}${u.demo ? " (demo)" : ""}`);
    for (const km of [3, 10]) L.circle([u.lat, u.lon], { radius: km * 1000, color: "#1d6fe0", weight: 1, dashArray: "4 6", fill: false }).addTo(unitLayer);
  }
  reportLayer.clearLayers();
  for (const r of state.reports) {
    if (!r.visible) continue;
    L.marker([r.lat, r.lon], { icon: pin(iconHtml(reportIcon(r.type)), "report") }).addTo(reportLayer).bindTooltip(`${r.type.replace("_", " ")}${r.note ? ": " + r.note : ""}`);
  }
  alertLayer.clearLayers();
  for (const a of state.alerts.filter((x) => x.active)) {
    L.circle([a.centre.lat, a.centre.lon], { radius: a.radiusKm * 1000, color: a.severity === "severe" ? "#c81e1e" : "#a85d00", weight: 2, fillOpacity: 0.04 }).addTo(alertLayer);
  }
  if (centreMarker) centreMarker.remove();
  if (state.tab === "alerts") centreMarker = L.marker([state.centre.lat, state.centre.lon], { icon: pin(iconHtml("pin_drop"), "centre") }).addTo(map);
  if (!fitted && state.sos.some((s) => s.lat != null && ACTIVE.has(s.status))) {
    fitted = true;
    const pts = state.sos.filter((s) => s.lat != null && ACTIVE.has(s.status)).map((s) => [s.lat, s.lon]);
    map.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 14 });
  }
}
const reportIcon = (t) => ({ road_flooded: "flood", landslide: "landslide", road_blocked: "remove_road", bridge_damaged: "destruction", camp_open: "camping" }[t] || "warning");

// ---------------- data ----------------
async function loadSos() {
  try {
    const r = await api("dashboard/sos");
    state.sos = r.sos; state.units = r.units; state.gemini = r.gemini;
    $("#ai-status").textContent = r.gemini ? "Gemini AI on" : "Gemini AI off";
    $("#ai-status").className = `tag ${r.gemini ? "ok" : "warn"}`;
    $("#count-sos").textContent = r.sos.filter((s) => ACTIVE.has(s.status)).length;
    $("#count-units").textContent = r.units.length;
    if (state.selected) loadChat(state.selected);
    render();
  } catch { /* retry next tick */ }
}
async function loadPeople() {
  try { state.people = (await api("dashboard/community")).messages; } catch { /* ignore */ }
  if (state.tab === "people") render();
}

function peopleView() {
  const rows = state.people || [];
  return h("div", {},
    h("p", { class: "muted" }, "What people are telling each other in the nearby chat. Useful for spotting needs (water, boats, blocked roads) that never became an SOS. Messages reported 3 times are hidden from citizens."),
    rows.length ? h("div", { class: "cards" }, rows.map((m) => h("div", { class: `rcard ${m.hidden ? "hidden" : ""}` },
      h("b", {}, `${m.name} #${m.tag} · ${m.kind}`),
      h("small", {}, `${ago(m.at)} · near ${m.lat}, ${m.lon}${m.reports ? ` · reported ${m.reports}x` : ""}${m.hidden ? " · hidden" : ""}`),
      h("p", {}, m.text)))) : h("p", { class: "empty" }, "No messages yet."));
}

async function loadExtras() {
  try { state.reports = (await api("dashboard/reports")).reports; } catch { /* ignore */ }
  try { state.alerts = (await api("dashboard/alerts")).alerts; } catch { /* ignore */ }
  render();
}
async function loadChat(id) {
  try { chats.set(id, (await api(`dashboard/sos/${id}/chat`)).messages); } catch { /* ignore */ }
}

function select(id) {
  state.selected = id;
  state.tab = "sos";
  loadChat(id).then(render);
  const s = state.sos.find((x) => x.id === id);
  if (s?.lat != null) map.panTo([s.lat, s.lon]);
  // Ask Gemini for the one-line reason the first time, or when the answers changed
  if (s && state.gemini && (!s.aiReason || s.aiStale) && !reasons.has(id)) explain(id);
  render();
}

async function explain(id) {
  reasons.set(id, { loading: true });
  render();
  try { reasons.set(id, await api(`dashboard/sos/${id}/reason`, { method: "POST" })); }
  catch (e) { reasons.set(id, { error: e.status === 503 ? "Gemini is not configured" : "AI unavailable" }); }
  render();
}

async function setStatus(id, status) {
  await api(`dashboard/sos/${id}`, { method: "PATCH", body: { status } });
  loadSos();
}

// ---------------- rendering ----------------
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; render(); }));

function render() {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  const panel = $("#panel");
  if (state.tab === "sos") fill(panel, state.selected ? detail(state.sos.find((s) => s.id === state.selected)) : null, queue());
  if (state.tab === "reports") fill(panel, reportsView());
  if (state.tab === "alerts") fill(panel, alertsView());
  if (state.tab === "units") fill(panel, unitsView());
  if (state.tab === "people") fill(panel, peopleView());
  drawMap();
}

function queue() {
  if (!state.sos.length) return h("p", { class: "empty" }, "No SOS yet. Open the citizen app and tap SOS.");
  return h("div", { class: "queue" }, h("h3", {}, "Queue, most urgent first"), state.sos.map((s) => {
    const a = s.answers || {};
    const active = ACTIVE.has(s.status);
    return h("button", { class: `qrow ${state.selected === s.id ? "sel" : ""} ${active ? "" : "closed"}`, onclick: () => select(s.id) },
      h("span", { class: `score ${active ? scoreClass(s.score) : "done"}` }, active ? s.score : icon("check")),
      h("span", { class: "qmain" },
        h("b", {}, icon(HAZARD_ICON[s.hazard] || "siren"), ` ${s.profile?.name || "Unknown"}`),
        h("small", {}, [s.profile?.people ? `${s.profile.people} people` : null, a.injured === "bad" ? "badly hurt" : null, a.canMove === "stuck" ? "stuck" : null, a.waterLevel ? `water: ${a.waterLevel}` : null].filter(Boolean).join(" · ") || "no answers yet"),
        h("small", { class: "muted" }, `${ago(s.createdAt)} · ${s.source}${s.lat == null ? " · no location" : ""}`)),
      h("span", { class: `st ${s.status}` }, s.status));
  }));
}

function detail(s) {
  if (!s) return null;
  const a = s.answers || {};
  const p = s.profile || {};
  const r = reasons.get(s.id) || (s.aiReason ? { reason: s.aiReason, flag: s.aiFlag } : null);
  const msgs = chats.get(s.id) || [];
  return h("section", { class: "detail" },
    h("div", { class: "drow" },
      h("h2", {}, icon(HAZARD_ICON[s.hazard] || "siren"), ` ${p.name || "Unknown"} `, h("span", { class: `score big ${scoreClass(s.score)}` }, s.score)),
      h("button", { class: "x", onclick: () => { state.selected = null; render(); } }, icon("close"))),
    h("div", { class: "ai-box" },
      h("b", {}, "AI reason: "),
      r?.loading ? "thinking…" : r?.error ? h("span", { class: "muted" }, r.error) : r?.reason ? r.reason : h("span", { class: "muted" }, state.gemini ? "not yet" : "Gemini is off, using the score only"),
      r?.flag ? h("div", { class: "flag" }, icon("warning"), ` ${r.flag}`) : null,
      state.gemini ? h("button", { class: "link", onclick: () => explain(s.id) }, "refresh") : null),
    h("div", { class: "kv" },
      kv("Status", s.status), kv("Phone", p.phone ? h("a", { href: `tel:${p.phone}` }, p.phone) : "not given"),
      kv("Location", s.lat != null ? `${s.lat}, ${s.lon} (±${s.accuracyM ?? "?"} m, fix ${s.locatedAt ? ago(s.locatedAt) : "?"})` : "unknown"),
      kv("Battery", s.battery != null ? `${s.battery}%` : "not given"), kv("Waiting", ago(s.createdAt)), kv("Source", s.source),
      kv("Household", p.people ? `${p.people} people: ${p.elderly || 0} elderly, ${p.children || 0} children, ${p.pregnant || 0} pregnant, ${p.disabled || 0} disabled` : "not given"),
      p.medical ? kv("Medical", p.medical) : null),
    h("h3", {}, "Answers"),
    h("div", { class: "kv" }, Object.entries(a).length ? Object.entries(a).map(([k, v]) => kv(QUESTIONS.find((q) => q.id === k)?.text.en.replace("{n}", p.people || "") || k, answerLabel(k, v))) : h("p", { class: "muted" }, "No answers yet")),
    h("h3", {}, "Score breakdown"),
    h("ul", { class: "parts" }, (s.scoreParts || []).map((x) => h("li", {}, h("span", {}, x.factor), h("b", {}, `+${x.points}`)))),
    h("div", { class: "actions" },
      ["received", "dispatched", "rescued", "cancelled"].map((st) => h("button", { class: `btn ${s.status === st ? "on" : ""} ${st}`, onclick: () => setStatus(s.id, st) },
        { received: "Received", dispatched: "Team dispatched", rescued: "Rescued", cancelled: "Cancel" }[st]))),
    ACTIVE.has(s.status) && s.lat != null ? h("button", { class: "btn heli", onclick: () => demoHelicopter(s) }, label("helicopter", "Send demo helicopter here")) : null,
    h("h3", {}, `Chat with the companion (${msgs.length})`),
    h("div", { class: "chatlog" }, msgs.length ? msgs.slice(-30).map((m) => h("div", { class: `cm ${m.role}` }, h("small", {}, `${m.role === "user" ? "Person" : "Companion"}${m.mode === "danger" ? " · quick question" : ""} · ${ago(m.at)}`), h("p", {}, m.text))) : h("p", { class: "muted" }, "No messages")));
}
const kv = (k, v) => h("div", { class: "kvrow" }, h("span", {}, k), h("b", {}, v));

function reportsView() {
  if (!state.reports.length) return h("p", { class: "empty" }, "No hazard reports.");
  return h("div", { class: "cards" }, state.reports.map((r) => h("div", { class: `rcard ${r.visible ? "" : "hidden"}` },
    r.photo ? h("img", { src: r.photo, alt: "Report photo" }) : null,
    h("b", {}, icon(reportIcon(r.type)), ` ${r.type.replace("_", " ")}${r.demo ? " (demo)" : ""}`),
    h("small", {}, `${ago(r.createdAt)}${r.note ? " · " + r.note : ""}`),
    r.aiCheck ? h("div", { class: `verdict ${r.aiCheck.verdict}` }, `AI check: ${r.aiCheck.verdict.replace("_", " ")} (${Math.round(r.aiCheck.confidence * 100)}%): ${r.aiCheck.reason}`) : r.photo ? h("small", { class: "muted" }, "Not checked by AI") : null,
    h("button", { class: "btn", onclick: async () => { await api(`dashboard/reports/${r.id}`, { method: "PATCH", body: { visible: !r.visible } }); loadExtras(); } }, r.visible ? "Hide from citizens" : "Approve and show"))));
}

function alertsView() {
  const msg = h("textarea", { rows: 3, placeholder: "Message in English. Gemini translates it into Hindi, Assamese and Bengali." });
  const hazard = h("select", {}, ["flood", "landslide", "earthquake", "other"].map((x) => h("option", { value: x }, x)));
  const severity = h("select", {}, [["warning", "Warning"], ["severe", "Severe"], ["watch", "Watch"]].map(([v, t]) => h("option", { value: v }, t)));
  const radius = h("input", { type: "number", value: 20, min: 1, max: 200 });
  const issuer = h("select", {}, ["NDRF", "SDRF", "ASDMA", "District administration", "IMD", "Control room"].map((x) => h("option", { value: x }, x)));
  const status = h("span", { class: "muted" });
  return h("div", {},
    h("h3", {}, "Create an alert"),
    h("div", { class: "form" },
      h("label", {}, "Issued by (demo label)", issuer), h("label", {}, "Hazard", hazard), h("label", {}, "Severity", severity), h("label", {}, "Radius (km)", radius),
      h("label", {}, "Centre", h("span", {}, `${state.centre.lat}, ${state.centre.lon} `), h("button", { class: "link", onclick: () => { state.pickCentre = true; document.body.classList.add("picking"); } }, "pick on map")),
      msg,
      h("button", { class: "btn primary", onclick: async () => {
        if (!msg.value.trim()) return;
        status.textContent = "Sending and translating…";
        try {
          await api("dashboard/alerts", { method: "POST", body: { issuer: issuer.value, hazard: hazard.value, severity: severity.value, radiusKm: Number(radius.value), message: msg.value, ...state.centre } });
          status.textContent = "Alert sent."; msg.value = ""; loadExtras();
        } catch { status.textContent = "Could not send."; }
      } }, "Send alert"), status),
    h("h3", {}, "Alerts"),
    h("div", { class: "cards" }, state.alerts.map((a) => h("div", { class: `rcard ${a.active ? "" : "hidden"}` },
      h("b", {}, icon("warning"), ` ${a.issuer || "Control room"} · ${a.severity} · ${a.hazard}${a.demo ? " (demo)" : ""} · ${a.radiusKm} km`),
      h("small", {}, `${ago(a.createdAt)}${a.translated ? " · translated by AI" : ""}`),
      h("p", {}, a.message.en), a.translated ? h("details", {}, h("summary", {}, "Translations"), h("p", {}, a.message.hi), h("p", {}, a.message.as), h("p", {}, a.message.bn)) : null,
      a.active ? h("button", { class: "btn", onclick: async () => { await api(`dashboard/alerts/${a.id}`, { method: "PATCH", body: { active: false } }); loadExtras(); } }, "End alert") : h("small", { class: "muted" }, "ended")))));
}

function unitsView() {
  return h("div", {},
    h("p", { class: "muted" }, "Crews share their position from the crew page. Alerts go to people with an active SOS at 10 km (get ready) and 3 km (signal now)."),
    state.units.length ? h("div", { class: "cards" }, state.units.map((u) => h("div", { class: "rcard" },
      h("b", {}, icon(UNIT_ICON[u.type] || "helicopter"), ` ${u.callSign}${u.demo ? " (demo)" : ""}`),
      h("small", {}, `${u.lat.toFixed(4)}, ${u.lon.toFixed(4)} · updated ${ago(u.updatedAt)}`),
      sims.has(u.id) ? h("button", { class: "btn", onclick: () => stopSim(u.id) }, "Stop demo flight") : null))) : h("p", { class: "empty" }, "No active units."),
    h("a", { class: "btn", href: "/crew", target: "_blank", rel: "noopener" }, label("open_in_new", "Open crew page")));
}

// ---------------- demo helicopter (simulated flight toward an SOS) ----------------
const sims = new Map();
function demoHelicopter(s) {
  const id = `demo-heli-${Math.random().toString(36).slice(2, 8)}`;
  // Start 12 km away and fly in fast (sped up so the demo takes about a minute)
  const startKm = 12, brg = Math.random() * 360;
  const pos = offset({ lat: s.lat, lon: s.lon }, startKm, brg);
  const stepKm = 0.4;
  const tick = async () => {
    const d = dist(pos, s);
    if (d > 0.25) {
      const f = Math.min(1, stepKm / d);
      pos.lat += (s.lat - pos.lat) * f; pos.lon += (s.lon - pos.lon) * f;
    }
    try { await api(`units/${id}/position`, { method: "POST", body: { ...pos, callSign: "HELI-DEMO", type: "helicopter", speedKmh: 180, demo: true } }); } catch { /* ignore */ }
    loadSos();
  };
  tick();
  sims.set(id, setInterval(tick, 2000));
  state.tab = "units";
  render();
}
function stopSim(id) {
  clearInterval(sims.get(id)); sims.delete(id);
  api(`units/${id}`, { method: "DELETE" }).then(loadSos);
}
function dist(a, b) {
  const R = 6371, r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function offset(p, km, brgDeg) {
  const R = 6371, b = (brgDeg * Math.PI) / 180, la = (p.lat * Math.PI) / 180, lo = (p.lon * Math.PI) / 180, d = km / R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI };
}

loadSos();
loadExtras();
setInterval(loadSos, 3000);
setInterval(loadExtras, 10000);
loadPeople();
setInterval(loadPeople, 8000);
