// Voice input (speech recognition) and read aloud. PRD F15.
// Reading aloud uses the Gemini AI voice in the person's own language when it can, and saves the audio
// on the phone so it plays again without a network. Otherwise it falls back to the phone's built-in voice.
import { speechLang, getLang } from "./i18n.js";
import { apiUrl } from "./apiurl.js";

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => Boolean(Recognition);
const VOICE_CACHE = "aa-voice";

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

// ---------- AI voice ----------
const voiceUrl = (text, lang) => apiUrl(`voice?lang=${lang}&text=${encodeURIComponent(text)}`);
let current = null; // the Audio that is playing
let turn = 0;       // newer speak() calls cancel older ones

async function fromCache(url) {
  try { return await (await caches.open(VOICE_CACHE)).match(url); } catch { return null; }
}

/** Gets the AI voice for this text: from the phone first, then from the server. Returns a Blob or null. */
async function aiVoice(text, lang, waitMs) {
  const url = voiceUrl(text, lang);
  const hit = await fromCache(url);
  if (hit) return hit.blob();
  if (!navigator.onLine || waitMs <= 0) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(waitMs) });
    if (!res.ok) return null;
    try { await (await caches.open(VOICE_CACHE)).put(url, res.clone()); } catch { /* storage full */ }
    return res.blob();
  } catch { return null; }
}

/**
 * Reads text aloud in the current language.
 * Plays the AI voice if it is saved on the phone. waitMs > 0 also lets it fetch the AI voice from the server
 * for that long (used for the fixed danger phrases). Anything else uses the phone's own voice, because the
 * free AI voice allows only a few new phrases a day.
 */
export async function speak(text, { waitMs = 0 } = {}) {
  if (!text) return false;
  stopSpeaking();
  const mine = ++turn;
  const lang = getLang();
  const blob = await aiVoice(text, lang, waitMs);
  if (mine !== turn) return false; // something newer started speaking
  if (blob) {
    const audio = new Audio(URL.createObjectURL(blob));
    current = audio;
    audio.onended = () => URL.revokeObjectURL(audio.src);
    try { await audio.play(); return true; } catch { /* autoplay blocked: fall through */ }
  }
  return phoneSpeak(text);
}

/**
 * Makes and saves the AI voice for these phrases in advance, one at a time, so they play instantly later,
 * even with no network. Used for the danger questions.
 */
export async function prepareVoices(texts) {
  const lang = getLang();
  for (const text of texts) {
    if (!navigator.onLine) return;
    if (await fromCache(voiceUrl(text, lang))) continue;
    // Stop at the first failure (usually the daily AI voice limit) and try again next time the app opens
    if (!(await aiVoice(text, lang, 25000))) return;
  }
}

// ---------- phone's built-in voice ----------
function bestVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const code = lang.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === code) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(code.split("-")[0]));
}

function phoneSpeak(text) {
  if (!("speechSynthesis" in window)) return false;
  try {
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

export function stopSpeaking() {
  turn++;
  try { current?.pause(); } catch { /* ignore */ }
  current = null;
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
}
if ("speechSynthesis" in window) speechSynthesis.getVoices();
