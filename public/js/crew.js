// Crew page (PRD F17): shares the rescue unit's GPS and lists the nearest SOS requests.
import { h, fill } from "./ui.js";
import { icon, label } from "./icons.js";

const root = document.querySelector("#crew");
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
let unitId = store.get("crew.unitId", null);
if (!unitId) { unitId = `unit-${crypto.randomUUID().slice(0, 8)}`; store.set("crew.unitId", unitId); }
const cfg = store.get("crew.cfg", { callSign: "HELI-1", type: "helicopter" });
let sharing = false, timer = null, last = null, nearby = [], sim = null, error = "";

function position() {
  return new Promise((resolve) => {
    if (sim) return resolve(sim.pos);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, heading: p.coords.heading, speedKmh: p.coords.speed != null ? p.coords.speed * 3.6 : null }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
  });
}

async function send() {
  const pos = await position();
  if (!pos) { error = "No GPS fix yet. Allow location for this page."; return draw(); }
  last = pos;
  try {
    const res = await fetch(`/api/units/${unitId}/position`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pos, callSign: cfg.callSign, type: cfg.type, demo: Boolean(sim) }),
    });
    const data = await res.json();
    nearby = data.nearby || [];
    error = "";
  } catch { error = "No network. Will retry."; }
  draw();
}

function start() {
  sharing = true;
  send();
  timer = setInterval(() => { if (sim) stepSim(); send(); }, sim ? 2000 : 10000);
  draw();
}
function stop() {
  sharing = false; clearInterval(timer); sim = null;
  fetch(`/api/units/${unitId}`, { method: "DELETE" }).catch(() => {});
  draw();
}

// Demo: fly toward the nearest active SOS without moving the phone
async function simulate() {
  const res = await fetch("/api/dashboard/sos").then((r) => r.json()).catch(() => null);
  const target = res?.sos?.find((s) => ["received", "dispatched"].includes(s.status) && s.lat != null);
  if (!target) { error = "No active SOS with a location to fly to."; return draw(); }
  const b = Math.random() * 2 * Math.PI;
  sim = { target, pos: { lat: target.lat + 0.1 * Math.cos(b), lon: target.lon + 0.1 * Math.sin(b), speedKmh: 180 } };
  if (sharing) { clearInterval(timer); sharing = false; }
  start();
}
function stepSim() {
  const { pos, target } = sim;
  const dLat = target.lat - pos.lat, dLon = target.lon - pos.lon;
  const d = Math.hypot(dLat, dLon);
  if (d < 0.002) return;
  const f = Math.min(1, 0.0036 / d); // about 0.4 km per step
  pos.lat += dLat * f; pos.lon += dLon * f;
}

function draw() {
  fill(root,
    h("section", { class: "ccard" },
      h("label", {}, "Call sign", h("input", { value: cfg.callSign, disabled: sharing, oninput: (e) => { cfg.callSign = e.target.value.slice(0, 30); store.set("crew.cfg", cfg); } })),
      h("label", {}, "Unit type", h("select", { disabled: sharing, onchange: (e) => { cfg.type = e.target.value; store.set("crew.cfg", cfg); } },
        [["helicopter", "Helicopter"], ["boat", "Boat"], ["ground", "Ground team"]].map(([v, t]) => h("option", { value: v, selected: cfg.type === v }, t)))),
      sharing
        ? h("button", { class: "btn stop", onclick: stop }, label("stop_circle", "Stop sharing"))
        : h("button", { class: "btn go", onclick: start }, label("share_location", "Start sharing my position")),
      !sharing ? h("button", { class: "btn", onclick: simulate }, label("movie", "Demo: simulate a flight to the nearest SOS")) : null,
      h("p", { class: "muted" }, sharing ? `Sharing${sim ? " (simulated flight)" : ""}. ${last ? `${last.lat.toFixed(4)}, ${last.lon.toFixed(4)}` : "Waiting for GPS…"}` : "Not sharing."),
      error ? h("p", { class: "err" }, error) : null),
    h("h2", {}, "Nearest SOS"),
    nearby.length
      ? h("div", { class: "cards" }, nearby.map((s) => h("div", { class: `rcard ${s.level || ""}` },
        h("b", {}, `${s.distanceKm} km · ${dir(s.bearing)} · score ${s.score}`),
        h("small", {}, `${s.hazard}${s.people ? ` · ${s.people} people` : ""} · ${s.status}`),
        s.level ? h("small", { class: "lvl" }, icon("campaign"), s.level === "signal_now" ? " They were told: signal now" : " They were told: get ready") : null,
        h("a", { class: "link", href: `https://maps.google.com/?q=${s.lat},${s.lon}`, target: "_blank", rel: "noopener" }, label("open_in_new", "Open in maps")))))
      : h("p", { class: "muted" }, sharing ? "No active SOS nearby." : "Start sharing to see SOS requests."));
}
const dir = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];

draw();
