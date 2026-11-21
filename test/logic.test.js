// Pure logic: urgency score, distances, alert levels and the API address builder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreSos } from "../lib/score.js";
import { distanceKm, bearingDeg, alertLevel } from "../lib/geo.js";
import { apiUrl } from "../public/js/apiurl.js";

const now = Date.parse("2026-11-21T10:00:00Z");
const sos = (answers = {}, profile = {}, minutesAgo = 0) => ({ answers, profile, createdAt: new Date(now - minutesAgo * 60000).toISOString() });

test("score: nothing known scores 0", () => {
  assert.equal(scoreSos(sos(), now).score, 0);
});

test("score: each factor adds its points", () => {
  const { score, scoreParts } = scoreSos(sos({ injured: "bad", canMove: "stuck", waterLevel: "chest" }), now);
  assert.equal(score, 35 + 20 + 20);
  assert.deepEqual(scoreParts.map((p) => p.points), [35, 20, 20]);
});

test("score: water height is graded", () => {
  assert.equal(scoreSos(sos({ waterLevel: "waist" }), now).score, 12);
  assert.equal(scoreSos(sos({ waterLevel: "knee" }), now).score, 5);
  assert.equal(scoreSos(sos({ waterLevel: "ankle" }), now).score, 0);
});

test("score: vulnerable people count 4 each, capped at 12", () => {
  assert.equal(scoreSos(sos({}, { elderly: 1, children: 1 }), now).score, 8);
  assert.equal(scoreSos(sos({}, { elderly: 3, children: 2, disabled: 1 }), now).score, 12);
  assert.equal(scoreSos(sos({ cannotMove: ["elderly", "child"] }, { elderly: 5 }), now).score, 8, "answers win over saved details");
  assert.equal(scoreSos(sos({ cannotMove: ["none"] }), now).score, 0);
});

test("score: waiting adds 1 per 10 minutes, capped at 8", () => {
  assert.equal(scoreSos(sos({}, {}, 25), now).score, 2);
  assert.equal(scoreSos(sos({}, {}, 500), now).score, 8);
});

test("score: never above 100", () => {
  const s = scoreSos(sos({ injured: "bad", canMove: "stuck", waterLevel: "chest", people: "7+", cannotMove: ["elderly", "child", "pregnant", "disabled"] }, {}, 600), now);
  assert.ok(s.score <= 100);
});

test("geo: distance Guwahati to Shillong is about 70 km", () => {
  const km = distanceKm({ lat: 26.1445, lon: 91.7362 }, { lat: 25.5788, lon: 91.8933 });
  assert.ok(km > 60 && km < 75, `got ${km}`);
});

test("geo: missing points are infinitely far", () => {
  assert.equal(distanceKm(null, { lat: 1, lon: 1 }), Infinity);
});

test("geo: bearing due north is 0 and due east is 90", () => {
  assert.ok(Math.abs(bearingDeg({ lat: 26, lon: 91 }, { lat: 27, lon: 91 })) < 1);
  assert.ok(Math.abs(bearingDeg({ lat: 0, lon: 91 }, { lat: 0, lon: 92 }) - 90) < 1);
});

test("geo: helicopter alert levels at 10 km and 3 km", () => {
  assert.equal(alertLevel(12), null);
  assert.equal(alertLevel(10), "approaching");
  assert.equal(alertLevel(3.1), "approaching");
  assert.equal(alertLevel(3), "signal_now");
});

test("apiUrl: puts the route in ?path= and keeps the query", () => {
  assert.equal(apiUrl("health"), "/api/router?path=health");
  assert.equal(apiUrl("sos/abc-123"), "/api/router?path=sos%2Fabc-123");
  assert.equal(apiUrl("alerts?lat=26.1&lon=91.7"), "/api/router?path=alerts&lat=26.1&lon=91.7");
  assert.equal(apiUrl("/api/camps"), "/api/router?path=camps");
});
