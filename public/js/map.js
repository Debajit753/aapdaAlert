// Community hazard map (PRD F9) with reports, relief camps and rescue units.
import { t } from "./i18n.js";
import { h, overlay, toast, timeAgo } from "./ui.js";
import { api, queue, isOnline } from "./net.js";
import { deviceId, uid } from "./state.js";
import { lastLocation, getPosition } from "./location.js";
import { CAMPS, DEMO_CENTRE } from "../data/camps.js";

export const REPORT_TYPES = [
  { id: "road_flooded", icon: "🌊" }, { id: "landslide", icon: "⛰️" }, { id: "road_blocked", icon: "🚧" },
  { id: "bridge_damaged", icon: "🌉" }, { id: "camp_open", icon: "⛺" },
];
const typeIcon = (id) => REPORT_TYPES.find((r) => r.id === id)?.icon || "⚠️";

const emojiIcon = (emoji, cls = "") => window.L.divIcon({ className: `emoji-pin ${cls}`, html: `<span>${emoji}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] });

export function renderMap(root) {
  const here = lastLocation() || DEMO_CENTRE;
  const mapEl = h("div", { id: "map", class: "map" });
  const hint = h("p", { class: "muted small map-hint" }, `👆 ${t("map_hint")}`);
  const reportBtn = h("button", { class: "btn primary fab", onclick: async () => { const l = (await getPosition()) || here; openReport(l); } }, `➕ ${t("report")}`);
  root.replaceChildren(h("div", { class: "map-wrap" }, h("h1", { class: "sr-only" }, t("map_title")), mapEl, hint, reportBtn));

  if (!window.L || !isOnline()) {
    mapEl.replaceWith(h("div", { class: "card" }, h("p", {}, `📡 ${t("map_offline")}`),
      h("h3", {}, t("camps")), h("ul", { class: "plain" }, CAMPS.map((c) => h("li", {}, `⛺ ${c.name}`)))));
    return;
  }

  const map = window.L.map(mapEl, { zoomControl: true }).setView([here.lat, here.lon], 13);
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  if (lastLocation()) window.L.circleMarker([here.lat, here.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#1d6fe0", fillOpacity: 1 }).addTo(map).bindPopup("📍");
  for (const c of CAMPS) {
    window.L.marker([c.lat, c.lon], { icon: emojiIcon("⛺", "camp") }).addTo(map)
      .bindPopup(`<b>${escapeHtml(c.name)}</b><br>${t("capacity", { n: c.capacity })}<br><i>${t("camps_demo")}</i>`);
  }

  const reportLayer = window.L.layerGroup().addTo(map);
  const unitLayer = window.L.layerGroup().addTo(map);
  async function load() {
    try {
      const r = await api(`reports?lat=${here.lat}&lon=${here.lon}&radius=40`);
      reportLayer.clearLayers();
      for (const x of r.reports) {
        const label = `<b>${typeIcon(x.type)} ${t(`rt_${x.type}`)}</b><br>${x.count > 1 ? t("confirmed", { n: x.count }) : t("one_report")}` +
          `${x.verified ? `<br>✅ ${t("ai_verified")}` : ""}${x.demo ? ` <i>(${t("demo")})</i>` : ""}<br>${timeAgo(x.latestAt, t)}` +
          (x.notes.length ? `<br>${x.notes.slice(-2).map(escapeHtml).join("<br>")}` : "");
        window.L.marker([x.lat, x.lon], { icon: emojiIcon(typeIcon(x.type), x.count > 1 ? "confirmed" : "") }).addTo(reportLayer).bindPopup(label);
      }
      const u = await api("units");
      unitLayer.clearLayers();
      for (const x of u.units) window.L.marker([x.lat, x.lon], { icon: emojiIcon(x.type === "boat" ? "🚤" : x.type === "ground" ? "🚑" : "🚁", "unit") }).addTo(unitLayer).bindPopup(escapeHtml(x.callSign));
    } catch { /* keep what is shown */ }
  }
  load();
  const timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); load(); }, 30000);
  map.on("click", (e) => openReport({ lat: e.latlng.lat, lon: e.latlng.lng }, load));
  setTimeout(() => map.invalidateSize(), 50);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/** Shrinks a photo to about 200 KB so it fits in Firestore on the free plan (PRD F10). */
async function compressPhoto(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  let q = 0.75, out = c.toDataURL("image/jpeg", q);
  while (out.length > 270000 && q > 0.3) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
  URL.revokeObjectURL(img.src);
  return out.length <= 390000 ? out : null;
}

function openReport(loc, onSent) {
  let type = null, photo = null;
  const chips = h("div", { class: "opts compact" }, REPORT_TYPES.map((r) => h("button", {
    class: "opt", "data-id": r.id,
    onclick: () => { type = r.id; chips.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", b.dataset.id === type)); },
  }, h("span", { class: "opt-icon" }, r.icon), h("span", {}, t(`rt_${r.id}`)))));
  const note = h("textarea", { rows: 2, placeholder: t("r_note"), maxlength: 300 });
  const preview = h("img", { class: "photo-preview", alt: "" });
  const file = h("input", { type: "file", accept: "image/*", capture: "environment", onchange: async () => {
    if (!file.files[0]) return;
    photo = await compressPhoto(file.files[0]).catch(() => null);
    if (photo) { preview.src = photo; preview.style.display = "block"; }
  } });
  const close = overlay(h("div", { class: "card" },
    h("h2", {}, t("report")),
    h("p", { class: "muted small" }, `📍 ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`),
    h("h3", {}, t("r_type")), chips,
    note,
    h("label", { class: "file-label" }, `📷 ${t("r_photo")}`, file), preview,
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: async () => {
        if (!type) return toast(t("r_type"));
        const id = uid();
        await queue(`report:${id}`, "reports", { id, deviceId: deviceId(), type, lat: loc.lat, lon: loc.lon, note: note.value, photo });
        toast(isOnline() ? t("r_sent") : t("r_queued"));
        close();
        setTimeout(() => onSent?.(), 1500);
      } }, t("r_send")),
      h("button", { class: "btn", onclick: () => close() }, t("cancel")))), { className: "sheet" });
}
