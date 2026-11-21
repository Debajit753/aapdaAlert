// The server API, end to end through the same router Vercel runs (AI and Firestore off).
import { test } from "node:test";
import assert from "node:assert/strict";
import { api, tid, HERE } from "./helpers.js";

test("health reports the AI and database state", async () => {
  const r = await api("GET", "health");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, gemini: false, voice: false, store: "memory" });
});

test("unknown routes and bad ids are rejected", async () => {
  assert.equal((await api("GET", "nope")).status, 404);
  assert.equal((await api("DELETE", "health")).status, 404);
  assert.equal((await api("GET", "sos/bad id!")).status, 400);
});

test("the address itself works when there is no ?path=", async () => {
  const { default: router } = await import("../api/router.js");
  const body = await new Promise((resolve) => {
    const res = { setHeader() {}, end: (d) => resolve(JSON.parse(d)) };
    router({ method: "GET", url: "/api/health", headers: {}, socket: {} }, res);
  });
  assert.equal(body.ok, true);
});

test("questions and camps are served", async () => {
  const q = await api("GET", "questions");
  assert.ok(q.body.version >= 1 && q.body.questions.length >= 6);
  const c = await api("GET", "camps");
  assert.ok(c.body.camps.length > 0);
});

// ---------- SOS ----------
test("SOS: created, scored, and safe to send again (no duplicates)", async () => {
  const id = tid("sos"), deviceId = tid("dev");
  const body = { id, deviceId, ...HERE, answers: { inDanger: "now", injured: "bad" }, profile: { name: "Test", people: 3, elderly: 1 } };
  const first = await api("POST", "sos", { body });
  assert.equal(first.status, 200);
  assert.equal(first.body.status, "received");
  assert.equal(first.body.score, 35 + 4);
  await api("POST", "sos", { body }); // retry from the outbox
  const list = await api("GET", "dashboard/sos");
  assert.equal(list.body.sos.filter((s) => s.id === id).length, 1);
});

test("SOS: later answers are merged into the same SOS", async () => {
  const id = tid("sos"), deviceId = tid("dev");
  await api("POST", "sos", { body: { id, deviceId, ...HERE, answers: { inDanger: "now" } } });
  const r = await api("POST", "sos", { body: { id, deviceId, answers: { canMove: "stuck" } } });
  assert.equal(r.body.score, 20);
  const s = (await api("GET", "dashboard/sos")).body.sos.find((x) => x.id === id);
  assert.deepEqual(s.answers, { inDanger: "now", canMove: "stuck" });
  assert.equal(s.lat, HERE.lat, "location kept when an update has none");
});

test("SOS: unknown answers and oversized fields are dropped", async () => {
  const id = tid("sos"), deviceId = tid("dev");
  await api("POST", "sos", { body: { id, deviceId, answers: { injured: "made-up", evil: "x", cannotMove: ["elderly", "nope"] }, note: "x".repeat(5000) } });
  const s = (await api("GET", "dashboard/sos")).body.sos.find((x) => x.id === id);
  assert.deepEqual(s.answers, { cannotMove: ["elderly"] });
  assert.equal(s.note.length, 500);
});

test("SOS: needs a valid id and device id", async () => {
  assert.equal((await api("POST", "sos", { body: { id: "x", deviceId: tid("dev") } })).status, 400);
});

test("SOS: the operator changes status and the citizen sees it; the citizen can cancel", async () => {
  const id = tid("sos"), deviceId = tid("dev");
  await api("POST", "sos", { body: { id, deviceId, ...HERE } });
  assert.equal((await api("PATCH", `dashboard/sos/${id}`, { body: { status: "dispatched" } })).status, 200);
  assert.equal((await api("GET", `sos/${id}`)).body.status, "dispatched");
  assert.equal((await api("PATCH", `dashboard/sos/${id}`, { body: { status: "nonsense" } })).status, 400);
  const c = await api("POST", "sos", { body: { id, deviceId, cancel: true } });
  assert.equal(c.body.status, "cancelled");
});

test("SOS: the AI reason needs Gemini (503 when it is off)", async () => {
  const id = tid("sos");
  await api("POST", "sos", { body: { id, deviceId: tid("dev"), ...HERE } });
  assert.equal((await api("POST", `dashboard/sos/${id}/reason`)).status, 503);
});

// ---------- helicopter ----------
test("helicopter: a unit 2 km away triggers 'signal now' for an active SOS", async () => {
  const id = tid("sos"), unit = tid("heli");
  await api("POST", "sos", { body: { id, deviceId: tid("dev"), ...HERE } });
  const pos = await api("POST", `units/${unit}/position`, { body: { lat: HERE.lat + 0.018, lon: HERE.lon, callSign: "H1" } });
  const near = pos.body.nearby.find((s) => s.id === id);
  assert.equal(near.level, "signal_now");
  const status = await api("GET", `sos/${id}`);
  assert.equal(status.body.nearby.level, "signal_now");
  await api("DELETE", `units/${unit}`);
  assert.ok(!(await api("GET", "units")).body.units.some((u) => u.id === unit), "stopped units are hidden");
});

// ---------- chat ----------
test("chat: messages are saved, read back in order, and deleted", async () => {
  const deviceId = tid("dev");
  const messages = [
    { id: tid("m"), at: "2026-11-21T10:00:01Z", role: "user", text: "first" },
    { id: tid("m"), at: "2026-11-21T10:00:02Z", role: "companion", text: "second" },
  ];
  assert.equal((await api("POST", "chat/sync", { body: { deviceId, messages: [...messages].reverse() } })).body.saved, 2);
  const got = await api("GET", "chat", { query: { deviceId } });
  assert.deepEqual(got.body.messages.map((m) => m.text), ["first", "second"]);
  assert.equal((await api("DELETE", "chat", { query: { deviceId } })).body.deleted, 2);
  assert.equal((await api("GET", "chat", { query: { deviceId } })).body.messages.length, 0);
});

test("companion: without Gemini it asks the app to fall back, but still saves the message", async () => {
  const deviceId = tid("dev");
  const r = await api("POST", "companion", { body: { kind: "chat", deviceId, language: "en", message: { id: tid("m"), text: "hello" } } });
  assert.equal(r.status, 503);
  assert.equal(r.body.fallback, true);
  assert.equal((await api("GET", "chat", { query: { deviceId } })).body.messages.length, 1);
});

// ---------- reports ----------
test("reports: close reports of the same type merge into one pin", async () => {
  const base = { type: "bridge_damaged", lat: 26.3, lon: 91.9 };
  await api("POST", "reports", { body: { id: tid("r"), ...base } });
  await api("POST", "reports", { body: { id: tid("r"), ...base, lat: base.lat + 0.001 } });
  const r = await api("GET", "reports", { query: { lat: base.lat, lon: base.lon, radius: 5 } });
  const pins = r.body.reports.filter((x) => x.type === "bridge_damaged");
  assert.equal(pins.length, 1);
  assert.equal(pins[0].count, 2);
  assert.equal((await api("POST", "reports", { body: { id: tid("r"), type: "made_up", ...HERE } })).status, 400);
});

test("reports: the public list never includes photos or device ids", async () => {
  const id = tid("r");
  const r = await api("POST", "reports", { body: { id, deviceId: tid("dev"), type: "landslide", ...HERE, photo: "data:image/jpeg;base64,AAAA" } });
  assert.equal(r.body.report.hasPhoto, true);
  assert.ok(!("photo" in r.body.report) && !("deviceId" in r.body.report));
});

// ---------- alerts ----------
test("alerts: created by the operator, shown nearby only, and ended", async () => {
  const r = await api("POST", "dashboard/alerts", { body: { message: "Test alert", lat: 27.5, lon: 94.9, radiusKm: 10, issuer: "NDRF", severity: "severe" } });
  const id = r.body.alert.id;
  assert.equal(r.body.alert.issuer, "NDRF");
  assert.equal(r.body.alert.translated, false, "no AI: message kept in English for every language");
  const near = await api("GET", "alerts", { query: { lat: 27.5, lon: 94.9 } });
  assert.ok(near.body.alerts.some((a) => a.id === id));
  const far = await api("GET", "alerts", { query: HERE });
  assert.ok(!far.body.alerts.some((a) => a.id === id));
  await api("PATCH", `dashboard/alerts/${id}`, { body: { active: false } });
  assert.ok(!(await api("GET", "alerts", { query: { lat: 27.5, lon: 94.9 } })).body.alerts.some((a) => a.id === id));
  const bad = await api("POST", "dashboard/alerts", { body: { message: "x", lat: 1, lon: 1, issuer: "Someone else" } });
  assert.equal(bad.body.alert.issuer, "Control room", "unknown issuers fall back to Control room");
});

// ---------- people nearby ----------
test("community: nearby people see a message, far away people don't, and device ids stay private", async () => {
  const id = tid("c"), deviceId = tid("dev");
  await api("POST", "community", { body: { id, deviceId, name: "Ritu", text: "Need water", kind: "need", lat: 26.18, lon: 91.79 } });
  const near = await api("GET", "community", { query: { ...HERE, deviceId: tid("reader") } });
  const m = near.body.messages.find((x) => x.id === id);
  assert.ok(m, "visible within 30 km");
  assert.ok(m.km > 2 && m.km < 5);
  assert.ok(!("deviceId" in m) && !("lat" in m), "no device id or exact location");
  assert.equal(m.mine, false);
  const far = await api("GET", "community", { query: { lat: 27.5, lon: 94.9, deviceId: tid("reader") } });
  assert.ok(!far.body.messages.some((x) => x.id === id));
});

test("community: hidden only after 3 different people report it", async () => {
  const id = tid("c");
  await api("POST", "community", { body: { id, deviceId: tid("dev"), text: "spam", ...HERE } });
  const visible = async () => (await api("GET", "community", { query: { ...HERE, deviceId: tid("r") } })).body.messages.some((x) => x.id === id);
  const one = tid("rep");
  await api("POST", `community/${id}/report`, { body: { deviceId: one } });
  await api("POST", `community/${id}/report`, { body: { deviceId: one } });
  assert.ok(await visible(), "one person twice is not enough");
  await api("POST", `community/${id}/report`, { body: { deviceId: tid("rep") } });
  await api("POST", `community/${id}/report`, { body: { deviceId: tid("rep") } });
  assert.ok(!(await visible()), "hidden after three different people");
});

test("community: a message needs a location and text", async () => {
  assert.equal((await api("POST", "community", { body: { id: tid("c"), deviceId: tid("dev"), text: "hi" } })).status, 400);
  assert.equal((await api("POST", "community", { body: { id: tid("c"), deviceId: tid("dev"), text: "  ", ...HERE } })).status, 400);
});

// ---------- rate limits ----------
test("rate limits: too many messages from one address get 429", async () => {
  const from = "10.9.9.9";
  let last;
  for (let i = 0; i < 10; i++) last = await api("POST", "community", { from, body: { id: tid("c"), deviceId: tid("dev"), text: "x", ...HERE } });
  assert.equal(last.status, 429);
});

// ---------- voice ----------
test("voice: without a key it answers 503 so the phone uses its own voice", async () => {
  assert.equal((await api("GET", "voice", { query: { lang: "as", text: "hello" } })).status, 503);
  assert.equal((await api("GET", "voice", { query: { lang: "as" } })).status, 400);
});
