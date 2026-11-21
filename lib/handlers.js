// Every API route in one place. Used by api/router.js (Vercel) and server.js (local).
import crypto from "node:crypto";
import * as db from "./db.js";
import * as ai from "./gemini.js";
import { scoreSos } from "./score.js";
import { distanceKm, bearingDeg, alertLevel } from "./geo.js";
import { send, readBody, rateLimited, clip } from "./http.js";
import { voiceFor, voiceReady } from "./voice.js";
import { officialAlerts, weatherAt } from "./outside.js";
import { QUESTIONS, QUESTIONS_VERSION } from "../public/data/questions.js";
import { CAMPS } from "../public/data/camps.js";

const nowIso = () => new Date().toISOString();
const isId = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(s);
const numOr = (v, d = null) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
const ACTIVE = new Set(["queued", "received", "dispatched"]);
const STATUSES = ["received", "dispatched", "rescued", "cancelled"];
const UNIT_FRESH_MS = 2 * 60 * 1000;

// Who an alert from the dashboard is shown as coming from. A real launch would verify the sender.
const ISSUERS = ["NDRF", "SDRF", "ASDMA", "District administration", "IMD", "Control room"];

const ROUTE_WORDS = new Set(["health", "voice", "official", "weather", "community", "report", "questions", "camps", "sos", "companion", "chat", "sync", "reports", "alerts", "units", "position", "dashboard", "reason"]);

function err(status, message) { return Object.assign(new Error(message), { status }); }

export async function handle(req, res, pathname, query) {
  try {
    const parts = pathname.split("/").filter(Boolean); // e.g. ["sos","abc"]
    const method = req.method;
    const body = await readBody(req);
    // Fixed words stay as they are; anything else is the record id, e.g. "PATCH dashboard/sos/:id"
    if (!ROUTE_WORDS.has(parts[0])) throw err(404, `No route for ${method} /api/${parts.join("/")}`);
    let id = null;
    const route = `${method} ${parts.map((p) => (ROUTE_WORDS.has(p) ? p : ((id = p), ":id"))).join("/")}`;
    if (id !== null && !isId(id)) throw err(400, "Bad id");

    switch (route) {
      case "GET health": return send(res, 200, { ok: true, gemini: ai.geminiReady(), voice: voiceReady(), store: await db.storeMode() });
      case "GET questions": return send(res, 200, { version: QUESTIONS_VERSION, questions: QUESTIONS });
      case "GET camps": return send(res, 200, { camps: CAMPS });
      case "GET voice": return await voice(req, res, query);
      case "GET official": return await official(res);
      case "GET weather": return await weather(res, query);
      case "GET community": return send(res, 200, await communityFeed(query));
      case "POST community": return send(res, 200, await communityPost(req, body));
      case "POST community/:id/report": return send(res, 200, await communityReport(req, id, body));
      case "GET dashboard/community": return send(res, 200, { messages: (await db.list("community")).sort(byNewest).slice(0, 100).map(({ deviceId, reporters, ...m }) => m) });

      case "POST sos": return send(res, 200, await upsertSos(req, body));
      case "GET sos/:id": return send(res, 200, await sosStatus(id));

      case "POST companion": return await companion(req, res, body);

      case "GET chat": return send(res, 200, { messages: await chatFor(query.deviceId) });
      case "POST chat/sync": return send(res, 200, await syncChat(body));
      case "DELETE chat": return send(res, 200, await deleteChat(query.deviceId));

      case "POST reports": return send(res, 200, await createReport(req, body));
      case "GET reports": return send(res, 200, await nearbyReports(query));

      case "GET alerts": return send(res, 200, await activeAlerts(query));

      case "POST units/:id/position": return send(res, 200, await unitPosition(id, body));
      case "DELETE units/:id": await db.put("units", id, { active: false, updatedAt: nowIso() }, { merge: true }); return send(res, 200, { ok: true });
      case "GET units": return send(res, 200, { units: await activeUnits() });

      case "GET dashboard/sos": return send(res, 200, await dashboardSos());
      case "PATCH dashboard/sos/:id": return send(res, 200, await setSosStatus(id, body));
      case "GET dashboard/sos/:id/chat": {
        const sos = await db.get("sos", id);
        if (!sos) throw err(404, "SOS not found");
        return send(res, 200, { messages: await chatFor(sos.deviceId) });
      }
      case "POST dashboard/sos/:id/reason": return send(res, 200, await explainSos(id));
      case "GET dashboard/reports": return send(res, 200, { reports: await allReports() });
      case "PATCH dashboard/reports/:id": {
        await db.put("reports", id, { visible: Boolean(body.visible), reviewedAt: nowIso() }, { merge: true });
        return send(res, 200, { ok: true });
      }
      case "GET dashboard/alerts": return send(res, 200, { alerts: (await db.list("alerts")).sort(byNewest) });
      case "POST dashboard/alerts": return send(res, 200, await createAlert(body));
      case "PATCH dashboard/alerts/:id": {
        await db.put("alerts", id, { active: Boolean(body.active) }, { merge: true });
        return send(res, 200, { ok: true });
      }
      default: throw err(404, `No route for ${method} /api/${parts.join("/")}`);
    }
  } catch (e) {
    if (!e.status) console.error("[api]", e);
    return send(res, e.status || 500, { error: e.status ? e.message : "Server error" });
  }
}

const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

// ---------------- official alerts and weather ----------------
async function official(res) {
  try {
    const alerts = await officialAlerts();
    res.setHeader("Cache-Control", "public, s-maxage=600");
    return send(res, 200, { alerts, source: "SACHET, National Disaster Management Authority" });
  } catch (e) {
    console.error("[official]", e.message);
    return send(res, 200, { alerts: [], error: "Official alert feed unavailable" });
  }
}

async function weather(res, q) {
  const lat = numOr(q.lat), lon = numOr(q.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw err(400, "lat and lon are required");
  try {
    return send(res, 200, await weatherAt(lat, lon));
  } catch (e) {
    console.error("[weather]", e.message);
    throw err(503, "Weather unavailable");
  }
}

// ---------------- nearby people chat (PRD F19) ----------------
const KINDS = ["msg", "safe", "help", "need", "offer", "road"];
const NEARBY_KM = 30;
const cellOf = (lat, lon) => `${Math.floor(lat * 2)}:${Math.floor(lon * 2)}`; // about 55 km squares
const cellsAround = (lat, lon) => {
  const a = Math.floor(lat * 2), b = Math.floor(lon * 2), out = [];
  for (const da of [-1, 0, 1]) for (const db_ of [-1, 0, 1]) out.push(`${a + da}:${b + db_}`);
  return out;
};

async function communityPost(req, b) {
  if (rateLimited(req, "community", 8)) throw err(429, "Too many messages. Wait a minute.");
  if (!isId(b.id) || !isId(b.deviceId)) throw err(400, "id and deviceId are required");
  const lat = numOr(b.lat), lon = numOr(b.lon);
  if (lat == null || lon == null) throw err(400, "Location is needed to reach people nearby");
  const text = clip(b.text, 280).trim();
  if (!text) throw err(400, "text is required");
  if (await db.get("community", b.id)) return { ok: true }; // retry of a message already saved
  // Rounded to about 1 km: enough to show distance, without revealing the exact home
  const msg = {
    id: b.id, deviceId: b.deviceId, at: nowIso(), createdAt: nowIso(),
    name: clip(b.name, 30).trim() || "Neighbour", tag: b.deviceId.replace(/[^a-z0-9]/gi, "").slice(-4).toLowerCase(),
    text, kind: KINDS.includes(b.kind) ? b.kind : "msg", language: clip(b.language, 5) || "en",
    lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, cell: cellOf(lat, lon), reports: 0, hidden: false,
  };
  await db.put("community", msg.id, msg);
  return { ok: true };
}

async function communityFeed(q) {
  const me = { lat: numOr(q.lat), lon: numOr(q.lon) };
  if (me.lat == null || me.lon == null) throw err(400, "lat and lon are required");
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const rows = (await Promise.all(cellsAround(me.lat, me.lon).map((c) => db.list("community", ["cell", c])))).flat();
  return {
    radiusKm: NEARBY_KM,
    messages: rows
      .filter((m) => !m.hidden && new Date(m.at).getTime() > dayAgo)
      .map((m) => ({ ...m, km: Math.round(distanceKm(me, m) * 10) / 10 }))
      .filter((m) => m.km <= NEARBY_KM)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)))
      .slice(-100)
      .map(({ deviceId, cell, reports, reporters, hidden, lat, lon, ...m }) => ({ ...m, mine: deviceId === q.deviceId })),
  };
}

async function communityReport(req, id, b) {
  if (rateLimited(req, "report-msg", 10)) throw err(429, "Too many reports");
  if (!isId(b.deviceId)) throw err(400, "deviceId is required");
  const m = await db.get("community", id);
  if (!m) throw err(404, "Message not found");
  // Hidden once 3 different people report it, so one person can't silence a message alone
  const reporters = [...new Set([...(m.reporters || []), b.deviceId])].slice(0, 50);
  await db.put("community", id, { reporters, reports: reporters.length, hidden: reporters.length >= 3 }, { merge: true });
  return { ok: true };
}

// ---------------- AI voice ----------------
async function voice(req, res, q) {
  const lang = ["en", "hi", "as", "bn"].includes(q.lang) ? q.lang : "en";
  const text = clip(q.text, 600).trim();
  if (!text) throw err(400, "text is required");
  if (!voiceReady()) throw err(503, "Voice is not configured");
  if (rateLimited(req, "voice", 40)) throw err(429, "Too many requests");
  try {
    const wav = await voiceFor(text, lang);
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", wav.length);
    // The same words always make the same audio, so phones and Vercel's CDN can keep it for a long time
    res.setHeader("Cache-Control", "public, max-age=2592000, s-maxage=31536000, immutable");
    res.end(wav);
  } catch (e) {
    console.error("[voice]", e.message);
    throw err(503, "Voice unavailable");
  }
}

// ---------------- SOS ----------------
async function upsertSos(req, b) {
  if (rateLimited(req, "sos", 60)) throw err(429, "Too many requests");
  if (!isId(b.id) || !isId(b.deviceId)) throw err(400, "id and deviceId are required");
  const existing = await db.get("sos", b.id);
  const lat = numOr(b.lat), lon = numOr(b.lon);
  const sos = {
    ...(existing || {}),
    id: b.id,
    deviceId: b.deviceId,
    createdAt: existing?.createdAt || clip(b.createdAt, 40) || nowIso(),
    updatedAt: nowIso(),
    lat: lat ?? existing?.lat ?? null,
    lon: lon ?? existing?.lon ?? null,
    accuracyM: numOr(b.accuracyM, existing?.accuracyM ?? null),
    locatedAt: clip(b.locatedAt, 40) || existing?.locatedAt || null,
    battery: numOr(b.battery, existing?.battery ?? null),
    hazard: clip(b.hazard, 20) || existing?.hazard || "unknown",
    answers: { ...(existing?.answers || {}), ...sanitizeAnswers(b.answers) },
    note: clip(b.note, 500) || existing?.note || "",
    language: clip(b.language, 5) || existing?.language || "en",
    source: ["app", "auto", "sms", "qr", "mesh"].includes(b.source) ? b.source : existing?.source || "app",
    profile: sanitizeProfile(b.profile) || existing?.profile || null,
    status: existing?.status || "received",
    history: existing?.history || [{ at: nowIso(), status: "received", by: "system" }],
  };
  // The citizen may cancel their own SOS
  if (b.cancel === true && ACTIVE.has(sos.status)) {
    sos.status = "cancelled";
    sos.history = [...sos.history, { at: nowIso(), status: "cancelled", by: "citizen" }];
  }
  // Answers changed, so the old AI reason may be out of date
  if (existing && JSON.stringify(existing.answers) !== JSON.stringify(sos.answers)) sos.aiStale = true;
  Object.assign(sos, scoreSos(sos));
  await db.put("sos", sos.id, sos);
  return { ok: true, status: sos.status, score: sos.score };
}

function sanitizeAnswers(a) {
  if (!a || typeof a !== "object") return {};
  const out = {};
  for (const q of QUESTIONS) {
    const v = a[q.id];
    if (v === undefined || v === null) continue;
    const ok = new Set(q.options.map((o) => o.id));
    if (q.multi && Array.isArray(v)) out[q.id] = v.filter((x) => ok.has(x));
    else if (!q.multi && ok.has(v)) out[q.id] = v;
  }
  return out;
}

function sanitizeProfile(p) {
  if (!p || typeof p !== "object") return null;
  const n = (v) => Math.max(0, Math.min(99, Math.floor(numOr(v, 0))));
  return {
    name: clip(p.name, 80), phone: clip(p.phone, 20),
    people: n(p.people), elderly: n(p.elderly), children: n(p.children), pregnant: n(p.pregnant), disabled: n(p.disabled),
    medical: clip(p.medical, 300),
    contacts: Array.isArray(p.contacts) ? p.contacts.slice(0, 3).map((c) => ({ name: clip(c?.name, 60), phone: clip(c?.phone, 20) })) : [],
  };
}

async function sosStatus(id) {
  const sos = await db.get("sos", id);
  if (!sos) throw err(404, "SOS not found");
  let nearby = null;
  if (ACTIVE.has(sos.status) && sos.lat != null) {
    for (const u of await activeUnits()) {
      const km = distanceKm(sos, u);
      if (!nearby || km < nearby.distanceKm) {
        nearby = { unitId: u.id, callSign: u.callSign, type: u.type, distanceKm: Math.round(km * 10) / 10, level: alertLevel(km), bearing: Math.round(bearingDeg(sos, u)) };
      }
    }
  }
  return { id, status: sos.status, history: sos.history, nearby };
}

async function dashboardSos() {
  const rows = (await db.list("sos")).map((s) => ({ ...s, ...scoreSos(s) }));
  const rank = (s) => (ACTIVE.has(s.status) ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || b.score - a.score || byNewest(a, b));
  return { sos: rows, units: await activeUnits(), gemini: ai.geminiReady() };
}

async function setSosStatus(id, b) {
  if (!STATUSES.includes(b.status)) throw err(400, "Bad status");
  const sos = await db.get("sos", id);
  if (!sos) throw err(404, "SOS not found");
  sos.status = b.status;
  sos.history = [...(sos.history || []), { at: nowIso(), status: b.status, by: "operator" }];
  sos.updatedAt = nowIso();
  await db.put("sos", id, sos);
  return { ok: true };
}

async function explainSos(id) {
  const sos = await db.get("sos", id);
  if (!sos) throw err(404, "SOS not found");
  if (!ai.geminiReady()) throw err(503, "Gemini is not configured");
  const chat = (await chatFor(sos.deviceId)).slice(-20).map((m) => `${m.role}: ${m.text}`).join("\n");
  const out = await ai.sosReason({ sos, chatText: chat });
  await db.put("sos", id, { aiReason: clip(out.reason, 200), aiFlag: clip(out.flag, 200), aiStale: false }, { merge: true });
  return { reason: out.reason, flag: out.flag || "" };
}

// ---------------- companion ----------------
function profileSummary(p) {
  if (!p || !p.people) return "not given";
  const bits = [`${p.people} people`];
  for (const k of ["elderly", "children", "pregnant", "disabled"]) if (p[k]) bits.push(`${p[k]} ${k}`);
  if (p.medical) bits.push(`medical: ${clip(p.medical, 120)}`);
  return bits.join(", "); // never includes name or phone
}

async function companion(req, res, b) {
  if (rateLimited(req, "ai", 40)) throw err(429, "Too many requests");
  const language = ["en", "hi", "as", "bn"].includes(b.language) ? b.language : "en";
  const summary = profileSummary(b.profileCounts);
  const transcript = Array.isArray(b.history)
    ? b.history.slice(-8).map((m) => `${m.role === "user" ? "Person" : "Companion"}: ${clip(m.text, 300)}`).join("\n")
    : "";

  if (b.kind === "chat") {
    if (!isId(b.deviceId)) throw err(400, "deviceId is required");
    const userMsg = b.message && typeof b.message === "object" ? b.message : null;
    if (!userMsg || !clip(userMsg.text, 1000)) throw err(400, "message is required");
    await saveMessage(b.deviceId, { ...userMsg, role: "user", mode: "chat" });
    if (!ai.geminiReady()) return send(res, 503, { fallback: true, error: "Gemini is not configured" });
    try {
      const history = [...(b.history || []).slice(-12), { role: "user", text: userMsg.text }]
        .map((m) => ({ role: m.role, text: clip(m.text, 1000) })).filter((m) => m.text);
      const context = { ...(b.context || {}), household: summary };
      const out = await ai.chatReply({ language, history, context });
      const reply = { id: crypto.randomUUID(), at: nowIso(), role: "companion", text: clip(out.reply, 800), mode: "chat" };
      await saveMessage(b.deviceId, reply);
      return send(res, 200, { reply, danger: Boolean(out.danger), hazard: out.hazard });
    } catch (e) {
      console.error("[companion chat]", e.message);
      return send(res, 503, { fallback: true, error: "AI unavailable" });
    }
  }

  if (!ai.geminiReady()) return send(res, 503, { fallback: true, error: "Gemini is not configured" });

  if (b.kind === "next") {
    const known = new Set(QUESTIONS.map((q) => q.id));
    const remaining = (Array.isArray(b.remaining) ? b.remaining : []).filter((x) => known.has(x));
    if (!remaining.length) return send(res, 200, { next: "done" });
    try {
      const out = await ai.nextQuestion({ language, remaining, answers: b.answers || {}, profileSummary: summary, transcript });
      return send(res, 200, { next: out.next, text: clip(out.text, 160) });
    } catch (e) {
      return send(res, 503, { fallback: true, error: "AI unavailable" });
    }
  }

  if (b.kind === "steps") {
    try {
      const out = await ai.safetySteps({ language, answers: b.answers || {}, profileSummary: summary, transcript });
      return send(res, 200, { severity: out.severity, steps: (out.steps || []).slice(0, 5).map((s) => clip(s, 200)), sms: clip(out.sms, 160) });
    } catch (e) {
      return send(res, 503, { fallback: true, error: "AI unavailable" });
    }
  }

  throw err(400, "Unknown kind");
}

// ---------------- chat storage ----------------
async function saveMessage(deviceId, m) {
  const id = isId(m.id) ? m.id : crypto.randomUUID();
  await db.put("chat", id, {
    id, deviceId,
    at: clip(m.at, 40) || nowIso(),
    role: m.role === "user" ? "user" : "companion",
    text: clip(m.text, 1000),
    mode: m.mode === "danger" ? "danger" : "chat",
    questionId: clip(m.questionId, 30) || null,
    answerIds: Array.isArray(m.answerIds) ? m.answerIds.slice(0, 6).map((x) => clip(x, 30)) : null,
    sosId: isId(m.sosId) ? m.sosId : null,
    sentOffline: Boolean(m.sentOffline),
  });
}

async function chatFor(deviceId) {
  if (!isId(deviceId)) throw err(400, "deviceId is required");
  return (await db.list("chat", ["deviceId", deviceId])).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

async function syncChat(b) {
  if (!isId(b.deviceId) || !Array.isArray(b.messages)) throw err(400, "deviceId and messages are required");
  for (const m of b.messages.slice(0, 100)) await saveMessage(b.deviceId, m);
  return { ok: true, saved: Math.min(b.messages.length, 100) };
}

async function deleteChat(deviceId) {
  const rows = await chatFor(deviceId);
  for (const m of rows) await db.remove("chat", m.id);
  return { ok: true, deleted: rows.length };
}

// ---------------- hazard reports ----------------
const REPORT_TYPES = ["road_flooded", "landslide", "road_blocked", "bridge_damaged", "camp_open"];

async function createReport(req, b) {
  if (rateLimited(req, "report", 10)) throw err(429, "Too many requests");
  if (!isId(b.id) || !REPORT_TYPES.includes(b.type)) throw err(400, "id and a valid type are required");
  const lat = numOr(b.lat), lon = numOr(b.lon);
  if (lat == null || lon == null) throw err(400, "lat and lon are required");
  const existing = await db.get("reports", b.id);
  if (existing) return { ok: true, report: publicReport(existing) };
  const photo = typeof b.photo === "string" && b.photo.startsWith("data:image/") && b.photo.length < 400_000 ? b.photo : null;
  const report = {
    id: b.id, deviceId: isId(b.deviceId) ? b.deviceId : null, createdAt: nowIso(),
    type: b.type, lat, lon, note: clip(b.note, 300), photo, demo: false,
    aiCheck: null, visible: true,
  };
  if (photo && ai.geminiReady()) {
    try {
      const out = await ai.photoCheck({ type: report.type.replace("_", " "), note: report.note, dataUrl: photo });
      report.aiCheck = { verdict: out.verdict, confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)), reason: clip(out.reason, 200) };
      report.visible = out.verdict !== "no_match";
    } catch (e) { console.error("[photo check]", e.message); }
  }
  await db.put("reports", report.id, report);
  return { ok: true, report: publicReport(report) };
}

function publicReport(r) {
  const { photo, deviceId, ...rest } = r;
  return { ...rest, hasPhoto: Boolean(photo) };
}

async function nearbyReports(q) {
  await ensureSeed();
  const centre = { lat: numOr(q.lat), lon: numOr(q.lon) };
  const radius = numOr(q.radius, 25);
  const sixHours = 6 * 3600 * 1000;
  const rows = (await db.list("reports"))
    .filter((r) => r.visible && (centre.lat == null || distanceKm(centre, r) <= radius))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  // Merge reports of the same type within 300 m and 6 hours (PRD F9)
  const clusters = [];
  for (const r of rows) {
    const t = new Date(r.createdAt).getTime();
    const c = clusters.find((c) => c.type === r.type && distanceKm(c, r) <= 0.3 && t - c.lastMs <= sixHours);
    if (c) {
      c.count += 1; c.lastMs = Math.max(c.lastMs, t); c.latestAt = new Date(c.lastMs).toISOString();
      if (r.note) c.notes.push(r.note);
      if (r.aiCheck?.verdict === "matches") c.verified = true;
      c.demo = c.demo && r.demo;
    } else {
      clusters.push({ id: r.id, type: r.type, lat: r.lat, lon: r.lon, count: 1, lastMs: t, latestAt: r.createdAt,
        notes: r.note ? [r.note] : [], verified: r.aiCheck?.verdict === "matches", demo: Boolean(r.demo) });
    }
  }
  return { reports: clusters.map(({ lastMs, ...c }) => c) };
}

async function allReports() {
  await ensureSeed();
  return (await db.list("reports")).sort(byNewest);
}

// ---------------- alerts ----------------
async function activeAlerts(q) {
  await ensureSeed();
  const me = { lat: numOr(q.lat), lon: numOr(q.lon) };
  const rows = (await db.list("alerts")).filter((a) => a.active);
  return { alerts: rows.filter((a) => me.lat == null || distanceKm(me, a.centre) <= a.radiusKm).sort(byNewest) };
}

async function createAlert(b) {
  const message = clip(b.message, 400).trim();
  const lat = numOr(b.lat), lon = numOr(b.lon);
  if (!message || lat == null || lon == null) throw err(400, "message, lat and lon are required");
  const alert = {
    id: crypto.randomUUID(), createdAt: nowIso(),
    hazard: ["flood", "landslide", "earthquake", "other"].includes(b.hazard) ? b.hazard : "other",
    issuer: ISSUERS.includes(b.issuer) ? b.issuer : "Control room",
    severity: ["severe", "warning", "watch"].includes(b.severity) ? b.severity : "warning",
    centre: { lat, lon }, radiusKm: Math.max(1, Math.min(200, numOr(b.radiusKm, 20))),
    message: { en: message, hi: message, as: message, bn: message }, translated: false, active: true,
  };
  if (ai.geminiReady()) {
    try {
      const t = await ai.translateAlert(message);
      alert.message = { en: message, hi: clip(t.hi, 600) || message, as: clip(t.as, 600) || message, bn: clip(t.bn, 600) || message };
      alert.translated = true;
    } catch (e) { console.error("[translate]", e.message); }
  }
  await db.put("alerts", alert.id, alert);
  return { ok: true, alert };
}

// ---------------- rescue units ----------------
async function activeUnits() {
  const now = Date.now();
  return (await db.list("units")).filter((u) => u.active && now - new Date(u.updatedAt).getTime() < UNIT_FRESH_MS);
}

async function unitPosition(id, b) {
  const lat = numOr(b.lat), lon = numOr(b.lon);
  if (!id || lat == null || lon == null) throw err(400, "lat and lon are required");
  const unit = {
    id, callSign: clip(b.callSign, 30) || "RESCUE", type: ["helicopter", "boat", "ground"].includes(b.type) ? b.type : "helicopter",
    lat, lon, heading: numOr(b.heading), speedKmh: numOr(b.speedKmh), updatedAt: nowIso(), active: b.active !== false, demo: Boolean(b.demo),
  };
  await db.put("units", id, unit);
  // Work out which active SOS requests are near, and record alerts sent (PRD F17)
  const sosList = (await db.list("sos")).filter((s) => ACTIVE.has(s.status) && s.lat != null);
  const nearby = [];
  for (const s of sosList) {
    const km = distanceKm(unit, s);
    const level = alertLevel(km);
    if (level) {
      const key = `${id}_${s.id}_${level}`;
      if (!(await db.get("rescueAlerts", key))) await db.put("rescueAlerts", key, { unitId: id, sosId: s.id, level, at: nowIso() });
    }
    nearby.push({ id: s.id, lat: s.lat, lon: s.lon, distanceKm: Math.round(km * 10) / 10, bearing: Math.round(bearingDeg(unit, s)),
      score: scoreSos(s).score, people: s.profile?.people || null, hazard: s.hazard, status: s.status, level });
  }
  nearby.sort((a, b) => a.distanceKm - b.distanceKm);
  return { ok: true, nearby: nearby.slice(0, 15) };
}

// ---------------- demo seed data ----------------
let seeded = false;
async function ensureSeed() {
  if (seeded) return;
  if (await db.get("meta", "seed")) { seeded = true; return; }
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const demoReports = [
    { id: "demo-r1", type: "road_flooded", lat: 26.1712, lon: 91.7542, note: "GS Road service lane under water (demo)", createdAt: ago(40) },
    { id: "demo-r2", type: "road_flooded", lat: 26.1718, lon: 91.7550, note: "Water up to the knee here (demo)", createdAt: ago(25) },
    { id: "demo-r3", type: "landslide", lat: 26.1305, lon: 91.8020, note: "Mud on the hill road (demo)", createdAt: ago(60) },
    { id: "demo-r4", type: "road_blocked", lat: 26.1500, lon: 91.7200, note: "Tree fallen across the road (demo)", createdAt: ago(15) },
    { id: "demo-r5", type: "camp_open", lat: 26.1626, lon: 91.6745, note: "Pandu camp open, food available (demo)", createdAt: ago(90) },
  ];
  for (const r of demoReports) await db.put("reports", r.id, { ...r, deviceId: null, photo: null, aiCheck: null, visible: true, demo: true });
  await db.put("alerts", "demo-alert-1", {
    id: "demo-alert-1", createdAt: ago(30), hazard: "flood", severity: "warning", issuer: "ASDMA",
    centre: { lat: 26.1445, lon: 91.7362 }, radiusKm: 30, active: true, translated: true, demo: true,
    message: {
      en: "Flood warning (demo): Brahmaputra rising near Guwahati. Keep your emergency bag ready and move to higher ground if water enters your area.",
      hi: "बाढ़ चेतावनी (डेमो): गुवाहाटी के पास ब्रह्मपुत्र का जलस्तर बढ़ रहा है। आपातकालीन बैग तैयार रखें और पानी आने पर ऊँची जगह पर जाएँ।",
      as: "বানৰ সতৰ্কবাণী (ডেমো): গুৱাহাটীৰ ওচৰত ব্ৰহ্মপুত্ৰৰ পানী বাঢ়িছে। জৰুৰীকালীন বেগ সাজু ৰাখক আৰু পানী সোমালে ওখ ঠাইলৈ যাওক।",
      bn: "বন্যা সতর্কতা (ডেমো): গুয়াহাটির কাছে ব্রহ্মপুত্রের জল বাড়ছে। জরুরি ব্যাগ তৈরি রাখুন এবং জল ঢুকলে উঁচু জায়গায় যান।",
    },
  });
  await db.put("meta", "seed", { at: nowIso() });
  seeded = true;
}
