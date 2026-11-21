// People nearby (PRD F19): a simple chat with others within 30 km during a disaster.
// Works over the internet now. The Android app (Phase 3) adds the same chat over Bluetooth, with no internet.
import { t } from "./i18n.js";
import { h, fill, toast, timeAgo } from "./ui.js";
import { icon, label } from "./icons.js";
import { api, queue, isOnline } from "./net.js";
import { deviceId, getProfile, uid, ls } from "./state.js";
import { lastLocation, getPosition } from "./location.js";
import { startDanger } from "./danger.js";
import { askLeftovers } from "./chat.js";

const QUICK = [
  { kind: "safe", ic: "check_circle", chip: "chip_safe", text: "qp_safe" },
  { kind: "help", ic: "sos", chip: "chip_help", text: "qp_help" },
  { kind: "need", ic: "water_drop", chip: "chip_need", text: "qp_need" },
  { kind: "offer", ic: "directions_boat", chip: "chip_offer", text: "qp_offer" },
  { kind: "road", ic: "flood", chip: "rt_road_flooded", text: "qp_road" },
];
const KIND_ICON = Object.fromEntries(QUICK.map((q) => [q.kind, q.ic]));

export function renderPeople(root) {
  const loc = lastLocation();
  if (!loc) {
    fill(root,
      h("p", { class: "notice" }, icon("location_on"), h("span", {}, t("need_location_chat"))),
      h("button", { class: "btn primary wide", onclick: async () => { await getPosition({ maxAge: 0 }); renderPeople(root); } }, label("my_location", t("allow_loc"))));
    return;
  }

  let radius = 30;
  let shown = [];
  const list = h("div", { class: "chat-list people-list", "aria-live": "polite" });
  const note = h("p", { class: "muted small people-note" });
  const input = h("textarea", { class: "chat-input", rows: 1, maxlength: 280, placeholder: t("people_ph"), "aria-label": t("people_ph") });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); post(input.value, "msg"); } });

  fill(root, h("div", { class: "chat people" },
    note,
    list,
    h("div", { class: "chat-foot" },
      h("div", { class: "quick-row" }, QUICK.map((q) => h("button", { class: "chip", onclick: () => post(t(q.text), q.kind) }, icon(q.ic), t(q.chip)))),
      h("div", { class: "chat-bar" }, input, h("button", { class: "icon-btn send", "aria-label": "Send", onclick: () => post(input.value, "msg") }, icon("send"))))));

  const pending = () => ls.get("aa.peoplePending", []);
  const setPending = (p) => ls.set("aa.peoplePending", p.slice(-20));

  function draw() {
    note.replaceChildren(icon("lock"), " ", t("people_note", { km: radius }), h("br"), h("span", { class: "mesh" }, icon("wifi_off"), " ", t("mesh_note")));
    const sentIds = new Set(shown.map((m) => m.id));
    const waiting = pending().filter((m) => !sentIds.has(m.id)).map((m) => ({ ...m, mine: true, waiting: true }));
    const all = [...shown, ...waiting];
    if (!all.length) return fill(list, h("p", { class: "muted center people-empty" }, t("people_empty")));
    fill(list, all.map((m) => {
      const who = m.mine ? t("you") : `${m.name} #${m.tag}`;
      const meta = [who, m.mine ? null : t("km_away", { km: m.km }), m.waiting ? t("st_saved") : timeAgo(m.at, t)].filter(Boolean).join(" · ");
      return h("div", { class: `pmsg ${m.mine ? "me" : ""} kind-${m.kind}` },
        h("div", { class: "pmeta" }, KIND_ICON[m.kind] ? icon(KIND_ICON[m.kind]) : null, h("span", {}, meta),
          !m.mine ? h("button", { class: "flag-btn", "aria-label": t("report_msg"), title: t("report_msg"), onclick: () => report(m) }, icon("flag")) : null),
        h("div", { class: "msg-text" }, m.text));
    }));
    list.scrollTop = list.scrollHeight;
  }

  async function load() {
    if (!isOnline()) return draw();
    try {
      const l = lastLocation() || loc;
      const r = await api(`community?lat=${l.lat}&lon=${l.lon}&deviceId=${encodeURIComponent(deviceId())}`, { timeout: 8000 });
      radius = r.radiusKm || radius;
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      shown = r.messages;
      // forget pending copies the server now has
      const ids = new Set(shown.map((m) => m.id));
      setPending(pending().filter((m) => !ids.has(m.id)));
      draw();
      if (!atBottom) list.scrollTop = list.scrollHeight;
    } catch { draw(); }
  }

  async function post(raw, kind) {
    const text = (raw || "").trim();
    if (!text) return;
    input.value = "";
    const l = lastLocation() || loc;
    const name = getProfile().name.trim().split(" ")[0] || t("neighbour");
    const msg = { id: uid(), deviceId: deviceId(), name, text, kind, lat: l.lat, lon: l.lon, language: document.documentElement.lang || "en", at: new Date().toISOString() };
    setPending([...pending(), msg]);
    draw();
    await queue(`community:${msg.id}`, "community", msg);
    if (!isOnline()) toast(t("msg_queued"));
    setTimeout(load, 800);
    // Asking neighbours for help is good; telling rescuers is better. Offer the SOS questions too.
    if (kind === "help") startDanger({ trigger: "button", onLeftover: askLeftovers });
  }

  async function report(m) {
    if (!confirm(`${t("report_msg")}?`)) return;
    try { await api(`community/${m.id}/report`, { method: "POST", body: { deviceId: deviceId() } }); toast(t("reported")); } catch { /* ignore */ }
  }

  draw();
  load();
  const timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); load(); }, 5000);
}
