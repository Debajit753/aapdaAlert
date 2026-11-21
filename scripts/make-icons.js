// Draws the PNG app icons (needed for "Add to home screen"). Run: npm run icons
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const RED = [200, 30, 30], WHITE = [255, 255, 255];

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
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function isWhite(x, y, inset) {
  // Scale the drawing toward the centre for maskable icons
  const s = inset ? 0.72 : 1;
  const X = 256 + (x - 256) / s, Y = 256 + (y - 256) / s;
  const tri = [[256, 92], [436, 402], [76, 402]];
  for (let i = 0; i < 3; i++) {
    const [a, b] = [tri[i], tri[(i + 1) % 3]];
    if (distToSeg(X, Y, a[0], a[1], b[0], b[1]) <= 17) return true;
  }
  if (distToSeg(X, Y, 256, 218, 256, 292) <= 18) return true; // exclamation bar
  if (Math.hypot(X - 256, Y - 348) <= 22) return true;          // exclamation dot
  return false;
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
        const c = isWhite(x, y, maskable) ? WHITE : RED;
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
