// Community hazard map (PRD F9) with reports, relief camps and rescue units.
import { t } from "./i18n.js";
import { h, overlay, toast, timeAgo, fill } from "./ui.js";
import { icon, iconHtml, label } from "./icons.js";
import { api, queue, isOnline } from "./net.js";
import { deviceId, uid } from "./state.js";
import { lastLocation, getPosition } from "./location.js";
import { CAMPS, DEMO_CENTRE } from "../data/camps.js";
import { addBaseMap } from "./basemap.js";
import { distanceKm } from "./tools.js";

export const REPORT_TYPES = [
  { id: "road_flooded", icon: "flood" }, { id: "landslide", icon: "landslide" }, { id: "road_blocked", icon: "remove_road" },
  { id: "bridge_damaged", icon: "destruction" }, { id: "camp_open", icon: "camping" },
];
const typeIcon = (id) => REPORT_TYPES.find((r) => r.id === id)?.icon || "warning";
const UNIT_ICON = { helicopter: "helicopter", boat: "directions_boat", ground: "ambulance" };

const pin = (name, cls = "") => window.L.divIcon({ className: `pin ${cls}`, html: iconHtml(name), iconSize: [36, 36], iconAnchor: [18, 18] });

export function renderMap(root) {
  const here = lastLocation() || DEMO_CENTRE;
  const mapEl = h("div", { id: "map", class: "map" });
  const listEl = h("div", {});
  let load = () => {};
  const legend = (cls, text) => h("span", { class: "legend-item" }, h("span", { class: `legend-dot ${cls}` }), text);
  const reportBtn = h("button", { class: "btn primary wide", onclick: async () => { const l = (await getPosition()) || here; openReport(l, () => load()); } }, label("add_location_alt", t("report")));

  if (!window.L || !isOnline()) {
    fill(root,
      h("h1", {}, t("map_title")),
      h("p", { class: "notice" }, icon("wifi_off"), h("span", {}, t("map_offline"))),
      reportBtn,
      h("h3", {}, t("camps")),
      h("div", { class: "list" }, CAMPS.map((c) => h("div", { class: "list-row" }, h("span", { class: "chip-ic green" }, icon("camping")), h("span", { class: "grow" }, c.name)))));
    return;
  }

  const locateBtn = h("button", { class: "map-btn", "aria-label": t("my_loc") }, icon("my_location"));
  fill(root,
    h("h1", {}, t("map_title")),
    h("div", { class: "legend" }, legend("hazard", t("hazards")), legend("camp", t("camps")), legend("unit", t("units"))),
    h("div", { class: "map-wrap" }, mapEl, locateBtn),
    reportBtn,
    h("p", { class: "muted small center", style: { marginTop: "10px" } }, t("map_hint")),
    h("h3", {}, t("nearby")),
    listEl);

  const map = window.L.map(mapEl, { zoomControl: false, attributionControl: true }).setView([here.lat, here.lon], 13);
  addBaseMap(map);
  const me = lastLocation() ? window.L.circleMarker([here.lat, here.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#0071e3", fillOpacity: 1 }).addTo(map) : null;
  locateBtn.addEventListener("click", async () => {
    const l = await getPosition();
    if (!l) return toast(t("loc_none"));
    me?.setLatLng([l.lat, l.lon]);
    map.setView([l.lat, l.lon], 15);
  });
  for (const c of CAMPS) {
    window.L.marker([c.lat, c.lon], { icon: pin("camping", "camp") }).addTo(map)
      .bindPopup(`<b>${escapeHtml(c.name)}</b><br>${t("capacity", { n: c.capacity })}<br><i>${t("camps_demo")}</i>`);
  }

  const reportLayer = window.L.layerGroup().addTo(map);
  const unitLayer = window.L.layerGroup().addTo(map);
  load = async () => {
    try {
      const r = await api(`reports?lat=${here.lat}&lon=${here.lon}&radius=40`);
      reportLayer.clearLayers();
      const rows = [];
      for (const x of r.reports) {
        const count = x.count > 1 ? t("confirmed", { n: x.count }) : t("one_report");
        const popup = `<b>${t(`rt_${x.type}`)}</b><br>${count}` +
          `${x.verified ? `<br>${iconHtml("verified")} ${t("ai_verified")}` : ""}${x.demo ? ` <i>(${t("demo")})</i>` : ""}<br>${timeAgo(x.latestAt, t)}` +
          (x.notes.length ? `<br>${x.notes.slice(-2).map(escapeHtml).join("<br>")}` : "");
        const marker = window.L.marker([x.lat, x.lon], { icon: pin(typeIcon(x.type), x.count > 1 ? "confirmed" : "") }).addTo(reportLayer).bindPopup(popup);
        rows.push({ x, count, marker, km: distanceKm(here, x) });
      }
      rows.sort((p, q) => p.km - q.km);
      fill(listEl, rows.length
        ? h("div", { class: "list" }, rows.map(({ x, count, marker, km }) => h("button", {
          class: "list-row as-btn",
          onclick: () => { map.setView([x.lat, x.lon], 15); marker.openPopup(); mapEl.scrollIntoView({ behavior: "smooth", block: "center" }); },
        },
          h("span", { class: `chip-ic ${x.count > 1 ? "red" : "orange"}` }, icon(typeIcon(x.type))),
          h("span", { class: "grow" }, t(`rt_${x.type}`), h("span", { class: "sub" }, `${count} · ${timeAgo(x.latestAt, t)}${x.demo ? ` · ${t("demo")}` : ""}`)),
          h("span", { class: "end" }, t("km_away", { km: km.toFixed(1) })))))
        : h("p", { class: "muted" }, t("none_nearby")));
      const u = await api("units");
      unitLayer.clearLayers();
      for (const x of u.units) window.L.marker([x.lat, x.lon], { icon: pin(UNIT_ICON[x.type] || "helicopter", "unit") }).addTo(unitLayer).bindPopup(escapeHtml(x.callSign));
    } catch { /* keep what is shown */ }
  };
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
  }, h("span", { class: "chip-ic" }, icon(r.icon)), h("span", {}, t(`rt_${r.id}`)))));
  const note = h("textarea", { rows: 2, placeholder: t("r_note"), "aria-label": t("r_note"), maxlength: 300, style: { marginTop: "16px" } });
  const preview = h("img", { class: "photo-preview", alt: "" });
  const file = h("input", { type: "file", accept: "image/*", capture: "environment", onchange: async () => {
    if (!file.files[0]) return;
    photo = await compressPhoto(file.files[0]).catch(() => null);
    if (photo) { preview.src = photo; preview.style.display = "block"; }
  } });
  const close = overlay(h("div", { class: "card" },
    h("h2", {}, t("report")),
    h("p", { class: "muted small" }, icon("location_on"), ` ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`),
    h("h3", { style: { marginTop: "20px" } }, t("r_type")), chips,
    note,
    h("label", { class: "file-label" }, icon("photo_camera"), t("r_photo"), file), preview,
    h("div", { class: "row" },
      h("button", { class: "btn", onclick: () => close() }, t("cancel")),
      h("button", { class: "btn primary", onclick: async () => {
        if (!type) return toast(t("r_type"));
        const id = uid();
        await queue(`report:${id}`, "reports", { id, deviceId: deviceId(), type, lat: loc.lat, lon: loc.lon, note: note.value, photo });
        toast(isOnline() ? t("r_sent") : t("r_queued"));
        close();
        setTimeout(() => onSent?.(), 1500);
      } }, t("r_send")))), { className: "sheet" });
}
