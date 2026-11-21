// Test helpers: a clean in-memory server with the AI and Firestore switched off.
process.env.NODE_ENV = "test";
delete process.env.GEMINI_API_KEY;
delete process.env.FIREBASE_SERVICE_ACCOUNT;

const { default: router } = await import("../api/router.js");

let ip = 0;

/**
 * Calls the API the same way Vercel does: /api/router?path=<route>&<query>.
 * Each call comes from a new IP address so rate limits don't interfere, unless `from` is given.
 */
export async function api(method, route, { body, query = {}, from } = {}) {
  const qs = new URLSearchParams({ path: route, ...query }).toString();
  // Like a real request: the body arrives as a stream of bytes
  const raw = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = {
    method,
    url: `/api/router?${qs}`,
    headers: { "x-forwarded-for": from || `10.0.0.${++ip % 250}` },
    socket: {},
    async *[Symbol.asyncIterator]() { yield* raw; },
  };
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (data) => {
        const type = headers["content-type"] || "";
        resolve({ status: res.statusCode, headers, body: type.includes("json") ? JSON.parse(String(data)) : data });
      },
    };
    router(req, res);
  });
}

/** A valid id for tests (6 to 64 letters, digits, - or _). */
export const tid = (name) => `test-${name}-${Math.random().toString(36).slice(2, 10)}`;

/** Guwahati, used as "here" in tests. */
export const HERE = { lat: 26.158, lon: 91.77 };
