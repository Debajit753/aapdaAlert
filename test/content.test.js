// Content checks: every question, guide and label exists in all four languages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, MAX_TAP_QUESTIONS, FIXED_VOICE_QUESTIONS, spokenQuestion } from "../public/data/questions.js";
import { GUIDES, EXTRA_STEPS } from "../public/data/guides.js";
import { TOPICS, TOPIC_GROUPS } from "../public/data/topics.js";
import { CAMPS } from "../public/data/camps.js";
import { LANGS, textIn, heliPhraseIn } from "../public/js/i18n.js";

const LANG_IDS = ["en", "hi", "as", "bn"];
const hasAll = (obj) => LANG_IDS.every((l) => typeof obj?.[l] === "string" && obj[l].trim().length > 0);
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("languages: the app offers exactly en, hi, as, bn", () => {
  assert.deepEqual(LANGS.map((l) => l.id), LANG_IDS);
});

test("questions: unique ids, text and every answer in four languages", () => {
  const ids = new Set();
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), `duplicate question ${q.id}`);
    ids.add(q.id);
    assert.ok(hasAll(q.text), `question ${q.id} text`);
    assert.ok(q.options.length >= 2, `question ${q.id} needs options`);
    const optIds = new Set(q.options.map((o) => o.id));
    assert.equal(optIds.size, q.options.length, `duplicate option in ${q.id}`);
    for (const o of q.options) {
      assert.ok(hasAll(o.label), `option ${q.id}.${o.id} label`);
      assert.ok(o.icon, `option ${q.id}.${o.id} icon`);
    }
  }
});

test("questions: the tap screen never asks more than 6", () => {
  assert.equal(MAX_TAP_QUESTIONS, 6);
});

test("questions: fixed voice phrases never contain a changing number", () => {
  for (const q of FIXED_VOICE_QUESTIONS) assert.ok(!q.text.en.includes("{n}"), q.id);
  assert.ok(!FIXED_VOICE_QUESTIONS.some((q) => q.id === "allWithYou"));
});

test("questions: spoken text is the question then its answers", () => {
  const q = QUESTIONS.find((x) => x.id === "canMove");
  assert.equal(spokenQuestion(q, "en"), "Can you move to a safer place? Yes, No, I'm stuck, Not sure");
});

test("guides: every hazard has before, during and after in four languages", () => {
  for (const [id, g] of Object.entries(GUIDES)) {
    for (const phase of ["before", "during", "after"]) {
      for (const l of LANG_IDS) assert.ok(Array.isArray(g[phase][l]) && g[phase][l].length > 0, `${id}.${phase}.${l}`);
      const counts = LANG_IDS.map((l) => g[phase][l].length);
      assert.ok(counts.every((c) => c === counts[0]), `${id}.${phase} has a different number of steps per language: ${counts}`);
    }
  }
  for (const [id, s] of Object.entries(EXTRA_STEPS)) assert.ok(hasAll(s), `extra step ${id}`);
});

test("topics: every guide topic has a title and the same steps in four languages", () => {
  for (const [id, t] of Object.entries(TOPICS)) {
    assert.ok(hasAll(t.title), `${id} title`);
    const counts = LANG_IDS.map((l) => t.steps[l]?.length);
    assert.ok(counts[0] > 0 && counts.every((c) => c === counts[0]), `${id} steps per language: ${counts}`);
  }
  const listed = TOPIC_GROUPS.flatMap((g) => g.topics);
  assert.deepEqual([...listed].sort(), Object.keys(TOPICS).sort(), "every topic appears in exactly one group");
});

test("labels: every language has the same keys and the same {placeholders}", () => {
  // textIn falls back to English, so compare against a key known to differ per language
  assert.notEqual(textIn("hi", "sos_sub"), textIn("en", "sos_sub"));
  for (const l of LANG_IDS) {
    assert.ok(heliPhraseIn(l).length > 20, `helicopter phrase in ${l}`);
    for (const key of ["loc_saved", "rain_chance", "people_note", "issued_by", "compass_words", "heli_now_b"]) {
      assert.equal(placeholders(textIn(l, key)), placeholders(textIn("en", key)), `${key} in ${l}`);
    }
  }
});

test("camps: demo camps are labelled as demo and near Guwahati", () => {
  for (const c of CAMPS) {
    assert.ok(c.demo && c.name.includes("(demo)"), c.id);
    assert.ok(c.lat > 26 && c.lat < 26.3 && c.lon > 91.5 && c.lon < 92, c.id);
  }
});
