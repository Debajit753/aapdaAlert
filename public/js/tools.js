// Strobe and whistle (PRD F12) and compass helpers (PRD F11).
import { h, overlay } from "./ui.js";
import { t } from "./i18n.js";

// ---------- screen wake lock ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not allowed */ }
}

// ---------- whistle ----------
let audio = null;
export function whistle(on) {
  if (!on) {
    if (audio) { audio.stop(); audio = null; }
    return;
  }
  if (audio) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 3150; // high and piercing, like a rescue whistle
    osc.connect(gain);
    osc.start();
    // Three short blasts, pause, repeat
    let step = 0;
    const pattern = [1, 0, 1, 0, 1, 0, 0, 0, 0];
    const timer = setInterval(() => { gain.gain.setTargetAtTime(pattern[step++ % pattern.length] ? 0.6 : 0, ctx.currentTime, 0.01); }, 220);
    ctx.resume?.();
    audio = { stop() { clearInterval(timer); try { osc.stop(); ctx.close(); } catch { /* ignore */ } } };
  } catch { audio = null; }
}

// ---------- torch (camera flash) where the browser allows it ----------
let torchTrack = null;
async function torchOn() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const track = stream.getVideoTracks()[0];
    if (!track.getCapabilities?.().torch) { track.stop(); return null; }
    torchTrack = track;
    return track;
  } catch { return null; }
}
function torchSet(on) { try { torchTrack?.applyConstraints({ advanced: [{ torch: on }] }); } catch { /* ignore */ } }
function torchOff() { try { torchTrack?.stop(); } catch { /* ignore */ } torchTrack = null; }

// ---------- strobe: SOS in Morse (dot dot dot, dash dash dash, dot dot dot) ----------
const U = 220; // one Morse unit in ms
const SOS = [1, 1, 1, 1, 1, 3, 3, 1, 3, 1, 3, 3, 1, 1, 1, 1, 1, 7]; // on/off durations in units, alternating, starting with "on"

let strobeClose = null;
export function strobe(on, { withWhistle = false, title = "", lines = [] } = {}) {
  if (!on) { strobeClose?.(); return; }
  if (strobeClose) return;
  const panel = h("div", { class: "strobe" },
    title ? h("div", { class: "strobe-msg" }, h("h2", {}, title), lines.map((l) => h("p", {}, l))) : null);
  const stopBtn = h("button", { class: "btn strobe-stop", onclick: () => strobe(false) }, t("stop"));
  panel.append(stopBtn);
  let i = 0, timer = null, alive = true;
  const tick = () => {
    if (!alive) return;
    const lit = i % 2 === 0;
    panel.classList.toggle("lit", lit);
    torchSet(lit);
    timer = setTimeout(tick, SOS[i % SOS.length] * U);
    i++;
  };
  strobeClose = overlay(panel, {
    className: "strobe-layer",
    onClose: () => { alive = false; clearTimeout(timer); torchOff(); keepAwake(false); if (withWhistle) whistle(false); strobeClose = null; },
  });
  keepAwake(true);
  if (withWhistle) whistle(true);
  torchOn().then(() => { if (alive) torchSet(true); });
  tick();
}

// ---------- compass ----------
export function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function bearingDeg(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export function dirWord(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return t(`dir_${dirs[Math.round(deg / 45) % 8]}`);
}

/** Calls onHeading(degrees from north) as the phone turns. Returns a stop function. */
export function watchHeading(onHeading) {
  const handler = (e) => {
    let hd = null;
    if (typeof e.webkitCompassHeading === "number") hd = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === "number") hd = 360 - e.alpha;
    if (hd !== null) onHeading(hd);
  };
  const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  const start = () => window.addEventListener(evt, handler, true);
  // iPhone asks for permission
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission().then((s) => { if (s === "granted") start(); }).catch(() => {});
  } else start();
  return () => window.removeEventListener(evt, handler, true);
}
