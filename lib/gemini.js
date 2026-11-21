// All Gemini calls live here. The API key stays on the server.
import { GoogleGenAI } from "@google/genai";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ai = KEY ? new GoogleGenAI({ apiKey: KEY }) : null;
let thinkingSupported = true;

export const geminiReady = () => Boolean(ai);
export const LANG_NAMES = { en: "English", hi: "Hindi", as: "Assamese", bn: "Bengali" };

/** Calls Gemini and returns parsed JSON, or throws. */
async function askJson({ system, contents, schema, timeoutMs = 8000 }) {
  if (!ai) throw new Error("GEMINI_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const config = {
    systemInstruction: system,
    responseMimeType: "application/json",
    responseJsonSchema: schema,
    temperature: 0.4,
    abortSignal: controller.signal,
  };
  if (thinkingSupported) config.thinkingConfig = { thinkingLevel: "LOW" };
  try {
    const res = await ai.models.generateContent({ model: MODEL, contents, config });
    return JSON.parse(res.text || "{}");
  } catch (err) {
    // Some models don't accept a thinking level: retry once without it.
    if (thinkingSupported && /thinking/i.test(String(err?.message))) {
      thinkingSupported = false;
      clearTimeout(timer);
      return askJson({ system, contents, schema, timeoutMs });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const SAFETY_RULES = `
Rules you must always follow:
- You support people in North East India during floods, landslides and earthquakes.
- If life is in danger, the person must call 112 first. Say so when it matters.
- Never say help or a rescue team is coming unless the context says the SOS status is "dispatched".
- Give only basic first aid steps. Never diagnose.
- If the person mentions self-harm or severe distress, be kind and share the Tele-MANAS helpline 14416.
- Use simple words. No markdown, no lists in chat replies.`;

// ---------- companion chat ----------
export async function chatReply({ language, history, context }) {
  const lang = LANG_NAMES[language] || "English";
  const system = `You are the apadaAlert companion: a calm, warm helper inside a disaster safety app.
Reply in ${lang} only, at most 3 short sentences.
Use the app context to answer about this person's real situation (alerts near them, nearest relief camp, their SOS status, rescue units nearby, household size).
Also decide whether the person is describing danger happening now (water entering, trapped, injured, landslide, building damaged, someone missing). If so set danger to true and keep the reply to one short calming sentence, because the app will switch to quick tap questions.
${SAFETY_RULES}

App context (JSON): ${JSON.stringify(context || {})}`;
  const contents = history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  return askJson({
    system,
    contents,
    timeoutMs: 9000,
    schema: {
      type: "object",
      properties: {
        reply: { type: "string" },
        danger: { type: "boolean" },
        hazard: { type: "string", enum: ["flood", "landslide", "earthquake", "other", "none"] },
      },
      required: ["reply", "danger", "hazard"],
    },
  });
}

// ---------- danger mode: pick the next question ----------
export async function nextQuestion({ language, remaining, answers, profileSummary, transcript }) {
  const lang = LANG_NAMES[language] || "English";
  const system = `You choose the next quick tap question in an emergency SOS flow. Rescuers need the most important facts first.
Pick ONE id from the remaining list, in roughly the given priority order, but skip any question whose answer is already clear from the answers, the household details or the conversation. Return "done" if nothing important is left.
You may reword the chosen question so it fits what the person already said, in ${lang}, at most 12 words. Leave text empty to use the standard wording.
${SAFETY_RULES}`;
  const prompt = `Remaining question ids in priority order: ${JSON.stringify(remaining)}
Answers so far: ${JSON.stringify(answers)}
Household details: ${profileSummary}
Recent conversation: ${transcript || "(none)"}`;
  return askJson({
    system,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    timeoutMs: 3800,
    schema: {
      type: "object",
      properties: { next: { type: "string", enum: [...remaining, "done"] }, text: { type: "string" } },
      required: ["next"],
    },
  });
}

// ---------- "Do this now" steps ----------
export async function safetySteps({ language, answers, profileSummary, transcript }) {
  const lang = LANG_NAMES[language] || "English";
  const system = `Write the immediate safety steps for a person in a disaster in North East India.
Write in ${lang}. 3 to 5 steps, most urgent first, each one short sentence a panicked person can follow.
Also write a version for SMS of 160 characters or fewer in English, starting with "SOS".
${SAFETY_RULES}`;
  const prompt = `Their answers: ${JSON.stringify(answers)}
Household: ${profileSummary}
Conversation: ${transcript || "(none)"}`;
  return askJson({
    system,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    timeoutMs: 7000,
    schema: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["critical", "high", "moderate"] },
        steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
        sms: { type: "string" },
      },
      required: ["severity", "steps", "sms"],
    },
  });
}

// ---------- dashboard: one-line reason for the operator ----------
export async function sosReason({ sos, chatText }) {
  const system = `You help a rescue control-room operator. Read one SOS and write a one-line reason (English, at most 20 words) that tells the operator why this person needs help and how urgent it is.
If the chat or note mentions something important that the structured answers do not show (for example a medical condition, a missing person, a fire), put it in "flag", otherwise leave flag empty.`;
  const prompt = `SOS: ${JSON.stringify({
    hazard: sos.hazard, answers: sos.answers, note: sos.note, household: sos.profile && {
      people: sos.profile.people, elderly: sos.profile.elderly, children: sos.profile.children,
      pregnant: sos.profile.pregnant, disabled: sos.profile.disabled, medical: sos.profile.medical,
    }, waitingMinutes: Math.round((Date.now() - new Date(sos.createdAt).getTime()) / 60000),
  })}
Chat with the companion: ${chatText || "(none)"}`;
  return askJson({
    system,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    timeoutMs: 8000,
    schema: {
      type: "object",
      properties: { reason: { type: "string" }, flag: { type: "string" } },
      required: ["reason"],
    },
  });
}

// ---------- hazard photo check ----------
export async function photoCheck({ type, note, dataUrl }) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) throw new Error("Bad image");
  const system = `You check photos sent with community hazard reports in a disaster app. Decide whether the photo plausibly shows the reported hazard. Be strict about unrelated images (selfies, screenshots, memes, indoor scenes with no hazard).`;
  return askJson({
    system,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: m[1], data: m[2] } },
        { text: `Reported hazard: ${type}. Note from reporter: ${note || "(none)"}` },
      ],
    }],
    timeoutMs: 12000,
    schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["matches", "unclear", "no_match"] },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["verdict", "confidence", "reason"],
    },
  });
}

// ---------- alert translation ----------
export async function translateAlert(text) {
  const system = `Translate an official disaster alert from English into Hindi, Assamese and Bengali. Keep it short, clear and calm. Keep numbers, place names and phone numbers exactly as they are.`;
  return askJson({
    system,
    contents: [{ role: "user", parts: [{ text }] }],
    timeoutMs: 10000,
    schema: {
      type: "object",
      properties: { hi: { type: "string" }, as: { type: "string" }, bn: { type: "string" } },
      required: ["hi", "as", "bn"],
    },
  });
}
