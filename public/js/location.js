// GPS: saved on the phone every 2 minutes while the app is open (PRD F3). GPS works without internet.
import { ls } from "./state.js";

export const lastLocation = () => ls.get("aa.lastLoc", null);
let denied = false;
export const locationDenied = () => denied;

export function getPosition({ maxAge = 60000, timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(lastLocation());
    navigator.geolocation.getCurrentPosition(
      (p) => {
        denied = false;
        const loc = {
          lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6),
          accuracyM: Math.round(p.coords.accuracy || 0), locatedAt: new Date(p.timestamp || Date.now()).toISOString(),
        };
        ls.set("aa.lastLoc", loc);
        window.dispatchEvent(new CustomEvent("location", { detail: loc }));
        resolve(loc);
      },
      (e) => {
        if (e.code === 1) denied = true;
        window.dispatchEvent(new CustomEvent("location", { detail: lastLocation() }));
        resolve(lastLocation());
      },
      { enableHighAccuracy: true, maximumAge: maxAge, timeout },
    );
  });
}

let timer = null;
export function startTracking() {
  if (timer) return;
  getPosition();
  timer = setInterval(() => getPosition({ maxAge: 30000 }), 2 * 60 * 1000);
}

export async function batteryLevel() {
  try { const b = await navigator.getBattery?.(); return b ? Math.round(b.level * 100) : null; } catch { return null; }
}
