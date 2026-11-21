// The single server function. Every call from the app comes here as /api/router?path=<route>&...
// (see public/js/apiurl.js), so no Vercel rewrite rules are needed. The local server uses this file too.
import { handle } from "../lib/handlers.js";

export const config = { maxDuration: 30 };

export default async function router(req, res) {
  const url = new URL(req.url, "http://localhost");
  // Use the route from ?path= ; without one, fall back to the address itself (/api/health -> "health")
  const fromQuery = url.searchParams.getAll("path").map((p) => p.replace(/^\/+/, "")).filter((p) => p && p !== "router");
  const pathname = fromQuery.pop() ?? url.pathname.replace(/^\/api\/?/, "").replace(/^router\/?$/, "");
  const query = Object.fromEntries(url.searchParams);
  delete query.path;
  return handle(req, res, decodeURIComponent(pathname), query);
}
