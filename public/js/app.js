// apadaAlert citizen app: screens and navigation.
import { LANGS, t, setLang, getLang, pick, speechLang } from "./i18n.js";
import { h, $, toast, timeAgo, fill } from "./ui.js";
import { icon, label } from "./icons.js";
import { settings, getProfile, setProfile, EMPTY_PROFILE, ls } from "./state.js";
import { api, flush, isOnline } from "./net.js";
import { startTracking, lastLocation, getPosition, locationDenied } from "./location.js";
import { activeSos, isActive, statusText, cancelSos, clearFinishedSos, smsLink, watch, heliPhrase } from "./sos.js";
import { startDanger, setQuestions, dangerPhrases } from "./danger.js";
import { renderChat, askLeftovers, deleteChats } from "./chat.js";
import { renderMap } from "./map.js";
import { strobe, whistle, watchHeading, distanceKm, bearingDeg, dirWord } from "./tools.js";
import { speak, prepareVoices } from "./voice.js";
import { renderTour } from "./tour.js";
import { renderPeople } from "./people.js";
import { simulateOffline } from "./net.js";
import { GUIDES } from "../data/guides.js";
import { CAMPS } from "../data/camps.js";
import { QUESTIONS_VERSION } from "../data/questions.js";

const app = $("#app");
let alerts = [];

function init() {
  setLang(settings.lang || guessLang());
  // Use the saved question list only if it is at least as new as the one shipped with the app
  const savedQ = ls.get("aa.questions");
  if (savedQ?.questions && savedQ.version >= QUESTIONS_VERSION) setQuestions(savedQ.questions);
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
  refreshOfficial();
  setInterval(refreshOfficial, 10 * 60000);
  prepareDangerVoices();
}

/**
 * Saves the AI voice for the danger questions and the helicopter alert in the person's language,
 * a few seconds after start, so in an emergency they play at once, even with no network.
 */
function prepareDangerVoices() {
  setTimeout(() => prepareVoices([...dangerPhrases(), heliPhrase()]).catch(() => {}), 4000);
}

async function refreshQuestions() {
  try {
    const r = await api("questions");
    if (r.version >= QUESTIONS_VERSION) { ls.set("aa.questions", r); setQuestions(r.questions); }
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

// ---------------- official alerts and weather ----------------
let official = ls.get("aa.official", []);
let showAllOfficial = false;

/** Government alerts for North East India from SACHET (NDMA). */
async function refreshOfficial() {
  try {
    const r = await api("official", { timeout: 15000 });
    if (Array.isArray(r.alerts)) { official = r.alerts; ls.set("aa.official", official); }
  } catch { /* keep the saved copy */ }
  if (current === "home") renderOfficial();
}

/** Weather where the person is (Open-Meteo through our server). Kept 10 minutes; the last copy shows offline. */
async function refreshWeather() {
  const loc = lastLocation();
  const saved = ls.get("aa.weather");
  if (saved?.data) renderWeather(saved);
  if (!loc || !isOnline() || (saved && Date.now() - saved.at < 10 * 60000 && saved.key === `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`)) return;
  try {
    const data = await api(`weather?lat=${loc.lat}&lon=${loc.lon}`, { timeout: 12000 });
    const entry = { data, at: Date.now(), key: `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}` };
    ls.set("aa.weather", entry);
    renderWeather(entry);
  } catch { /* keep what is shown */ }
}

// WMO weather codes grouped into a few plain words, each with an icon
function weatherWords(code) {
  if (code === 0 || code === 1) return ["w_clear", "sunny"];
  if (code === 2) return ["w_partly", "partly_cloudy_day"];
  if (code === 3) return ["w_cloudy", "cloud"];
  if (code === 45 || code === 48) return ["w_fog", "foggy"];
  if (code >= 51 && code <= 57) return ["w_drizzle", "rainy"];
  if (code === 65 || code === 67 || code === 82) return ["w_heavy", "rainy_heavy"];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ["w_rain", "rainy"];
  if (code >= 71 && code <= 86) return ["w_snow", "weather_mix"];
  if (code >= 95) return ["w_storm", "thunderstorm"];
  return ["w_cloudy", "cloud"];
}

function renderWeather(entry) {
  const box = $("#weather");
  if (!box || !entry?.data) return;
  const w = entry.data;
  const [word, ic] = weatherWords(w.code);
  const heavy = w.code >= 65 || w.rain6hMm >= 10 || (w.rainChance6h >= 70 && w.rain6hMm >= 5);
  fill(box, h("div", { class: `weather ${heavy ? "warn" : ""}` },
    h("span", { class: "wx-ic" }, icon(ic)),
    h("div", { class: "grow" },
      h("div", { class: "wx-top" }, h("b", { class: "wx-temp" }, `${w.tempC}°`), h("span", {}, t(word))),
      h("div", { class: "wx-sub" }, [w.rainChance6h != null ? t("rain_chance", { p: w.rainChance6h }) : null, t("wind", { v: w.windKmh })].filter(Boolean).join(" · ")),
      heavy ? h("div", { class: "wx-warn" }, icon("warning"), t("heavy_rain")) : null),
    h("span", { class: "wx-when" }, t("weather_now"), h("br"), timeAgo(new Date(entry.at).toISOString(), t))));
}

const CATEGORY_ICON = { Met: "rainy", Geo: "earthquake", Hydro: "flood", Rescue: "sos", Fire: "emergency", Health: "health_and_safety" };
function officialIcon(a) {
  const s = a.title.toLowerCase();
  if (/flood|water level|river/.test(s)) return "flood";
  if (/landslide/.test(s)) return "landslide";
  if (/thunder|lightning|\bts\b/.test(s)) return "thunderstorm";
  if (/heavy rain/.test(s)) return "rainy_heavy";
  return CATEGORY_ICON[a.category] || "warning";
}

function renderOfficial() {
  const box = $("#official");
  if (!box) return;
  const list = showAllOfficial ? official : official.slice(0, 3);
  fill(box,
    h("div", { class: "section-head" }, h("h3", {}, t("official_alerts")), h("span", { class: "muted small" }, t("english_only"))),
    official.length
      ? h("div", { class: "list" }, list.map((a) => h("a", { class: "list-row", href: a.link, target: "_blank", rel: "noopener" },
        h("span", { class: "chip-ic orange" }, icon(officialIcon(a))),
        h("span", { class: "grow" }, h("span", { class: "clamp" }, a.title), h("span", { class: "sub" }, `${t("issued_by", { who: a.issuer })} · ${timeAgo(a.at, t)}`)))))
      : h("p", { class: "muted small" }, t("no_official")),
    official.length > 3 ? h("button", { class: "btn ghost wide", style: { marginTop: "-12px" }, onclick: () => { showAllOfficial = !showAllOfficial; renderOfficial(); } },
      showAllOfficial ? t("show_less") : t("show_all", { n: official.length })) : null,
    h("p", { class: "muted small source" }, icon("account_balance"), ` ${t("gov_source")}`));
}

// ---------------- shell ----------------
let current = null;
const NAV = [
  { id: "home", icon: "home", key: "nav_home" }, { id: "chat", icon: "forum", key: "nav_chat" },
  { id: "map", icon: "map", key: "nav_map" }, { id: "guides", icon: "menu_book", key: "nav_guides" }, { id: "more", icon: "menu", key: "nav_more" },
];
const SUB_SCREENS = { help: "more", camps: "more", tools: "more", profile: "more", tour: "more" };

function renderShell() {
  fill(app,
    h("header", { class: "topbar" },
      h("span", { id: "topleft" }),
      h("span", { class: "topright" },
        h("span", { id: "pill", class: "pill" }),
        h("a", { id: "avatar", class: "avatar", href: "#profile", "aria-label": t("my_details") }))),
    h("main", { id: "view", tabindex: "-1" }),
    // UX4G: outlined icons, and the filled version only for the tab you are on
    h("nav", { class: "bottomnav", id: "nav" }, NAV.map((n) => h("a", { href: `#${n.id}`, "data-id": n.id },
      icon(n.icon, "ic-line"), icon(`${n.icon}-fill`, "ic-fill"), h("span", {}, t(n.key))))),
  );
  updatePill();
}

/** Top bar: the app mark on main screens, a back button on inner screens, and the person's initial on the right. */
function updateTop(id) {
  // Every screen except Home gets a back button. It returns to the screen the person came from.
  const showBack = Boolean(id) && id !== "home";
  fill($("#topleft"), showBack
    ? h("a", { class: "back", href: "#home", "aria-label": t("back"), onclick: (e) => { e.preventDefault(); goBack(); } }, icon("arrow_back"))
    : h("a", { class: "mark", href: "#home", "aria-label": "apadaAlert" }, h("img", { src: "/icons/icon.svg", alt: "" })));
  const avatar = $("#avatar");
  avatar.hidden = !settings.introDone;
  const name = getProfile().name.trim();
  fill(avatar, name ? name[0].toUpperCase() : icon("person"));
}

/** The status pill only appears when the network is down. Online is the normal state, so it shows nothing. */
function updatePill() {
  const pill = $("#pill");
  if (!pill) return;
  const on = isOnline();
  pill.hidden = on;
  pill.className = "pill off";
  pill.textContent = on ? "" : t("offline");
}

function route() {
  const view = $("#view");
  if (!settings.introDone) { $("#nav").hidden = true; updateTop(null); return renderIntro(view); }
  $("#nav").hidden = false;
  const id = (location.hash || "#home").slice(1) || "home";
  current = id;
  if (id === "home") trail.length = 0;
  if (trail[trail.length - 1] !== id) trail.push(id);
  updateTop(id);
  const tab = SUB_SCREENS[id] || id;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.id === tab));
  const screens = { home: renderHome, chat: renderChatView, map: renderMap, guides: renderGuides, more: renderMore, help: renderHelp, camps: renderCamps, tools: renderTools, profile: renderProfile, tour: renderTourView };
  (screens[id] || renderHome)(view);
  window.scrollTo(0, 0);
}
const goto = (id) => { location.hash = id; };

// The screens visited in order, so Back returns to the previous one (or Home).
const trail = [];
function goBack() {
  const here = trail.pop();
  goto(trail.pop() || SUB_SCREENS[here] || "home");
}

/** A row in a grouped list: tinted icon, title, optional subtitle and end text. */
function listRow({ href, ic, tint = "", title, sub, end, chevron = true }) {
  return h("a", { class: "list-row", href },
    h("span", { class: `chip-ic ${tint}` }, typeof ic === "string" ? icon(ic) : ic),
    h("span", { class: "grow" }, title, sub ? h("span", { class: "sub" }, sub) : null),
    end || chevron ? h("span", { class: "end" }, end, chevron ? icon("chevron_right") : null) : null);
}

// ---------------- intro (PRD F4) ----------------
let introStep = 0;
function renderIntro(view) {
  const steps = [introLang, introCard(1), introCard(2), introCard(3), introDetails, introConsent];
  fill(view, h("div", { class: "intro" }, steps[introStep]()),
    h("button", { class: "sos-float", "aria-label": t("sos"), onclick: () => { finishIntro(); startDanger({ trigger: "sos", onLeftover: askLeftovers }); } }, "SOS"));
  window.scrollTo(0, 0);
}
const nextIntro = () => { introStep++; route(); };
const prevIntro = () => { introStep = Math.max(0, introStep - 1); route(); };

function langList(onPick) {
  return h("div", { class: "list" }, LANGS.map((l) => h("button", {
    class: `choice ${getLang() === l.id ? "on" : ""}`,
    onclick: () => { setLang(l.id); settings.lang = l.id; renderShell(); onPick(); if (settings.introDone) prepareDangerVoices(); },
  }, l.name, icon("check"))));
}

function introLang() {
  return h("div", { class: "intro-card" },
    h("div", { class: "intro-body" },
      h("img", { class: "hero-logo", src: "/icons/icon.svg", alt: "" }),
      h("p", { class: "wordmark" }, "apada", h("b", {}, "Alert")),
      h("p", { class: "lead" }, t("tagline")),
      h("h3", { style: { textAlign: "left" } }, t("intro_lang")),
      langList(nextIntro),
      h("button", { class: "btn ghost", onclick: startWithSampleData }, "Judge? Skip to the feature tour")));
}

function introCard(n) {
  const art = { 1: ["forum", "blue"], 2: ["sos", ""], 3: ["helicopter", "green"] }[n];
  return () => h("div", { class: "intro-card" },
    h("div", { class: "intro-body" },
      h("div", { class: `hero-ic ${art[1]}` }, icon(art[0])),
      h("h1", {}, t(`intro${n}_t`)),
      h("p", { class: "lead" }, t(`intro${n}_b`)),
      h("div", { class: "dots" }, [1, 2, 3].map((i) => h("span", { class: i === n ? "dot now" : "dot" })))),
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
    h("div", { class: "intro-body" },
      h("div", { class: "hero-ic blue" }, icon("location_on")),
      h("h1", {}, t("allow_loc")),
      h("p", { class: "lead" }, t("loc_ask")),
      h("div", { class: "consent" }, icon("lock"), h("span", {}, t("consent")))),
    h("button", { class: "btn primary wide", onclick: async () => { await getPosition({ maxAge: 0 }); finishIntro(); route(); } }, t("agree_start")),
    h("button", { class: "btn ghost wide", onclick: prevIntro }, t("back")));
}

function finishIntro() {
  if (settings.introDone) return;
  settings.introDone = true;
  // details may have changed the questions ("Are all 4 people...?"), so voices are prepared after the intro
  settings.lang = getLang();
  location.hash = "home";
  startServices();
}

function profileForm(p) {
  const field = (key, type = "text", attrs = {}) => h("label", { class: "field" }, h("span", {}, t(`f_${key}`)),
    h("input", { name: key, type, value: p[key] ?? "", ...attrs }));
  const counter = (key) => {
    const input = h("input", { name: key, type: "number", min: 0, max: 99, value: p[key] || 0, inputmode: "numeric", "aria-label": t(`f_${key}`) });
    const step = (d) => { input.value = Math.max(0, Math.min(99, Number(input.value || 0) + d)); };
    return h("div", { class: "field counter" }, h("span", {}, t(`f_${key}`)),
      h("div", { class: "stepper" },
        h("button", { type: "button", "aria-label": "minus", onclick: () => step(-1) }, icon("remove")), input,
        h("button", { type: "button", "aria-label": "plus", onclick: () => step(1) }, icon("add"))));
  };
  const contacts = [0, 1, 2].map((i) => h("div", { class: "contact" },
    h("input", { name: `cname${i}`, placeholder: t("f_contact_name"), "aria-label": t("f_contact_name"), value: p.contacts?.[i]?.name || "" }),
    h("input", { name: `cphone${i}`, placeholder: t("f_contact_phone"), "aria-label": t("f_contact_phone"), type: "tel", value: p.contacts?.[i]?.phone || "" })));
  const el = h("form", { class: "form", onsubmit: (e) => e.preventDefault() },
    field("name", "text", { autocomplete: "name" }), field("phone", "tel", { autocomplete: "tel" }),
    h("div", { class: "counters" }, counter("people"), counter("elderly"), counter("children"), counter("pregnant"), counter("disabled")),
    h("label", { class: "field" }, h("span", {}, t("f_medical")), h("textarea", { name: "medical", rows: 2 }, p.medical || "")),
    h("div", {}, h("h3", { style: { marginTop: "8px" } }, t("f_contacts")), h("div", { class: "stack" }, contacts)));
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
  const firstName = getProfile().name.trim().split(" ")[0];
  const today = new Date().toLocaleDateString(speechLang(), { weekday: "long", day: "numeric", month: "long" });
  fill(view,
    h("header", { class: "greet" }, h("p", {}, today), h("h1", {}, firstName ? `${t("hello")}, ${firstName}` : t("hello"))),
    h("div", { id: "weather" }),
    h("div", { id: "alerts" }),
    s ? sosCard(s) : null,
    h("section", { class: "hero" },
      h("button", { class: "sos-btn", "aria-label": t("sos"), onclick: () => startDanger({ trigger: "sos", onLeftover: askLeftovers }) },
        h("span", { class: "sos-text" }, t("sos")), h("span", { class: "sos-sub" }, t("sos_sub"))),
      h("p", { id: "locline", class: "locline" })),
    h("div", { class: "tiles" },
      tile("forum", "blue", t("tile_chat"), "chat"), tile("menu_book", "green", t("tile_guides"), "guides"),
      tile("map", "orange", t("tile_map"), "map"), tile("explore", "purple", t("tile_compass"), "camps"),
      tile("flashlight_on", "red", t("tile_strobe"), "tools"), tile("call", "teal", t("tile_help"), "help")),
    h("section", { id: "official", class: "official" }),
    h("a", { class: "tour-link", href: "#tour" }, h("span", { class: "chip-ic" }, icon("task_alt")), h("span", {}, t("tour")), h("span", { class: "end" }, icon("chevron_right"))),
  );
  renderAlerts();
  renderOfficial();
  refreshWeather();
  updateLocLine();
}
const tile = (ic, tint, text, to) => h("a", { class: "tile", href: `#${to}` }, h("span", { class: `chip-ic ${tint}` }, icon(ic)), h("span", {}, text));

function renderAlerts() {
  const box = $("#alerts");
  if (!box) return;
  fill(box, alerts.map((a) => h("div", { class: `alert ${a.severity}` }, icon("warning"),
    h("div", {}, h("b", {}, `${t("issued_by", { who: a.issuer || "Control room" })}${a.demo ? ` (${t("demo")})` : ""}`), pick(a.message)))));
}

function updateLocLine() {
  const el = $("#locline");
  if (!el) return;
  const l = lastLocation();
  const text = locationDenied() ? t("loc_denied") : l ? t("loc_saved", { ago: timeAgo(l.locatedAt, t), acc: l.accuracyM }) : t("loc_none");
  fill(el, icon("location_on"), h("span", {}, text));
}

function sosCard(s) {
  const active = isActive(s);
  const steps = ["st_saved", "st_received", "st_dispatched", "st_rescued"];
  const reached = !s.delivered ? 0 : s.status === "dispatched" ? 2 : s.status === "rescued" ? 3 : 1;
  return h("div", { class: `card sos-card ${s.status}` },
    h("div", { class: "row between" }, h("h2", {}, icon("siren"), t("sos_status")), h("span", { class: "badge" }, statusText(s))),
    s.status !== "cancelled" ? h("ol", { class: "track" }, steps.map((k, i) => h("li", { class: i <= reached ? "done" : "" }, t(k)))) : null,
    h("p", { class: "muted small" }, timeAgo(s.createdAt, t), !s.delivered ? ` · ${t("sos_saved_offline")}` : ""),
    active ? h("div", { class: "stack", style: { marginTop: "16px" } },
      h("a", { class: "btn", href: smsLink(s) }, label("sms", t("sms_sos"))),
      h("button", { class: "btn ghost", onclick: () => { if (confirm(t("cancel_sos_q"))) cancelSos(); } }, t("cancel_sos")))
      : h("button", { class: "btn wide", onclick: () => clearFinishedSos() }, t("close")));
}

// ---------------- chat ----------------
function chatContext() {
  const loc = lastLocation();
  const camp = loc ? nearestCamp(loc) : null;
  const s = activeSos();
  return {
    alerts: [...alerts.map((a) => `${a.issuer || "Control room"}: ${a.message.en}`), ...official.slice(0, 3).map((a) => `${a.issuer}: ${a.title}`)],
    weather: ls.get("aa.weather")?.data || null,
    nearestCamp: camp ? { name: camp.c.name, km: Math.round(camp.km * 10) / 10, demo: true } : null,
    sosStatus: s ? (s.delivered ? s.status : "saved on phone, not yet delivered") : "no SOS",
    sosActive: isActive(s),
    sosAnswers: isActive(s) ? s.answers : null,
    location: loc ? "known" : "unknown",
  };
}

function renderChatView(view) {
  const tab = ls.get("aa.chatTab", "ai");
  const body = h("div", { class: "chat-wrap" });
  const seg = h("div", { class: "tabs seg", role: "tablist" },
    [["ai", "forum", t("chat_title")], ["people", "groups", t("tab_people")]].map(([id, ic, text]) => h("button", {
      class: `tab ${tab === id ? "on" : ""}`, role: "tab", "aria-selected": String(tab === id),
      onclick: () => { ls.set("aa.chatTab", id); renderChatView(view); },
    }, icon(ic), text)));
  fill(view, seg, body);
  if (tab === "people") return renderPeople(body);
  renderChat(body, { getContext: chatContext, goto });
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
  const tabs = h("div", { class: "tabs", role: "tablist" }, Object.keys(GUIDES).map((k) => h("button", {
    class: `tab ${k === hz ? "on" : ""}`, "data-id": k, role: "tab",
    onclick: () => { hz = k; tabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.id === hz)); draw(); },
  }, icon(GUIDES[k].icon), t(`hz_${k}`))));
  const draw = () => fill(body, ["before", "during", "after"].map((ph) => {
    const items = pick(GUIDES[hz][ph]);
    return h("section", { class: `card guide ${ph}` },
      h("div", { class: "row between" }, h("h2", {}, h("span", { class: "dot-mark" }), t(ph)),
        h("button", { class: "icon-btn", "aria-label": t("read_aloud"), onclick: () => speak(`${t(ph)}. ${items.join(". ")}`) }, icon("volume_up"))),
      h("ol", { class: "steps" }, items.map((x) => h("li", {}, x))));
  }));
  fill(view, h("h1", {}, t("guides_title")), tabs, body);
  draw();
}

// ---------------- helplines (PRD F8) ----------------
const HELPLINES = [
  ["112", "sos", "red"], ["108", "ambulance", "red"], ["101", "emergency", "orange"], ["1070", "health_and_safety", "blue"], ["1077", "health_and_safety", "blue"],
  ["1078", "campaign", "blue"], ["1091", "person", "purple"], ["1098", "child_care", "purple"], ["14416", "sentiment_satisfied", "green"],
];
function renderHelp(view) {
  fill(view, h("h1", {}, t("help_title")), h("p", { class: "muted" }, t("help_hint")),
    h("div", { class: "list" }, HELPLINES.map(([n, ic, tint]) => listRow({
      href: `tel:${n}`, ic, tint, title: h("span", { class: "num" }, n), sub: t(`h${n}`), end: icon("call"), chevron: false,
    }))));
}

// ---------------- camps and compass (PRD F11) ----------------
function nearestCamp(loc) {
  return CAMPS.map((c) => ({ c, km: distanceKm(loc, c) })).sort((a, b) => a.km - b.km)[0];
}

function renderCamps(view) {
  const loc = lastLocation();
  const arrow = h("div", { class: "arrow" }, icon("navigation"));
  const words = h("p", { class: "big" });
  const list = loc ? CAMPS.map((c) => ({ c, km: distanceKm(loc, c) })).sort((a, b) => a.km - b.km) : CAMPS.map((c) => ({ c, km: null }));
  const target = list[0];
  fill(view,
    h("h1", {}, t("camps_title")),
    h("p", { class: "notice" }, icon("info"), h("span", {}, t("camps_demo"))),
    loc ? h("section", { class: "card compass-card", style: { marginTop: "16px" } },
      h("p", { class: "muted small", style: { margin: 0 } }, t("nearest")),
      h("h2", {}, target.c.name),
      h("div", { class: "compass" }, h("div", { class: "ring" }, h("span", { class: "n" }, "N")), arrow),
      words, h("p", { class: "muted small", style: { margin: 0 } }, t("compass_hint"))) : h("p", { class: "notice", style: { marginTop: "12px" } }, icon("location_on"), h("span", {}, t("loc_none"))),
    h("div", { class: "list" }, list.map(({ c, km }) => listRow({
      href: `https://maps.google.com/?q=${c.lat},${c.lon}`, ic: "camping", tint: "green", title: c.name,
      sub: `${t("capacity", { n: c.capacity })} · ${c.facilities.join(", ")}`, end: km !== null ? t("km_away", { km: km.toFixed(1) }) : null, chevron: false,
    }))));
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
  const wBtn = h("button", { class: "btn wide big-btn", onclick: () => {
    whistling = !whistling; whistle(whistling);
    fill(wBtn, whistling ? label("stop_circle", t("stop")) : label("sports", t("whistle_start")));
  } }, label("sports", t("whistle_start")));
  fill(view, h("h1", {}, t("tools_title")), h("p", { class: "lead" }, t("tools_hint")),
    h("button", { class: "btn primary wide big-btn", onclick: () => strobe(true) }, label("flashlight_on", t("strobe_start"))), wBtn);
  window.addEventListener("hashchange", () => whistle(false), { once: true });
}

// ---------------- more ----------------
function renderMore(view) {
  fill(view,
    h("h1", {}, t("more_title")),
    h("div", { class: "list" },
      listRow({ href: "#profile", ic: "manage_accounts", tint: "blue", title: t("my_details") }),
      listRow({ href: "#help", ic: "call", tint: "teal", title: t("tile_help") }),
      listRow({ href: "#camps", ic: "explore", tint: "purple", title: t("tile_compass") }),
      listRow({ href: "#tools", ic: "flashlight_on", tint: "red", title: t("tile_strobe") }),
      listRow({ href: "#tour", ic: "task_alt", tint: "orange", title: t("tour") })),
    h("h3", {}, t("language")),
    langList(route),
    h("button", { class: "btn tint wide", style: { marginTop: "8px" }, onclick: () => { if (confirm(`${t("delete_chats")}?`)) deleteChats(); } }, label("delete", t("delete_chats"))));
}

// ---------------- feature tour (for judges) ----------------
function renderTourView(view) {
  renderTour(view, {
    goto,
    setLanguage: (id) => { setLang(id); settings.lang = id; renderShell(); route(); prepareDangerVoices(); },
    resetDemo,
  });
}

/** Clears everything this phone saved and shows the intro again. */
function resetDemo() {
  simulateOffline(false);
  try { localStorage.clear(); indexedDB.deleteDatabase("apadaAlert"); } catch { /* ignore */ }
  location.hash = "";
  location.reload();
}

/** For judges: skips the intro with sample details and opens the feature tour. */
function startWithSampleData() {
  setProfile({ ...EMPTY_PROFILE, name: "Demo User", phone: "9000000000", people: 4, elderly: 1, children: 1, contacts: [{ name: "Demo Contact", phone: "9000000001" }] });
  getPosition({ maxAge: 0 });
  finishIntro();
  goto("tour");
}

function renderProfile(view) {
  const form = profileForm(getProfile());
  fill(view, h("h1", {}, t("my_details")), h("p", { class: "muted" }, t("details_b")), form.el,
    h("button", { class: "btn primary wide", style: { marginTop: "24px" }, onclick: () => { setProfile(form.read()); toast(t("saved")); goto("more"); } }, t("save")));
}

init();

// Register the service worker so the app opens without a network (PRD F1)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
