// Single Vercel serverless function for every /api/* route (see vercel.json rewrites).
import { handle } from "../lib/handlers.js";

export const config = { maxDuration: 30 };

export default async function router(req, res) {
  const url = new URL(req.url, "http://localhost");
  const query = Object.fromEntries(url.searchParams);
  // After the rewrite, the original path arrives as ?path=..., or stays in the URL
  let pathname = query.path || url.pathname.replace(/^\/api\/?/, "");
  if (pathname === "router") pathname = "";
  delete query.path;
  return handle(req, res, decodeURIComponent(pathname), query);
}
