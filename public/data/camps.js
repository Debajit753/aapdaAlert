// DEMO relief camps around Guwahati. Not real camps. Clearly labelled in the app.
export const CAMPS = [
  { id: "camp-pandu", name: "Pandu School Relief Camp (demo)", lat: 26.1626, lon: 91.6745, capacity: 400, facilities: ["food", "water", "medical"], demo: true },
  { id: "camp-maligaon", name: "Maligaon Community Hall (demo)", lat: 26.1554, lon: 91.6936, capacity: 250, facilities: ["food", "water"], demo: true },
  { id: "camp-dispur", name: "Dispur Higher Secondary School (demo)", lat: 26.1433, lon: 91.7898, capacity: 500, facilities: ["food", "water", "medical", "power"], demo: true },
  { id: "camp-beltola", name: "Beltola Field Shelter (demo)", lat: 26.122, lon: 91.799, capacity: 300, facilities: ["water", "medical"], demo: true },
  { id: "camp-northguwahati", name: "North Guwahati College Hall (demo)", lat: 26.1935, lon: 91.7173, capacity: 350, facilities: ["food", "water", "power"], demo: true },
  { id: "camp-jalukbari", name: "Jalukbari Stadium Shelter (demo)", lat: 26.1556, lon: 91.663, capacity: 600, facilities: ["food", "water", "medical", "power"], demo: true },
];

/** Demo map starts here when GPS isn't available (Guwahati). */
export const DEMO_CENTRE = { lat: 26.1445, lon: 91.7362 };
