// Voice input (speech recognition) and read aloud (speech synthesis). PRD F15.
import { speechLang, getLang } from "./i18n.js";

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => Boolean(Recognition);

/** Listens once. Resolves with the text, or null if nothing was heard or voice isn't available. */
export function listen(onState = () => {}) {
  return new Promise((resolve) => {
    if (!Recognition) return resolve(null);
    const r = new Recognition();
    r.lang = speechLang();
    r.interimResults = false;
    r.maxAlternatives = 1;
    let done = false;
    const finish = (v) => { if (!done) { done = true; onState(false); resolve(v); } };
    r.onresult = (e) => finish(e.results?.[0]?.[0]?.transcript || null);
    r.onerror = (e) => finish(e.error === "language-not-supported" ? { unsupported: true } : null);
    r.onend = () => finish(null);
    try { r.start(); onState(true); } catch { finish(null); }
  });
}

function bestVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const code = lang.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === code) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(code.split("-")[0]));
}

/** Reads text aloud in the current language, if the phone has a voice for it. */
export function speak(text) {
  if (!("speechSynthesis" in window) || !text) return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const lang = speechLang(getLang());
    u.lang = lang;
    const v = bestVoice(lang);
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}

export function stopSpeaking() { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
if ("speechSynthesis" in window) speechSynthesis.getVoices();
