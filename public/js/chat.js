// AI companion chat (PRD F6, companion mode). Chats are saved on the server when online.
import { t, getLang, pick } from "./i18n.js";
import { h, toast, fill } from "./ui.js";
import { icon, label } from "./icons.js";
import { api, isOnline, queue } from "./net.js";
import { deviceId, getChat, setChat, addChat, profileCounts, uid } from "./state.js";
import { startDanger, logChat, questionById } from "./danger.js";
import { updateSos, isActive } from "./sos.js";
import { speak, listen, canListen } from "./voice.js";
import { DANGER_WORDS, HAZARD_WORDS } from "../data/guides.js";

function looksLikeDanger(text) {
  const s = text.toLowerCase();
  return DANGER_WORDS.some((w) => s.includes(w.toLowerCase()));
}
function detectHazard(text) {
  const s = text.toLowerCase();
  for (const [hz, words] of Object.entries(HAZARD_WORDS)) if (words.some((w) => s.includes(w.toLowerCase()))) return hz;
  return null;
}

/** Leftover danger questions are asked in chat after the tap screen (PRD F6 rules). */
export function askLeftovers(ids) {
  for (const id of ids) {
    const q = questionById(id);
    if (q) logChat({ role: "companion", text: `${t("leftover_q")} ${pick(q.text)}`, mode: "danger", questionId: id, quick: true });
  }
}

let historyLoaded = false;

/** The companion's avatar: a friendly face in a speech bubble. */
const companion = (cls = "") => h("img", { class: `companion ${cls}`, src: "/icons/companion.svg", alt: "" });
/** A companion message with its avatar (or an empty space to keep bubbles lined up). */
const aiRow = (bubble, showAvatar) => h("div", { class: "msg-row" }, showAvatar ? companion() : h("span", { class: "companion gap" }), bubble);

export function renderChat(root, { getContext, goto }) {
  const list = h("div", { class: "chat-list", "aria-live": "polite" });
  const input = h("textarea", { class: "chat-input", rows: 1, placeholder: t("chat_ph"), "aria-label": t("chat_ph") });
  const micBtn = h("button", { class: "icon-btn", "aria-label": "Mic", onclick: onMic }, icon("mic"));
  const sendBtn = h("button", { class: "icon-btn send", "aria-label": "Send", onclick: () => send(input.value) }, icon("send"));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } });

  root.replaceChildren(
    h("div", { class: "chat" },
      h("div", { class: "chat-head" },
        companion("big"),
        h("div", { class: "grow" },
          h("h1", {}, t("chat_title")),
          h("p", { class: "muted small" }, icon("lock"), h("span", {}, t("chat_saved_note"))))),
      list,
      h("div", { class: "chat-foot" },
        h("button", { class: "btn tint", onclick: () => startDanger({ trigger: "button", onLeftover: askLeftovers }) }, label("siren", t("im_in_danger"))),
        h("div", { class: "chat-bar" }, input, canListen() ? micBtn : null, sendBtn))),
  );

  function bubble(m, i, all) {
    const mine = m.role === "user";
    const answered = m.quick && all.slice(i + 1).some((x) => x.role === "user" && x.questionId === m.questionId);
    const q = m.quick && !answered ? questionById(m.questionId) : null;
    // The companion's face sits beside the last message of each run of its messages
    const lastOfRun = !all[i + 1] || all[i + 1].role === "user";
    const b = h("div", { class: `msg ${mine ? "me" : "ai"} ${m.mode === "danger" ? "danger-msg" : ""}` },
      h("div", { class: "msg-text" }, m.text),
      !mine && m.role !== "system" ? h("button", { class: "speak-btn", "aria-label": t("read_aloud"), onclick: () => speak(m.text) }, icon("volume_up")) : null,
      q ? h("div", { class: "quick" }, q.options.map((o) => h("button", {
        class: "chip",
        onclick: () => {
          logChat({ role: "user", text: pick(o.label), mode: "danger", questionId: q.id, answerIds: [o.id] });
          if (isActive()) updateSos({ answers: { [q.id]: q.multi ? [o.id] : o.id } });
          draw();
        },
      }, icon(o.icon), pick(o.label)))) : null);
    return mine ? b : aiRow(b, lastOfRun);
  }

  function draw() {
    const msgs = getChat();
    const items = msgs.length ? msgs.map((m, i) => bubble(m, i, msgs)) : [bubble({ role: "companion", text: t("chat_hello") }, 0, [])];
    fill(list, items);
    list.scrollTop = list.scrollHeight;
  }

  function note(text, withButtons = true) {
    list.append(aiRow(h("div", { class: "msg ai note" },
      h("div", { class: "msg-text" }, text),
      withButtons ? h("div", { class: "quick" },
        h("button", { class: "chip", onclick: () => startDanger({ trigger: "button", onLeftover: askLeftovers }) }, label("siren", t("ask_questions"))),
        h("button", { class: "chip", onclick: () => goto("guides") }, label("menu_book", t("tile_guides"))),
        h("button", { class: "chip", onclick: () => goto("help") }, label("call", t("tile_help")))) : null), true));
    list.scrollTop = list.scrollHeight;
  }

  async function send(raw) {
    const text = (raw || "").trim();
    if (!text) return;
    input.value = "";
    const danger = looksLikeDanger(text);
    const hazard = detectHazard(text);

    // Danger words are checked on the phone: switch to the tap questions at once, no waiting for the AI.
    // If an SOS is already active, rescuers have it, so the message goes to the companion as normal chat.
    const sosOpen = isActive();
    if ((danger && !sosOpen) || !isOnline()) {
      logChat({ role: "user", text, mode: "chat" });
      draw();
      if (danger && !sosOpen) return startDanger({ trigger: "chat", hazardHint: hazard, onLeftover: askLeftovers });
      return note(t("chat_offline"));
    }

    const msg = { id: uid(), at: new Date().toISOString(), role: "user", text, mode: "chat" };
    // Only real conversation goes in the history. The quick-question answers are sent once, in the context
    // (sosAnswers), so the AI doesn't keep replying to them.
    const history = getChat().filter((m) => m.mode === "chat" && m.text).slice(-10).map((m) => ({ role: m.role, text: m.text }));
    addChat(msg);
    draw();
    const typing = aiRow(h("div", { class: "msg ai typing" }, h("span"), h("span"), h("span")), true);
    list.append(typing); list.scrollTop = list.scrollHeight;
    try {
      const r = await api("companion", {
        method: "POST", timeout: 12000,
        body: { kind: "chat", deviceId: deviceId(), language: getLang(), message: msg, history, context: getContext(), profileCounts: profileCounts() },
      });
      typing.remove();
      addChat({ ...r.reply, mode: "chat" });
      draw();
      speak(r.reply.text, { waitMs: 0 });
      // New danger: open the quick questions, unless an SOS is already with the control room
      if (r.danger && !isActive()) startDanger({ trigger: "chat", hazardHint: r.hazard !== "none" ? r.hazard : hazard, onLeftover: askLeftovers });
    } catch (e) {
      typing.remove();
      // The message is kept on the phone and uploaded later if it never reached the server
      if (e.offline || e.timeout) queue(`chat:${msg.id}`, "chat/sync", { deviceId: deviceId(), messages: [{ ...msg, sentOffline: true }] });
      note(e.offline ? t("chat_offline") : t("chat_ai_off"));
    }
  }

  async function onMic() {
    micBtn.classList.add("on");
    input.placeholder = t("listening");
    const heard = await listen();
    micBtn.classList.remove("on");
    input.placeholder = t("chat_ph");
    if (heard?.unsupported) return toast(t("voice_unsupported"));
    if (heard) send(heard);
  }

  // Bring back saved history from the server the first time (PRD F6, where chats are saved)
  if (!historyLoaded && isOnline() && !getChat().length) {
    historyLoaded = true;
    api(`chat?deviceId=${encodeURIComponent(deviceId())}`).then((r) => {
      if (r.messages?.length && !getChat().length) { setChat(r.messages); draw(); }
    }).catch(() => {});
  }

  const onChange = () => { if (root.isConnected) draw(); else window.removeEventListener("chat-change", onChange); };
  window.addEventListener("chat-change", onChange);
  draw();
}

export async function deleteChats() {
  setChat([]);
  try { await api(`chat?deviceId=${encodeURIComponent(deviceId())}`, { method: "DELETE" }); } catch { /* the server copy is removed next time */ }
  window.dispatchEvent(new CustomEvent("chat-change"));
  toast(t("deleted"));
}
