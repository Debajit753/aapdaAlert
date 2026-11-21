// Makes the AI voice for every fixed danger phrase, in all four languages, and saves it in Firestore.
// After this, phones get these voices instantly and offline, and the free daily AI voice limit isn't touched.
//
// Run from the project folder (needs GEMINI_API_KEY and FIREBASE_SERVICE_ACCOUNT in .env):
//   node scripts/prepare-voices.js
// Safe to run again: phrases already saved are skipped. If it stops at the daily limit, run it again tomorrow.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(here, "..", ".env"));
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error("FIREBASE_SERVICE_ACCOUNT is not set: voices would not be saved."); process.exit(1); }

const { voiceFor } = await import("../lib/voice.js");
const { FIXED_VOICE_QUESTIONS, spokenQuestion } = await import("../public/data/questions.js");
const { heliPhraseIn } = await import("../public/js/i18n.js");

// Native languages first: phones rarely have a good built-in Assamese, Bengali or Hindi voice
const LANGS = ["as", "bn", "hi", "en"];
let made = 0, saved = 0;
for (const lang of LANGS) {
  const phrases = [...FIXED_VOICE_QUESTIONS.map((q) => spokenQuestion(q, lang)), heliPhraseIn(lang)];
  for (const text of phrases) {
    const t = Date.now();
    try {
      await voiceFor(text, lang);
      const ms = Date.now() - t;
      if (ms > 1500) made++; else saved++;
      console.log(`${lang}  ${ms > 1500 ? "made " : "saved"}  ${text.slice(0, 60)}`);
    } catch (e) {
      console.log(`\nStopped: ${e.message}`);
      console.log(`Made ${made} new, ${saved} already saved. Run this again after the daily limit resets.`);
      process.exit(0);
    }
  }
}
console.log(`\nDone: ${made} new voices made, ${saved} were already saved. All four languages are ready.`);
process.exit(0);
