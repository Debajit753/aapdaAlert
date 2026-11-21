// Local development server: serves /public like Vercel does and sends /api/* to the same router as Vercel.
// Run with: npm run dev   (then open http://localhost:3000)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(here, ".env")); } catch { /* no .env: demo mode */ }

const { default: router } = await import("./api/router.js");
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon",
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Same entry point as on Vercel: api/router.js reads the route from ?path= (or from the address itself)
  if (url.pathname.startsWith("/api/")) return router(req, res);
  // Static files with clean URLs (/dashboard -> dashboard.html)
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  let file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end("Forbidden"); }
  if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html";
  fs.readFile(file, (e, data) => {
    if (e) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`apadaAlert running at http://localhost:${PORT}`);
  console.log(`  Citizen app: http://localhost:${PORT}/`);
  console.log(`  Dashboard:   http://localhost:${PORT}/dashboard`);
  console.log(`  Crew page:   http://localhost:${PORT}/crew`);
  console.log(`  Gemini: ${process.env.GEMINI_API_KEY ? "on" : "off (fixed questions only)"}, Database: ${process.env.FIREBASE_SERVICE_ACCOUNT ? "Firestore" : "demo store"}`);
});
