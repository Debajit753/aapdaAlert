// AI voice (PRD F6 and F15): Gemini text-to-speech in English, Hindi, Assamese and Bengali.
// Each phrase is made once, then kept in Firestore, so fixed phrases (the danger questions)
// cost one Gemini call in total, not one per phone.
import crypto from "node:crypto";
import * as db from "./db.js";

const KEY = process.env.GEMINI_API_KEY;
// Speech models to try in order. The free plan allows only a few requests a day per model,
// so when one model's quota is used up the next one is tried.
const TTS_MODELS = (process.env.GEMINI_TTS_MODELS || "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts").split(",").map((m) => m.trim()).filter(Boolean);
const blockedUntil = new Map(); // model -> time its quota is expected back
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Sulafat"; // a warm, calm voice
const MAX_STORED_BYTES = 700_000; // Firestore documents must stay under 1 MB (base64 adds a third)

const memory = new Map(); // small in-process cache for repeat requests

export const voiceReady = () => Boolean(KEY);

/** Returns WAV audio (Buffer) for the text. Throws if Gemini fails. */
export async function voiceFor(text, lang) {
  // The saved copy is shared by every model, so it is keyed by voice, language and words only
  const id = crypto.createHash("sha256").update(`${TTS_VOICE}|${lang}|${text}`).digest("hex").slice(0, 40);
  if (memory.has(id)) return memory.get(id);

  const saved = await db.get("voice", id).catch(() => null);
  if (saved?.audio) {
    const wav = Buffer.from(saved.audio, "base64");
    remember(id, wav);
    return wav;
  }

  const wav = halveRate(await generate(text));
  remember(id, wav);
  if (wav.length <= MAX_STORED_BYTES) {
    db.put("voice", id, { lang, text: text.slice(0, 300), audio: wav.toString("base64"), createdAt: new Date().toISOString() }).catch(() => {});
  }
  return wav;
}

function remember(id, wav) {
  memory.set(id, wav);
  if (memory.size > 100) memory.delete(memory.keys().next().value);
}

/** Tries each speech model in turn, skipping any whose daily quota is used up. */
async function generate(text) {
  if (!KEY) throw new Error("GEMINI_API_KEY is not set");
  let lastError = new Error("All speech models are over their daily limit");
  for (const model of TTS_MODELS) {
    if ((blockedUntil.get(model) || 0) > Date.now()) continue;
    try {
      return await generateWith(model, text);
    } catch (e) {
      lastError = e;
      if (e.retryAfterMs) blockedUntil.set(model, Date.now() + e.retryAfterMs);
    }
  }
  throw lastError;
}

/** Calls one Gemini speech model. The plain text is sent with no instructions, so nothing extra is read aloud. */
async function generateWith(model, text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } } },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`${model} HTTP ${res.status}: ${json?.error?.message || ""}`.slice(0, 160));
    if (res.status === 429) {
      const delay = json?.error?.details?.find((d) => d.retryDelay)?.retryDelay; // for example "4014s"
      e.retryAfterMs = (parseInt(delay, 10) || 600) * 1000;
    }
    throw e;
  }
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("Gemini speech returned no audio");
  const bytes = Buffer.from(part.inlineData.data, "base64");
  if (bytes.toString("ascii", 0, 4) === "RIFF") return bytes;
  // Raw PCM (audio/L16;rate=24000): wrap it in a WAV header
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] || 24000);
  return wavFile(bytes, rate);
}

function wavFile(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Halves the sample rate of 16-bit mono WAV (24 kHz becomes 12 kHz): clear for speech, half the download. */
function halveRate(wav) {
  let offset = 12, rate = 0, channels = 0, bits = 0, data = null;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4), size = wav.readUInt32LE(offset + 4);
    if (id === "fmt ") { channels = wav.readUInt16LE(offset + 10); rate = wav.readUInt32LE(offset + 12); bits = wav.readUInt16LE(offset + 22); }
    if (id === "data") { data = wav.subarray(offset + 8, offset + 8 + size); break; }
    offset += 8 + size + (size % 2);
  }
  if (!data || channels !== 1 || bits !== 16 || rate < 22000) return wav;
  const samples = Math.floor(data.length / 4);
  const out = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    // Average each pair of samples: a simple low-pass so the result stays clean
    out.writeInt16LE(Math.round((data.readInt16LE(i * 4) + data.readInt16LE(i * 4 + 2)) / 2), i * 2);
  }
  return wavFile(out, Math.round(rate / 2));
}
