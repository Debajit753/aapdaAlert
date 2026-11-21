// Data from outside services, fetched by the server (so phones never call them directly):
//  - Official government alerts from SACHET, NDMA's public alert feed (IMD, CWC, state disaster authorities).
//  - Weather from Open-Meteo (free, no key).
// Both are cached for 10 minutes to stay light on those services.

const TEN_MIN = 10 * 60 * 1000;
const cache = new Map();
async function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}

// ---------------- official alerts (SACHET) ----------------
const SACHET_RSS = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

// Words that place an alert in North East India: states, big towns, districts, rivers and the issuing offices.
const NE_WORDS = [
  "assam", "meghalaya", "tripura", "mizoram", "manipur", "nagaland", "arunachal", "sikkim",
  "guwahati", "kamrup", "dispur", "agartala", "shillong", "aizawl", "imphal", "kohima", "itanagar", "gangtok", "dimapur",
  "khasi", "garo", "jaintia", "ri bhoi", "dhalai", "gomati", "sepahijala", "unakoti", "khowai",
  "dibrugarh", "jorhat", "silchar", "tezpur", "nagaon", "barpeta", "dhubri", "goalpara", "lakhimpur", "sivasagar",
  "tinsukia", "cachar", "karimganj", "hailakandi", "darrang", "sonitpur", "majuli", "morigaon", "bongaigaon", "kokrajhar",
  "brahmaputra", "barak", "asdma",
];

const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
const tag = (xml, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml); return m ? decode(m[1]) : ""; };

/** Latest official alerts for North East India, newest first. */
export async function officialAlerts() {
  return cached("sachet", TEN_MIN, async () => {
    const res = await fetch(SACHET_RSS, { headers: { "User-Agent": "aapdaAlert/1.0 (disaster companion demo)" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`SACHET HTTP ${res.status}`);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
      const author = tag(it, "author");
      return {
        id: tag(it, "guid"),
        title: tag(it, "title"),
        category: tag(it, "category") || "Other",
        issuer: (/\(([^)]+)\)/.exec(author)?.[1] || author.replace(/^\S+@\S+\s*/, "") || "Government of India").trim(),
        link: tag(it, "link"),
        at: new Date(tag(it, "pubDate")).toISOString(),
      };
    }).filter((a) => a.title && a.id);
    const isNE = (a) => NE_WORDS.some((w) => `${a.title} ${a.issuer}`.toLowerCase().includes(w));
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    return items.filter((a) => isNE(a) && new Date(a.at).getTime() > dayAgo)
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  });
}

// ---------------- weather (Open-Meteo) ----------------
/** Current weather and the next 6 hours of rain for a place. Coordinates are rounded to about 1 km. */
export async function weatherAt(lat, lon) {
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  return cached(`wx:${la},${lo}`, TEN_MIN, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m" +
      "&hourly=precipitation_probability,precipitation&forecast_hours=6&timezone=Asia%2FKolkata";
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const j = await res.json();
    const c = j.current || {};
    const probs = j.hourly?.precipitation_probability || [];
    const rains = j.hourly?.precipitation || [];
    return {
      at: c.time, tempC: Math.round(c.temperature_2m), humidity: c.relative_humidity_2m, windKmh: Math.round(c.wind_speed_10m),
      code: c.weather_code, rainNowMm: c.precipitation,
      rainChance6h: probs.length ? Math.max(...probs) : null,
      rain6hMm: Math.round(rains.reduce((s, x) => s + (x || 0), 0) * 10) / 10,
    };
  });
}
