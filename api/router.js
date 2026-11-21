// Single Vercel serverless function for every /api/* route.
// vercel.json rewrites /api/<anything> to /api/router?path=<anything>, but never /api/router itself
// (rewriting that too would loop and lose the original path).
import { handle } from "../lib/handlers.js";

export const config = { maxDuration: 30 };

export default async function router(req, res) {
  const url = new URL(req.url, "http://localhost");
  const query = Object.fromEntries(url.searchParams);
  // The original path arrives as ?path=..., or, if no rewrite happened, stays in the URL
  let pathname = query.path || url.pathname.replace(/^\/api\/?/, "");
  if (pathname === "router") pathname = "";
  delete query.path;
  return handle(req, res, decodeURIComponent(pathname), query);
}
