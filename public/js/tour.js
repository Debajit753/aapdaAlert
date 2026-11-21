// Feature tour: one card per feature, each with a button that shows it working.
// Written for hackathon judges and first-time visitors, so it is in English.
import { h, fill, toast } from "./ui.js";
import { icon, label } from "./icons.js";
import { LANGS, getLang } from "./i18n.js";
import { simulateOffline, isSimOffline } from "./net.js";
import { activeSos, isActive, checkNow } from "./sos.js";
import { startDanger } from "./danger.js";
import { askLeftovers } from "./chat.js";
import { strobe } from "./tools.js";
import { flyDemoHelicopter } from "./demo.js";

export function renderTour(view, { goto, setLanguage, resetDemo }) {
  const card = ({ ic, tint, title, text, action }) => h("section", { class: "tour-card" },
    h("div", { class: "tour-head" }, h("span", { class: `chip-ic ${tint}` }, icon(ic)), h("h2", {}, title)),
    h("p", {}, text),
    action);
  const btn = (ic, text, onclick, cls = "") => h("button", { class: `btn ${cls}`, onclick }, label(ic, text));
  const link = (ic, text, href) => h("a", { class: "btn", href, target: "_blank", rel: "noopener" }, label(ic, text));

  // Simulated network drop
  const netState = h("span", { class: "muted small" });
  const netSwitch = h("button", { class: "switch", role: "switch", "aria-label": "Simulate no network", onclick: () => { simulateOffline(!isSimOffline()); drawNet(); } }, h("span"));
  const drawNet = () => {
    const off = isSimOffline();
    netSwitch.classList.toggle("on", off);
    netSwitch.setAttribute("aria-checked", String(off));
    netState.textContent = off ? "Network is off (simulated). Send an SOS now, then switch this off." : "Network is on.";
  };
  drawNet();

  // Demo helicopter
  const heliState = h("span", { class: "muted small" });
  const fly = async () => {
    const s = activeSos();
    if (!isActive(s) || !s.delivered) return toast("Send an SOS first (card 1). The helicopter flies to people with an active SOS.");
    if (s.lat == null) return toast("Your SOS has no location yet. Allow location and try again.");
    heliState.textContent = "Helicopter launched, 12 km away…";
    flyDemoHelicopter({ lat: s.lat, lon: s.lon }, (km) => {
      heliState.textContent = km > 0.3 ? `Helicopter is ${km.toFixed(1)} km away` : "Helicopter is overhead";
      checkNow();
    });
  };

  fill(view,
    h("h1", {}, "Feature tour"),
    h("p", { class: "lead" }, "One card per feature. Tap a button to see it working. Start with card 1."),

    h("h3", {}, "The core story"),
    card({ ic: "siren", tint: "red", title: "1. Send first, ask after",
      text: "Tapping SOS sends your location and household details at once. The quick questions then add detail to the same SOS, so nothing waits on the answers.",
      action: btn("siren", "Send a demo SOS", () => startDanger({ trigger: "sos", onLeftover: askLeftovers }), "primary") }),
    card({ ic: "task_alt", tint: "orange", title: "2. Tap-only danger questions",
      text: "At most 6 questions with big buttons, read aloud, with a back button to change an answer. They come from a list saved on the phone, so they work when the AI or the network is down.",
      action: btn("task_alt", "Open the questions", () => startDanger({ trigger: "button", onLeftover: askLeftovers })) }),
    card({ ic: "forum", tint: "blue", title: "3. AI companion",
      text: "Chat by voice or text in four languages. Type \"water is coming into my house\" and it switches to the quick questions by itself. Needs the Gemini key to chat.",
      action: btn("forum", "Open the companion", () => goto("chat")) }),

    h("h3", {}, "When things go wrong"),
    card({ ic: "wifi_off", tint: "orange", title: "4. Network drop protection",
      text: "Switch the network off here, send an SOS, and it shows \"Saved on phone\". Switch it back on and the SOS sends itself, with no duplicate.",
      action: h("div", { class: "switch-row" }, h("div", { class: "grow" }, h("b", {}, "Simulate no network"), h("br"), netState), netSwitch) }),
    card({ ic: "helicopter", tint: "blue", title: "5. Rescue helicopter alert",
      text: "A demo helicopter flies toward your SOS. You get \"Get ready\" at 10 km, then \"Signal now!\" at 3 km with the strobe and whistle. Takes about 40 seconds.",
      action: h("div", { class: "stack" }, btn("helicopter", "Fly the demo helicopter", fly, "blue"), heliState) }),
    card({ ic: "flashlight_on", tint: "red", title: "6. Strobe and whistle",
      text: "The screen flashes SOS in Morse code and the phone plays a rescue whistle, so a helicopter or boat crew can find you.",
      action: btn("flashlight_on", "Start the strobe", () => strobe(true, { withWhistle: true })) }),

    h("h3", {}, "For rescuers"),
    card({ ic: "health_and_safety", tint: "green", title: "7. Control room dashboard",
      text: "Live SOS map, a queue ranked by a fixed urgency score with its breakdown, a one-line AI reason, the person's chat history, status updates and alerts translated by AI.",
      action: link("open_in_new", "Open the dashboard", "/dashboard") }),
    card({ ic: "share_location", tint: "green", title: "8. Crew page",
      text: "The rescue crew shares its position from a phone and sees the nearest SOS requests with distance, direction and urgency.",
      action: link("open_in_new", "Open the crew page", "/crew") }),

    h("h3", {}, "Around you"),
    card({ ic: "account_balance", tint: "orange", title: "Official alerts and weather",
      text: "Home shows live government alerts for North East India from SACHET (NDMA: IMD, CWC, state disaster authorities) with who issued them, plus the weather where you are and a heavy-rain warning.",
      action: btn("home", "Open Home", () => goto("home")) }),
    card({ ic: "groups", tint: "blue", title: "People nearby",
      text: "In Companion, a second tab lets people within 30 km talk to each other: \"I'm safe\", \"Need water\", \"Have a boat\". Messages can be reported, and the control room sees them too.",
      action: btn("groups", "Open People nearby", () => { try { localStorage.setItem("aa.chatTab", JSON.stringify("people")); } catch { /* ignore */ } goto("chat"); }) }),
    card({ ic: "map", tint: "orange", title: "9. Hazard map and reports",
      text: "Report a flooded road or landslide with a photo. Reports close to each other merge into \"Confirmed by N reports\", and Gemini checks the photo.",
      action: btn("map", "Open the map", () => goto("map")) }),
    card({ ic: "explore", tint: "purple", title: "10. Relief camps and compass",
      text: "An arrow points to the nearest relief camp using GPS and the phone's compass. It keeps working without a network.",
      action: btn("explore", "Open the compass", () => goto("camps")) }),
    card({ ic: "menu_book", tint: "green", title: "11. Safety guides and helplines",
      text: "Flood, landslide, earthquake and lightning guides (before, during, after), plus first aid (bleeding, not breathing, burns, snake bite), where to go if someone is hurt, safe water and an emergency bag checklist. All read aloud, with tap-to-call helplines.",
      action: h("div", { class: "row", style: { marginTop: 0 } }, btn("menu_book", "Guides", () => goto("guides")), btn("call", "Helplines", () => goto("help"))) }),
    card({ ic: "language", tint: "teal", title: "12. Four languages",
      text: "The whole app, the questions, the guides and the alerts work in English, Hindi, Assamese and Bengali.",
      action: h("div", { class: "lang-row" }, LANGS.map((l) => h("button", { class: `btn ${getLang() === l.id ? "primary" : ""}`, onclick: () => setLanguage(l.id) }, l.name))) }),

    h("h3", {}, "Start again"),
    h("button", { class: "btn tint wide", style: { marginTop: 0 }, onclick: () => { if (confirm("Clear this phone's demo data and show the intro again?")) resetDemo(); } }, label("refresh", "Reset the demo")),
  );
}
