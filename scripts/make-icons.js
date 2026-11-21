// Draws the PNG app icons (needed for "Add to home screen"). Run: npm run icons
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const RED = [224, 40, 30], WHITE = [255, 255, 255], SOFT = [241, 158, 154]; // SOFT = white at 55% over red

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
}
const TABLE = crcTable();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Shape tests in a 512 x 512 design space (same drawing as icon.svg)
const inRoundRect = (x, y, r, full) => {
  if (full) return true;
  const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
// The mark: a location pin sending out a signal (same drawing as icon.svg).
const C = { x: 256, y: 232 };
function inTriangle(px, py, a, b, c) {
  const d = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = d([px, py], a, b), d2 = d([px, py], b, c), d3 = d([px, py], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function onArc(X, Y, r) {
  const dx = Math.abs(X - C.x), dy = Y - C.y;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (Math.abs(ang) <= 35 && Math.abs(Math.hypot(dx, dy) - r) <= 13) return true;
  const ex = r * Math.cos((35 * Math.PI) / 180), ey = r * Math.sin((35 * Math.PI) / 180); // round ends
  return Math.hypot(dx - ex, Math.abs(dy) - ey) <= 13;
}
/** Returns the colour at a point of the 512 x 512 design, or null for the red background. */
function markColour(x, y, inset) {
  const s = inset ? 0.72 : 1; // maskable icons keep the mark inside the safe zone
  const X = 256 + (x - 256) / s, Y = 256 + (y - 256) / s;
  const d = Math.hypot(X - C.x, Y - C.y);
  if (d <= 30) return null; // hole in the pin
  if (d <= 78 || inTriangle(X, Y, [186.9, 268.2], [325.1, 268.2], [256, 400])) return WHITE;
  if (onArc(X, Y, 130)) return WHITE;
  if (onArc(X, Y, 185)) return SOFT;
  return null;
}

function draw(size, maskable) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 3;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = ((px + (sx + 0.5) / SS) / size) * 512, y = ((py + (sy + 0.5) / SS) / size) * 512;
        if (!inRoundRect(x, y, 112, maskable)) continue;
        const c = markColour(x, y, maskable) || RED;
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = SS * SS, o = py * (size * 4 + 1) + 1 + px * 4;
      const cov = a / 255;
      raw[o] = cov ? r / cov : 0; raw[o + 1] = cov ? g / cov : 0; raw[o + 2] = cov ? b / cov : 0; raw[o + 3] = a / n;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const out = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-192.png"), draw(192, false));
fs.writeFileSync(path.join(out, "icon-512.png"), draw(512, false));
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), draw(512, true));
console.log("Icons written to public/icons");
