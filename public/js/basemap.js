// Map background shared by the citizen app and the dashboard.
// Standard OpenStreetMap tiles (free, no API key), with their colours softened in CSS (.soft-tiles)
// so the map sits quietly behind the pins and suits the white theme.
export function addBaseMap(map) {
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, className: "soft-tiles", attribution: "© OpenStreetMap contributors",
  }).addTo(map);
}
