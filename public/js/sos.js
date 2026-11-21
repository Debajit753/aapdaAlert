// SOS: send first, ask after (PRD F3), status updates and the helicopter alert (PRD F17).
import { ls, uid, deviceId, getProfile } from "./state.js";
import { queue, api, isOnline } from "./net.js";
import { getPosition, lastLocation, batteryLevel } from "./location.js";
import { t, getLang, heliPhraseIn } from "./i18n.js";
import { h, overlay, vibrate } from "./ui.js";
import { icon, label } from "./icons.js";
import { strobe, whistle } from "./tools.js";
import { speak } from "./voice.js";

export const activeSos = () => ls.get("aa.sos", null);
export const isActive = (s = activeSos()) => Boolean(s && s.status !== "rescued" && s.status !== "cancelled");

function save(s) {
  ls.set("aa.sos", s);
  window.dispatchEvent(new CustomEvent("sos-change", { detail: s }));
}

function payload(s, extra = {}) {
  return {
    id: s.id, deviceId: s.deviceId, createdAt: s.createdAt, source: s.source,
    lat: s.lat, lon: s.lon, accuracyM: s.accuracyM, locatedAt: s.locatedAt, battery: s.battery,
    hazard: s.hazard, answers: s.answers, note: s.note, language: s.language, profile: s.profile, ...extra,
  };
}

async function send(s, extra) {
  await queue(`sos:${s.id}`, "sos", payload(s, extra));
}

window.addEventListener("outbox-sent", (e) => {
  const s = activeSos();
  if (!s || e.detail.key !== `sos:${s.id}`) return;
  save({ ...s, delivered: true, status: e.detail.res?.status || s.status });
  watch();
});

/** Sends an SOS at once with location and details. Questions only add detail afterwards. */
export async function startSos({ source = "app", answers = {}, hazard } = {}) {
  const existing = activeSos();
  if (isActive(existing)) return updateSos({ answers, hazard });
  const loc = lastLocation() || {};
  const s = {
    id: uid(), deviceId: deviceId(), createdAt: new Date().toISOString(), source,
    answers: { inDanger: "now", ...answers }, hazard: hazard || "unknown", note: "",
    language: getLang(), profile: getProfile(),
    lat: loc.lat ?? null, lon: loc.lon ?? null, accuracyM: loc.accuracyM ?? null, locatedAt: loc.locatedAt ?? null,
    battery: await batteryLevel(), status: "received", delivered: false,
  };
  ls.set("aa.heliShown", []);
  save(s);
  await send(s);
  // Get a fresh GPS fix and add it to the same SOS
  getPosition({ maxAge: 0 }).then((l) => { if (l && l.locatedAt !== s.locatedAt) updateSos(l); });
  watch();
  return activeSos();
}

export async function updateSos(partial = {}) {
  const s = activeSos();
  if (!s) return null;
  const { answers, ...rest } = partial;
  const next = { ...s, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), answers: { ...s.answers, ...(answers || {}) } };
  if (partial.hazard === undefined) next.hazard = s.hazard;
  save(next);
  await send(next);
  return next;
}

export async function cancelSos() {
  const s = activeSos();
  if (!s) return;
  save({ ...s, status: "cancelled" });
  await send(s, { cancel: true });
  stopWatch();
}

export function clearFinishedSos() {
  const s = activeSos();
  if (s && !isActive(s)) ls.del("aa.sos");
  window.dispatchEvent(new CustomEvent("sos-change", { detail: null }));
}

/** Text for the status line on the home screen. */
export function statusText(s = activeSos()) {
  if (!s) return "";
  if (s.status === "cancelled") return t("st_cancelled");
  if (!s.delivered) return t("st_saved");
  return t({ received: "st_received", dispatched: "st_dispatched", rescued: "st_rescued" }[s.status] || "st_sent");
}

/** Prefilled SMS for when data doesn't work but there is signal (PRD F14). */
export function smsLink(s = activeSos()) {
  const p = getProfile();
  const loc = s?.lat != null ? s : lastLocation() || {};
  const a = s?.answers || {};
  const where = loc.lat != null ? `${loc.lat},${loc.lon} https://maps.google.com/?q=${loc.lat},${loc.lon}` : "location unknown";
  const body = `SOS aapdaAlert. ${p.name || ""} needs rescue. ${s?.hazard && s.hazard !== "unknown" ? s.hazard + ". " : ""}` +
    `${p.people ? p.people + " people. " : ""}${a.injured === "bad" ? "Badly injured. " : ""}${a.canMove === "stuck" ? "Stuck. " : ""}Location: ${where}`;
  const to = (p.contacts || []).map((c) => c.phone).filter(Boolean).join(",");
  return `sms:${to}?body=${encodeURIComponent(body)}`;
}

// ---------- status checks and the helicopter alert ----------
let watchTimer = null;
let nearKm = Infinity;

export function watch() {
  clearTimeout(watchTimer);
  const s = activeSos();
  if (!isActive(s)) return;
  const delay = nearKm <= 15 ? 5000 : 15000;
  watchTimer = setTimeout(checkStatus, s.delivered ? delay : 5000);
}
function stopWatch() { clearTimeout(watchTimer); }
/** Checks the SOS status and nearby rescue units right now. */
export function checkNow() { clearTimeout(watchTimer); return checkStatus(); }

async function checkStatus() {
  const s = activeSos();
  if (!isActive(s)) return;
  try {
    if (s.delivered && isOnline()) {
      const r = await api(`sos/${s.id}`, { timeout: 8000 });
      const cur = activeSos();
      if (cur && cur.id === s.id && (r.status !== cur.status)) save({ ...cur, status: r.status, history: r.history });
      nearKm = r.nearby?.distanceKm ?? Infinity;
      if (r.nearby?.level) heliAlert(r.nearby);
      // Send a newer GPS fix if we have one (every 2 minutes, PRD F3)
      const loc = lastLocation();
      if (loc && loc.locatedAt !== cur?.locatedAt && Date.now() - new Date(cur?.locatedAt || 0).getTime() > 110000) updateSos(loc);
    }
  } catch { /* try again next time */ }
  watch();
}

/** The helicopter alert read aloud in the current language (AI voice, saved in advance). */
export const heliPhrase = () => heliPhraseIn(getLang());

function heliAlert(n) {
  const shown = ls.get("aa.heliShown", []);
  const key = `${n.unitId}:${n.level}`;
  if (shown.includes(key)) return;
  ls.set("aa.heliShown", [...shown, key]);
  const steps = [t("heli_step1"), t("heli_step2"), t("heli_step3")];
  // Send a fresh location so the crew sees exactly where we are
  getPosition({ maxAge: 0 }).then((l) => l && updateSos(l));
  if (n.level === "signal_now") {
    vibrate([600, 200, 600, 200, 600, 200, 1200]);
    document.querySelectorAll(".overlay.heli").forEach((o) => o.close?.());
    strobe(true, { title: t("heli_now_t"), lines: [t("heli_now_b", { km: n.distanceKm }), ...steps] });
  } else {
    vibrate([400, 200, 400]);
    whistle(true); setTimeout(() => whistle(false), 2500);
    const close = overlay(
      h("div", { class: "card heli-card" },
        h("div", { class: "hero-ic blue" }, icon(n.type === "boat" ? "directions_boat" : n.type === "ground" ? "ambulance" : "helicopter")),
        h("h2", {}, n.type === "boat" ? t("boat") : n.type === "ground" ? t("ground") : t("heli_approach_t")),
        h("p", { class: "big" }, t("heli_approach_b", { km: n.distanceKm })),
        h("ol", { class: "steps" }, steps.map((x) => h("li", {}, x))),
        h("div", { class: "row" },
          h("button", { class: "btn primary", onclick: () => { close(); strobe(true, { title: t("heli_now_t"), lines: steps }); } }, label("flashlight_on", t("strobe_start"))),
          h("button", { class: "btn", onclick: () => close() }, t("close")))),
      { className: "heli" },
    );
    speak(heliPhrase(), { waitMs: 2500 });
  }
}
