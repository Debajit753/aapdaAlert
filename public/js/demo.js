// Demo helpers for the feature tour: a simulated rescue helicopter that flies toward an SOS.
import { apiUrl } from "./apiurl.js";
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

function distanceKm(a, b) {
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function offset(p, km, bearingDeg) {
  const b = rad(bearingDeg), la = rad(p.lat), lo = rad(p.lon), d = km / R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI };
}

let active = null;

/**
 * Flies a demo helicopter from 12 km away to the target ({lat, lon}), sped up to take under a minute.
 * onTick(km) is called with the distance left. Returns a stop function.
 */
export function flyDemoHelicopter(target, onTick = () => {}) {
  stopDemoHelicopter();
  const id = `demo-heli-${Math.random().toString(36).slice(2, 8)}`;
  const pos = offset(target, 12, Math.random() * 360);
  const post = (extra = {}) => fetch(apiUrl(`units/${id}/position`), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...pos, callSign: "HELI-DEMO", type: "helicopter", speedKmh: 180, demo: true, ...extra }),
  }).catch(() => {});
  let hold = 0;
  const tick = () => {
    const d = distanceKm(pos, target);
    if (d > 0.3) {
      const f = Math.min(1, 0.5 / d);
      pos.lat += (target.lat - pos.lat) * f; pos.lon += (target.lon - pos.lon) * f;
    } else if (++hold > 15) return stopDemoHelicopter(); // hover for 30 seconds, then leave
    post();
    onTick(Math.max(0, d));
  };
  const timer = setInterval(tick, 2000);
  active = { stop() { clearInterval(timer); fetch(apiUrl(`units/${id}`), { method: "DELETE" }).catch(() => {}); } };
  tick();
  return stopDemoHelicopter;
}

function stopDemoHelicopter() {
  active?.stop();
  active = null;
}
