// Fixed urgency formula (PRD F16). Same input, same score, every time.
export function scoreSos(sos, now = Date.now()) {
  const a = sos.answers || {};
  const p = sos.profile || {};
  const parts = [];
  const add = (factor, points) => { if (points > 0) parts.push({ factor, points }); };

  if (a.injured === "bad") add("Someone badly hurt", 35);
  if (a.canMove === "stuck") add("Stuck, can't move to safety", 20);
  if (a.waterLevel === "chest") add("Water at chest height or higher", 20);
  else if (a.waterLevel === "waist") add("Water at waist height", 12);
  else if (a.waterLevel === "knee") add("Water at knee height", 5);

  // People who can't move easily: from the danger answers if given, else the saved household details
  let vulnerable = 0;
  const cannot = Array.isArray(a.cannotMove) ? a.cannotMove.filter((x) => x !== "none") : null;
  if (cannot && cannot.length) vulnerable = cannot.length;
  else vulnerable = num(p.elderly) + num(p.children) + num(p.pregnant) + num(p.disabled);
  if (a.allWithYou === "some_elsewhere") vulnerable = Math.max(0, Math.min(vulnerable, 1));
  add(`${vulnerable} elderly, child, pregnant or disabled`, Math.min(vulnerable * 4, 12));

  const people = a.people === "7+" || a.allWithYou === "more_here" ? 7 : num(p.people);
  if (people > 6) add("More than 6 people", 5);

  const waitedMin = Math.max(0, (now - new Date(sos.createdAt).getTime()) / 60000);
  add(`Waiting ${Math.round(waitedMin)} min`, Math.min(Math.floor(waitedMin / 10), 8));

  const score = Math.min(100, parts.reduce((s, x) => s + x.points, 0));
  return { score, scoreParts: parts };
}

function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }
