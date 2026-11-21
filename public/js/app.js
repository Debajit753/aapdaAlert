// apadaAlert citizen app: screens and navigation.
import { LANGS, t, setLang, getLang, pick } from "./i18n.js";
import { h, $, toast, timeAgo, overlay, fill } from "./ui.js";
import { settings, getProfile, setProfile, EMPTY_PROFILE, ls } from "./state.js";
import { api, flush, isOnline } from "./net.js";
import { startTracking, lastLocation, getPosition, locationDenied } from "./location.js";
import { activeSos, isActive, statusText, cancelSos, clearFinishedSos, smsLink, watch } from "./sos.js";
import { startDanger, setQuestions } from "./danger.js";
import { renderChat, askLeftovers, deleteChats } from "./chat.js";
import { renderMap } from "./map.js";
import { strobe, whistle, watchHeading, distanceKm, bearingDeg, dirWord } from "./tools.js";
import { GUIDES } from "../data/guides.js";
import { CAMPS } from "../data/camps.js";
import { QUESTIONS_VERSION } from "../data/questions.js";

const app = $("#app");
let alerts = [];

function init() {
  setLang(settings.lang || guessLang());
  const savedQ = ls.get("aa.questions");
  if (savedQ?.questions) setQuestions(savedQ.questions);
  renderShell();
  window.addEventListener("hashchange", route);
  window.addEventListener("net-status", updatePill);
  window.addEventListener("sos-change", () => { if (current === "home") route(); });
  window.addEventListener("location", () => { if (current === "home") updateLocLine(); });
  if (settings.introDone) startServices();
  route();
}

function guessLang() {
  const l = (navigator.language || "en").slice(0, 2);
  return ["hi", "as", "bn"].includes(l) ? l : "en";
}

function startServices() {
  startTracking();
  flush();
  watch();
  refreshQuestions();
  refreshAlerts();
  setInterval(refreshAlerts, 60000);
}

async function refreshQuestions() {
  try {
    const r = await api("questions");
    if (r.version >= (ls.get("aa.questions")?.version || QUESTIONS_VERSION)) { ls.set("aa.questions", r); setQuestions(r.questions); }
  } catch { /* keep the saved list */ }
}

async function refreshAlerts() {
  const loc = lastLocation();
  try {
    const r = await api(`alerts${loc ? `?lat=${loc.lat}&lon=${loc.lon}` : ""}`);
    alerts = r.alerts || [];
    ls.set("aa.alerts", alerts);
  } catch { alerts = ls.get("aa.alerts", []); }
  if (current === "home") renderAlerts();
}

// ---------------- shell ----------------
let current = null;
const NAV = [
  { id: "home", icon: "🏠", key: "nav_home" }, { id: "chat", icon: "💬", key: "nav_chat" },
  { id: "map", icon: "🗺️", key: "nav_map" }, { id: "guides", icon: "📘", key: "nav_guides" }, { id: "more", icon: "☰", key: "nav_more" },
];

function renderShell() {
  app.replaceChildren(
    h("header", { class: "topbar" },
      h("a", { class: "brand", href: "#home" }, h("span", { class: "logo" }, "⚠"), h("span", {}, "apada", h("b", {}, "Alert"))),
      h("span", { id: "pill", class: "pill" })),
    h("main", { id: "view", tabindex: "-1" }),
    h("nav", { class: "bottomnav", id: "nav" }, NAV.map((n) => h("a", { href: `#${n.id}`, "data-id": n.id }, h("span", { class: "nav-icon" }, n.icon), h("span", {}, t(n.key))))),
  );
  updatePill();
}

function updatePill() {
  const pill = $("#pill");
  if (!pill) return;
  const on = isOnline();
  pill.className = `pill ${on ? "on" : "off"}`;
  pill.textContent = on ? `● ${t("online")}` : `● ${t("offline")}`;
}

function route() {
  const view = $("#view");
  if (!settings.introDone) { $("#nav").hidden = true; return renderIntro(view); }
  $("#nav").hidden = false;
  const id = (location.hash || "#home").slice(1) || "home";
  current = id;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.id === id));
  const screens = { home: renderHome, chat: renderChatView, map: renderMap, guides: renderGuides, more: renderMore, help: renderHelp, camps: renderCamps, tools: renderTools, profile: renderProfile };
  (screens[id] || renderHome)(view);
  view.scrollTop = 0;
}
const goto = (id) => { location.hash = id; };

const sosFloat = () => h("button", { class: "sos-float", onclick: () => { finishIntro(); startDanger({ trigger: "sos", onLeftover: askLeftovers }); } }, "SOS");

// ---------------- intro (PRD F4) ----------------
let introStep = 0;
function renderIntro(view) {
  const steps = [introLang, introCard(1), introCard(2), introCard(3), introDetails, introConsent];
  const body = steps[introStep]();
  view.replaceChildren(h("div", { class: "intro" }, body), sosFloat());
}
const nextIntro = () => { introStep++; route(); };
const prevIntro = () => { introStep = Math.max(0, introStep - 1); route(); };

function introLang() {
  return h("div", { class: "intro-card" },
    h("div", { class: "hero-logo" }, "⚠"),
    h("h1", {}, "apada", h("b", {}, "Alert")),
    h("p", { class: "muted" }, t("tagline")),
    h("h2", {}, t("intro_lang")),
    h("div", { class: "lang-grid" }, LANGS.map((l) => h("button", {
      class: `opt ${getLang() === l.id ? "on" : ""}`,
      onclick: () => { setLang(l.id); settings.lang = l.id; renderShell(); nextIntro(); },
    }, l.name))));
}

function introCard(n) {
  const icons = { 1: "💬", 2: "🆘", 3: "🚁" };
  return () => h("div", { class: "intro-card" },
    h("div", { class: "hero-logo big" }, icons[n]),
    h("h1", {}, t(`intro${n}_t`)),
    h("p", { class: "lead" }, t(`intro${n}_b`)),
    h("div", { class: "dots" }, [1, 2, 3].map((i) => h("span", { class: i === n ? "dot now" : "dot" }))),
    h("div", { class: "row" }, h("button", { class: "btn", onclick: prevIntro }, t("back")), h("button", { class: "btn primary", onclick: nextIntro }, t("next"))));
}

function introDetails() {
  const form = profileForm(getProfile());
  return h("div", { class: "intro-card left" },
    h("h1", {}, t("details_t")),
    h("p", { class: "muted" }, t("details_b")),
    form.el,
    h("div", { class: "row" },
      h("button", { class: "btn", onclick: prevIntro }, t("back")),
      h("button", { class: "btn primary", onclick: () => { setProfile(form.read()); nextIntro(); } }, t("next"))));
}

function introConsent() {
  return h("div", { class: "intro-card" },
    h("div", { class: "hero-logo big" }, "📍"),
    h("p", { class: "lead" }, t("loc_ask")),
    h("p", { class: "consent" }, t("consent")),
    h("button", { class: "btn primary wide", onclick: async () => { await getPosition({ maxAge: 0 }); finishIntro(); route(); } }, `✅ ${t("agree_start")}`),
    h("button", { class: "btn ghost", onclick: prevIntro }, t("back")));
}

function finishIntro() {
  if (settings.introDone) return;
  settings.introDone = true;
  settings.lang = getLang();
  location.hash = "home";
  startServices();
}

function profileForm(p) {
  const field = (key, type = "text", attrs = {}) => h("label", { class: "field" }, h("span", {}, t(`f_${key}`)),
    h("input", { name: key, type, value: p[key] ?? "", ...attrs }));
  const counter = (key) => {
    const input = h("input", { name: key, type: "number", min: 0, max: 99, value: p[key] || 0, inputmode: "numeric" });
    const step = (d) => { input.value = Math.max(0, Math.min(99, Number(input.value || 0) + d)); };
    return h("label", { class: "field counter" }, h("span", {}, t(`f_${key}`)),
      h("div", { class: "stepper" }, h("button", { type: "button", onclick: () => step(-1) }, "−"), input, h("button", { type: "button", onclick: () => step(1) }, "+")));
  };
  const contacts = [0, 1, 2].map((i) => h("div", { class: "contact" },
    h("input", { name: `cname${i}`, placeholder: t("f_contact_name"), value: p.contacts?.[i]?.name || "" }),
    h("input", { name: `cphone${i}`, placeholder: t("f_contact_phone"), type: "tel", value: p.contacts?.[i]?.phone || "" })));
  const el = h("form", { class: "form", onsubmit: (e) => e.preventDefault() },
    field("name", "text", { autocomplete: "name" }), field("phone", "tel", { autocomplete: "tel" }),
    counter("people"),
    h("div", { class: "grid2" }, counter("elderly"), counter("children"), counter("pregnant"), counter("disabled")),
    h("label", { class: "field" }, h("span", {}, t("f_medical")), h("textarea", { name: "medical", rows: 2 }, p.medical || "")),
    h("h3", {}, t("f_contacts")), contacts);
  const read = () => {
    const v = (n) => el.querySelector(`[name="${n}"]`).value.trim();
    const num = (n) => Math.max(0, Math.min(99, parseInt(v(n), 10) || 0));
    return {
      ...EMPTY_PROFILE, name: v("name"), phone: v("phone"), people: num("people"), elderly: num("elderly"), children: num("children"),
      pregnant: num("pregnant"), disabled: num("disabled"), medical: v("medical"),
      contacts: [0, 1, 2].map((i) => ({ name: v(`cname${i}`), phone: v(`cphone${i}`) })).filter((c) => c.phone),
    };
  };
  return { el, read };
}

// ---------------- home (PRD F2) ----------------
function renderHome(view) {
  const s = activeSos();
  fill(view,
    h("div", { id: "alerts" }),
    s ? sosCard(s) : null,
    h("div", { class: "sos-wrap" },
      h("button", { class: "sos-btn", "aria-label": t("sos"), onclick: () => startDanger({ trigger: "sos", onLeftover: askLeftovers }) },
        h("span", { class: "sos-text" }, t("sos")), h("span", { class: "sos-sub" }, t("sos_sub")))),
    h("p", { id: "locline", class: "muted small center" }),
    h("div", { class: "tiles" },
      tile("💬", t("tile_chat"), "chat"), tile("📘", t("tile_guides"), "guides"), tile("🗺️", t("tile_map"), "map"),
      tile("🧭", t("tile_compass"), "camps"), tile("🔦", t("tile_strobe"), "tools"), tile("📞", t("tile_help"), "help")),
  );
  renderAlerts();
  updateLocLine();
}
const tile = (icon, label, to) => h("a", { class: "tile", href: `#${to}` }, h("span", { class: "tile-icon" }, icon), h("span", {}, label));

function renderAlerts() {
  const box = $("#alerts");
  if (!box) return;
  box.replaceChildren(...alerts.map((a) => h("div", { class: `alert ${a.severity}` },
    h("b", {}, `⚠ ${t("alert_active")}${a.demo ? ` (${t("demo")})` : ""}: `), pick(a.message))));
}

function updateLocLine() {
  const el = $("#locline");
  if (!el) return;
  const l = lastLocation();
  el.textContent = locationDenied() ? `📍 ${t("loc_denied")}` : l ? `📍 ${t("loc_saved", { ago: timeAgo(l.locatedAt, t), acc: l.accuracyM })}` : `📍 ${t("loc_none")}`;
}

function sosCard(s) {
  const active = isActive(s);
  const steps = ["st_saved", "st_received", "st_dispatched", "st_rescued"];
  const reached = !s.delivered ? 0 : s.status === "dispatched" ? 2 : s.status === "rescued" ? 3 : 1;
  return h("div", { class: `card sos-card ${s.status}` },
    h("div", { class: "row between" }, h("h2", {}, `🆘 ${t("sos_status")}`), h("span", { class: "badge" }, statusText(s))),
    s.status !== "cancelled" ? h("ol", { class: "track" }, steps.map((k, i) => h("li", { class: i <= reached ? "done" : "" }, t(k)))) : null,
    h("p", { class: "muted small" }, timeAgo(s.createdAt, t), !s.delivered ? ` · ${t("sos_saved_offline")}` : ""),
    active ? h("div", { class: "grid2" },
      h("a", { class: "btn", href: smsLink(s) }, `📨 ${t("sms_sos")}`),
      h("button", { class: "btn", onclick: () => { if (confirm(t("cancel_sos_q"))) cancelSos(); } }, t("cancel_sos")))
      : h("button", { class: "btn ghost", onclick: () => clearFinishedSos() }, t("close")));
}

// ---------------- chat ----------------
function chatContext() {
  const loc = lastLocation();
  const camp = loc ? nearestCamp(loc) : null;
  const s = activeSos();
  return {
    alerts: alerts.map((a) => a.message.en),
    nearestCamp: camp ? { name: camp.c.name, km: Math.round(camp.km * 10) / 10, demo: true } : null,
    sosStatus: s ? (s.delivered ? s.status : "saved on phone, not yet delivered") : "no SOS",
    location: loc ? "known" : "unknown",
  };
}

function renderChatView(view) {
  renderChat(view, { getContext: chatContext, goto });
  // A severe alert is active: go straight to the quick questions (PRD F6)
  const severe = alerts.find((a) => a.severity === "severe");
  const shown = ls.get("aa.alertDanger", []);
  if (severe && !isActive() && !shown.includes(severe.id)) {
    ls.set("aa.alertDanger", [...shown, severe.id]);
    startDanger({ trigger: "alert", hazardHint: severe.hazard, onLeftover: askLeftovers });
  }
}

// ---------------- guides (PRD F7) ----------------
function renderGuides(view) {
  let hz = "flood";
  const body = h("div");
  const tabs = h("div", { class: "tabs" }, Object.keys(GUIDES).map((k) => h("button", {
    class: `tab ${k === hz ? "on" : ""}`, "data-id": k,
    onclick: () => { hz = k; tabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.id === hz)); draw(); },
  }, `${GUIDES[k].icon} ${t(`hz_${k}`)}`)));
  const draw = () => body.replaceChildren(...["before", "during", "after"].map((ph) => {
    const items = pick(GUIDES[hz][ph]);
    return h("section", { class: `card guide ${ph}` },
      h("div", { class: "row between" }, h("h2", {}, t(ph)),
        h("button", { class: "icon-btn", "aria-label": t("read_aloud"), onclick: () => import("./voice.js").then((v) => v.speak(`${t(ph)}. ${items.join(". ")}`)) }, "🔊")),
      h("ol", { class: "steps" }, items.map((x) => h("li", {}, x))));
  }));
  view.replaceChildren(h("h1", {}, t("guides_title")), tabs, body);
  draw();
}

// ---------------- helplines (PRD F8) ----------------
const HELPLINES = ["112", "108", "101", "1070", "1077", "1078", "1091", "1098", "14416"];
function renderHelp(view) {
  view.replaceChildren(h("h1", {}, t("help_title")), h("p", { class: "muted" }, t("help_hint")),
    h("div", { class: "list" }, HELPLINES.map((n) => h("a", { class: `call-row ${n === "112" ? "main" : ""}`, href: `tel:${n}` },
      h("span", { class: "num" }, n), h("span", { class: "grow" }, t(`h${n}`)), h("span", {}, "📞")))));
}

// ---------------- camps and compass (PRD F11) ----------------
function nearestCamp(loc) {
  return CAMPS.map((c) => ({ c, km: distanceKm(loc, c) })).sort((a, b) => a.km - b.km)[0];
}

function renderCamps(view) {
  const loc = lastLocation();
  const arrow = h("div", { class: "arrow" }, "⬆");
  const words = h("p", { class: "big center" });
  const list = (loc ? CAMPS.map((c) => ({ c, km: distanceKm(loc, c) })).sort((a, b) => a.km - b.km) : CAMPS.map((c) => ({ c, km: null })));
  const target = list[0];
  fill(view,
    h("h1", {}, t("camps_title")),
    h("p", { class: "notice" }, t("camps_demo")),
    loc ? h("section", { class: "card compass-card" },
      h("h2", {}, `${t("nearest")}: ${target.c.name}`),
      h("div", { class: "compass" }, h("div", { class: "ring" }, h("span", { class: "n" }, "N")), arrow),
      words, h("p", { class: "muted small center" }, t("compass_hint"))) : h("p", { class: "notice" }, t("loc_none")),
    h("div", { class: "list" }, list.map(({ c, km }) => h("div", { class: "call-row" },
      h("span", { class: "num" }, "⛺"), h("span", { class: "grow" }, h("b", {}, c.name), h("br"), h("small", {}, `${t("capacity", { n: c.capacity })} · ${c.facilities.join(", ")}`)),
      km !== null ? h("span", {}, t("km_away", { km: km.toFixed(1) })) : null))));
  if (!loc) return;
  const brg = bearingDeg(loc, target.c);
  words.textContent = t("compass_words", { km: target.km.toFixed(1), dir: dirWord(brg) });
  arrow.style.transform = `rotate(${brg}deg)`;
  const stop = watchHeading((heading) => {
    if (!view.isConnected || current !== "camps") return stop();
    arrow.style.transform = `rotate(${brg - heading}deg)`;
  });
}

// ---------------- strobe and whistle (PRD F12) ----------------
function renderTools(view) {
  let whistling = false;
  const wBtn = h("button", { class: "btn wide big-btn", onclick: () => { whistling = !whistling; whistle(whistling); wBtn.textContent = whistling ? `⏹ ${t("stop")}` : `📢 ${t("whistle_start")}`; } }, `📢 ${t("whistle_start")}`);
  view.replaceChildren(h("h1", {}, t("tools_title")), h("p", { class: "muted" }, t("tools_hint")),
    h("button", { class: "btn primary wide big-btn", onclick: () => strobe(true) }, `🔦 ${t("strobe_start")}`), wBtn);
  window.addEventListener("hashchange", () => whistle(false), { once: true });
}

// ---------------- more ----------------
function renderMore(view) {
  view.replaceChildren(
    h("h1", {}, t("more_title")),
    h("div", { class: "list" },
      h("a", { class: "call-row", href: "#profile" }, h("span", { class: "num" }, "👤"), h("span", { class: "grow" }, t("my_details"))),
      h("a", { class: "call-row", href: "#help" }, h("span", { class: "num" }, "📞"), h("span", { class: "grow" }, t("tile_help"))),
      h("a", { class: "call-row", href: "#camps" }, h("span", { class: "num" }, "🧭"), h("span", { class: "grow" }, t("tile_compass"))),
      h("a", { class: "call-row", href: "#tools" }, h("span", { class: "num" }, "🔦"), h("span", { class: "grow" }, t("tile_strobe")))),
    h("h2", {}, t("language")),
    h("div", { class: "lang-grid" }, LANGS.map((l) => h("button", { class: `opt ${getLang() === l.id ? "on" : ""}`, onclick: () => { setLang(l.id); settings.lang = l.id; renderShell(); route(); } }, l.name))),
    h("button", { class: "btn wide", onclick: () => { if (confirm(t("delete_chats") + "?")) deleteChats(); } }, `🗑 ${t("delete_chats")}`),
    h("section", { class: "card" }, h("h2", {}, t("about")), h("p", {}, t("about_b")), h("p", { class: "muted small" }, t("chat_saved_note"))));
}

function renderProfile(view) {
  const form = profileForm(getProfile());
  view.replaceChildren(h("h1", {}, t("my_details")), h("p", { class: "muted" }, t("details_b")), form.el,
    h("button", { class: "btn primary wide", onclick: () => { setProfile(form.read()); toast(t("saved")); goto("more"); } }, t("save")));
}

init();

// Register the service worker so the app opens without a network (PRD F1)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
