// Small helpers that work the same on Vercel functions and the local dev server.
export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return {};
  let pre;
  try { pre = req.body; } catch { return {}; } // Vercel parses the body itself and throws on bad JSON
  if (pre !== undefined && pre !== null && typeof pre === "object") return pre;
  if (typeof pre === "string") { try { return JSON.parse(pre); } catch { return {}; } }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

// Best-effort rate limit per IP and bucket (per server instance).
const hits = new Map();
export function rateLimited(req, bucket, maxPerMinute) {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > maxPerMinute;
}

export const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
