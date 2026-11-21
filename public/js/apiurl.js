// Builds the address for a server call.
// Every call goes straight to the single server function, with the route in ?path=, for example
//   apiUrl("alerts?lat=26.1&lon=91.7")  ->  /api/router?path=alerts&lat=26.1&lon=91.7
// This needs no rewrite rules on Vercel, so it behaves exactly the same locally and live.
export function apiUrl(path) {
  const [route, query = ""] = String(path).replace(/^\/?(api\/)?/, "").split("?");
  return `/api/router?path=${encodeURIComponent(route)}${query ? `&${query}` : ""}`;
}
