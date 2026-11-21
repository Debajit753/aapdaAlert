// Danger mode: one tap-only question at a time (PRD F6).
import { QUESTIONS, MAX_TAP_QUESTIONS } from "../data/questions.js";
import { GUIDES, EXTRA_STEPS } from "../data/guides.js";
import { t, pick, getLang } from "./i18n.js";
import { h, overlay, toast, fill } from "./ui.js";
import { api, queue, isOnline } from "./net.js";
import { deviceId, hasProfile, getProfile, profileCounts, addChat, getChat, uid } from "./state.js";
import { startSos, updateSos, activeSos, isActive, smsLink } from "./sos.js";
import { speak, listen, canListen, stopSpeaking } from "./voice.js";
import { strobe } from "./tools.js";

let questions = QUESTIONS;
/** Uses the newest list from the server if one was saved (PRD F6, saved question list). */
export function setQuestions(list) { if (Array.isArray(list) && list.length) questions = list; }
export const questionById = (id) => questions.find((q) => q.id === id);

function questionText(q) {
  return pick(q.text).replace("{n}", getProfile().people || "");
}

/** Saves a message on the phone and sends it to the server when possible. */
export function logChat(msg) {
  const m = { id: uid(), at: new Date().toISOString(), sentOffline: !isOnline(), ...msg };
  addChat(m);
  queue(`chat:${m.id}`, "chat/sync", { deviceId: deviceId(), messages: [m] });
  window.dispatchEvent(new CustomEvent("chat-change"));
  return m;
}

let running = false;

/**
 * Starts danger mode.
 * trigger: "sos" (SOS button: the SOS is sent first and question 1 is skipped), "button", "chat" or "alert".
 */
export async function startDanger({ trigger = "button", hazardHint = null, onLeftover } = {}) {
  if (running) return;
  running = true;
  const answers = {};
  if (hazardHint && ["flood", "landslide", "earthquake"].includes(hazardHint)) answers.hazard = hazardHint;
  let sosStarted = false;
  let taps = 0;

  if (trigger === "sos" || isActive()) {
    answers.inDanger = "now";
    const s = await startSos({ source: "app", answers: { ...answers }, hazard: answers.hazard });
    sosStarted = true;
    Object.assign(answers, s?.answers || {});
  }

  const body = h("div", { class: "danger" });
  const close = overlay(body, { className: "danger-layer", onClose: () => { running = false; stopSpeaking(); } });

  const eligible = (q) => {
    if (answers[q.id] !== undefined) return false;
    if (q.onlyForHazard && answers.hazard !== q.onlyForHazard) return false;
    if (q.needsProfile && !hasProfile()) return false;
    if (q.noProfile && hasProfile()) return false;
    return true;
  };
  const remaining = () => questions.filter(eligible).map((q) => q.id);

  async function chooseNext(rem) {
    // Gemini picks the next question, skipping anything already known. 4-second limit, then the fixed order.
    if (!isOnline() || rem.length <= 1) return { id: rem[0] };
    try {
      const r = await api("companion", {
        method: "POST", timeout: 4000,
        body: { kind: "next", language: getLang(), remaining: rem, answers, profileCounts: profileCounts(), history: getChat().slice(-8) },
      });
      if (r.next === "done") return { id: null };
      if (rem.includes(r.next)) return { id: r.next, text: r.text };
    } catch { /* fall back */ }
    return { id: rem[0] };
  }

  async function next() {
    const rem = remaining();
    if (!rem.length || taps >= MAX_TAP_QUESTIONS) return finish(rem);
    body.replaceChildren(h("div", { class: "danger-wait" }, h("div", { class: "spinner" })));
    const pickNext = rem[0] === "inDanger" ? { id: "inDanger" } : await chooseNext(rem);
    if (!running) return;
    if (!pickNext.id) return finish([]);
    show(questionById(pickNext.id), pickNext.text, Math.min(MAX_TAP_QUESTIONS, taps + rem.length));
  }

  function show(q, customText, total) {
    const text = customText || questionText(q);
    logChat({ role: "companion", text, mode: "danger", questionId: q.id, sosId: activeSos()?.id || null });
    const chosen = new Set();
    const optionBtn = (o) => h("button", {
      class: "opt", "data-id": o.id,
      onclick: (e) => {
        if (q.multi) {
          if (o.id === "none") chosen.clear(); else chosen.delete("none");
          chosen.has(o.id) ? chosen.delete(o.id) : chosen.add(o.id);
          body.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", chosen.has(b.dataset.id)));
        } else answer(q, o.id);
      },
    }, h("span", { class: "opt-icon" }, o.icon), h("span", {}, pick(o.label)));

    fill(body,
      h("div", { class: "danger-top" },
        h("div", { class: "dots" }, Array.from({ length: total }, (_, i) => h("span", { class: i < taps ? "dot done" : i === taps ? "dot now" : "dot" }))),
        h("p", { class: "danger-hint" }, sosStarted ? `✅ ${t("danger_hint")}` : t("danger_hint_pre"))),
      h("h2", { class: "danger-q" }, text),
      q.multi ? h("p", { class: "muted" }, t("tap_all_done")) : null,
      h("div", { class: "opts" }, q.options.map(optionBtn)),
      q.multi ? h("button", { class: "btn primary wide", onclick: () => chosen.size && answer(q, [...chosen]) }, t("done")) : null,
      canListen() ? h("button", { class: "btn ghost wide", onclick: () => speakAnswer(q) }, `🎤 ${t("speak_instead")}`) : null,
      h("div", { class: "danger-actions" },
        h("a", { class: "btn call", href: "tel:112" }, `📞 ${t("call112")}`),
        !sosStarted ? h("button", { class: "btn sos-small", onclick: async () => { answers.inDanger = "now"; await startSos({ answers: { ...answers }, hazard: answers.hazard }); sosStarted = true; toast(t("sos_sent_now")); next(); } }, `🆘 ${t("send_sos_now")}`) : null),
    );
    speak(`${text} ${q.options.map((o) => pick(o.label)).join(", ")}`);
  }

  async function speakAnswer(q) {
    const heard = await listen();
    if (heard?.unsupported) return toast(t("voice_unsupported"));
    if (!heard) return;
    const said = heard.toLowerCase();
    const match = q.options.find((o) => Object.values(o.label).some((l) => said.includes(l.toLowerCase()) || l.toLowerCase().includes(said)));
    if (match) answer(q, q.multi ? [match.id] : match.id);
    else toast(`"${heard}"`);
  }

  async function answer(q, value) {
    answers[q.id] = value;
    taps++;
    const labels = (Array.isArray(value) ? value : [value]).map((v) => pick(q.options.find((o) => o.id === v)?.label));
    logChat({ role: "user", text: labels.join(", "), mode: "danger", questionId: q.id, answerIds: [].concat(value), sosId: activeSos()?.id || null });

    if (q.id === "inDanger") {
      if (value === "now") {
        await startSos({ answers: { ...answers }, hazard: answers.hazard });
        sosStarted = true;
        toast(t("sos_sent_now"));
      } else if (value === "worried") {
        close(); return showSteps({ answers, worried: true });
      } else {
        close(); return;
      }
    } else if (sosStarted) {
      await updateSos({ answers: { [q.id]: value }, hazard: q.id === "hazard" ? value : undefined });
    }
    next();
  }

  function finish(leftover) {
    close();
    showSteps({ answers, worried: false });
    if (leftover.length && onLeftover) onLeftover(leftover);
  }

  next();
}

// ---------- "Do this now" ----------
function fallbackSteps(answers) {
  const lang = getLang();
  const g = GUIDES[answers.hazard] || GUIDES.flood;
  const steps = [];
  if (answers.injured === "bad" || answers.canMove === "stuck" || answers.waterLevel === "chest") steps.push(EXTRA_STEPS.call112[lang]);
  if (answers.injured === "bad" || answers.injured === "slight") steps.push(EXTRA_STEPS.injured[lang]);
  if (answers.canMove === "stuck") steps.push(EXTRA_STEPS.stuck[lang]);
  const p = getProfile();
  if ((Array.isArray(answers.cannotMove) && answers.cannotMove.some((x) => x !== "none")) || p.elderly || p.children || p.pregnant || p.disabled) steps.push(EXTRA_STEPS.vulnerable[lang]);
  for (const s of g.during[lang] || g.during.en) if (steps.length < 5) steps.push(s);
  return steps.slice(0, 5);
}

function fallbackSms(answers) {
  const s = activeSos();
  const p = getProfile();
  const loc = s?.lat != null ? `${s.lat},${s.lon}` : "";
  return `SOS ${answers.hazard && answers.hazard !== "unknown" ? answers.hazard : ""} ${p.people ? p.people + " people" : ""} ${answers.injured === "bad" ? "injured" : ""} ${answers.canMove === "stuck" ? "stuck" : ""} ${loc}`.replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function showSteps({ answers, worried }) {
  const box = h("div", { class: "card dothis" }, h("div", { class: "spinner" }));
  const close = overlay(box, { className: "sheet" });
  let steps = null, sms = null, fromAi = false;
  if (isOnline()) {
    try {
      const r = await api("companion", { method: "POST", timeout: 7000, body: { kind: "steps", language: getLang(), answers, profileCounts: profileCounts(), history: getChat().slice(-8) } });
      if (Array.isArray(r.steps) && r.steps.length) { steps = r.steps; sms = r.sms; fromAi = true; }
    } catch { /* use saved steps */ }
  }
  if (!steps) { steps = fallbackSteps(answers); sms = fallbackSms(answers); }
  const read = () => speak(`${t("dothis")}. ${steps.join(". ")}`);
  fill(box,
    h("h2", {}, `⚡ ${t("dothis")}`),
    worried ? h("p", { class: "notice" }, t("worried_msg")) : null,
    h("ol", { class: "steps" }, steps.map((s) => h("li", {}, s))),
    h("p", { class: "muted small" }, fromAi ? t("steps_ai") : t("steps_saved")),
    h("div", { class: "grid2" },
      h("a", { class: "btn call", href: "tel:112" }, `📞 ${t("call112")}`),
      h("button", { class: "btn", onclick: read }, `🔊 ${t("read_aloud")}`),
      h("button", { class: "btn", onclick: async () => { try { await navigator.clipboard.writeText(sms); toast(t("copied")); } catch { toast(sms, 8000); } } }, `✉️ ${t("copy_sms")}`),
      h("button", { class: "btn", onclick: () => strobe(true) }, `🔦 ${t("strobe")}`),
      isActive() ? h("a", { class: "btn", href: smsLink() }, `📨 ${t("sms_sos")}`) : null,
      worried ? h("button", { class: "btn sos-small", onclick: async () => { close(); await startDanger({ trigger: "sos" }); } }, `🆘 ${t("send_sos_now")}`) : null),
    h("button", { class: "btn ghost wide", onclick: () => close() }, t("close")),
  );
  read();
}
