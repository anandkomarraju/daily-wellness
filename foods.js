// Food library — each entry is one serving with full macro profile.
// Users can add custom foods via Settings; these are the defaults.

export const DEFAULT_FOODS = [
  { id: "quinoa",         label: "Quinoa (1 cup cooked)",            kcal: 222, p: 8,  fi: 5,  c: 39, fa: 3.6, su: 0 },
  { id: "greek_yogurt",   label: "Greek Yogurt (1 cup plain non-fat)", kcal: 130, p: 24, fi: 0,  c: 9,  fa: 0,   su: 9 },
  { id: "thick_dal",      label: "Thick Dal (1 cup cooked)",         kcal: 230, p: 16, fi: 16, c: 40, fa: 1,   su: 1 },
  { id: "black_chana",    label: "Black Chana (1 cup boiled)",       kcal: 269, p: 15, fi: 12, c: 45, fa: 4,   su: 1 },
  { id: "paneer",         label: "Paneer (4 oz)",                    kcal: 360, p: 20, fi: 0,  c: 4,  fa: 28,  su: 0 },
  { id: "tofu",           label: "Tofu (4 oz firm)",                 kcal: 100, p: 11, fi: 1,  c: 3,  fa: 5,   su: 0 },
  { id: "edamame",        label: "Edamame (1 oz dry roasted)",       kcal: 130, p: 13, fi: 6,  c: 9,  fa: 5,   su: 1 },
  { id: "macadamia",      label: "Macadamia (15 nuts)",              kcal: 240, p: 3,  fi: 3,  c: 5,  fa: 25,  su: 1 },
  { id: "pouri",          label: "Pouri Protein (1 scoop)",          kcal: 120, p: 21, fi: 0,  c: 2,  fa: 1.5, su: 0 },
  { id: "hemp_seeds",     label: "Hemp Seeds (3 tbsp)",              kcal: 166, p: 10, fi: 1.2,c: 2.6,fa: 14.6,su: 0.5 },
  { id: "chia_seeds",     label: "Chia Seeds (2 tbsp)",              kcal: 138, p: 5,  fi: 10, c: 12, fa: 9,   su: 0 },
  { id: "avocado",        label: "Avocado (1 medium)",               kcal: 240, p: 3,  fi: 10, c: 12, fa: 22,  su: 0 },
  { id: "buttermilk",     label: "Buttermilk (8oz plain low-fat)",   kcal: 100, p: 8,  fi: 0,  c: 12, fa: 2.5, su: 12 },
  { id: "carrots",        label: "Carrots (6oz raw)",                kcal: 70,  p: 1.5,fi: 5,  c: 16, fa: 0.3, su: 8 },
  { id: "collagen",       label: "Collagen Peptides (1 scoop)",      kcal: 40,  p: 10, fi: 0,  c: 0,  fa: 0,   su: 0 },
  { id: "hero_white",     label: "Hero White Bread (1 slice)",       kcal: 45,  p: 5,  fi: 11, c: 12, fa: 1,   su: 0 },
  { id: "hero_seeded",    label: "Hero Seeded Bread (1 slice)",      kcal: 60,  p: 6,  fi: 12, c: 13, fa: 2,   su: 0 },
  { id: "rice",           label: "Rice (1 cup cooked)",              kcal: 205, p: 4.2,fi: 0.6,c: 44.5,fa: 0.4,su: 0.1 },
  { id: "idly",           label: "Idly (2 medium)",                  kcal: 130, p: 4,  fi: 2,  c: 26, fa: 0.5, su: 0 },
  { id: "dosa",           label: "Dosa (1 plain medium)",            kcal: 120, p: 3,  fi: 1,  c: 23, fa: 2.5, su: 0 },
  { id: "peanut_chutney", label: "Peanut Chutney (2 tbsp)",          kcal: 140, p: 5,  fi: 2,  c: 6,  fa: 12,  su: 1 },
  { id: "sambar",         label: "Sambar (1 cup / 8oz)",             kcal: 110, p: 4,  fi: 4,  c: 15, fa: 3.5, su: 3 },
  { id: "black_chana_1c", label: "Black Chana / Kala Chana (1 cup)", kcal: 210, p: 10.7, fi: 9.6, c: 25.4, fa: 3.8, su: 6 },
  { id: "raw_carrots_1c", label: "Raw Carrots chopped (1 cup)",      kcal: 52,  p: 1.2, fi: 3.6, c: 8.7,  fa: 0.3, su: 6.1 },
  { id: "moong_dal",      label: "Moong Dal cooked (1.5 cups)",      kcal: 318, p: 21.3,fi: 23,  c: 35,   fa: 1.2, su: 6.1 },
  { id: "spinach_cooked", label: "Spinach cooked (1 cup)",           kcal: 41,  p: 5.3, fi: 4.3, c: 2.5,  fa: 0.5, su: 0.4 },
  { id: "quinoa_1c",      label: "Quinoa cooked (1 cup)",            kcal: 222, p: 8.1, fi: 5.2, c: 34.2, fa: 3.6, su: 1.6 },
  { id: "broccoli_cooked",label: "Broccoli cooked (1 cup)",          kcal: 54,  p: 3.7, fi: 3.8, c: 6.4,  fa: 0.6, su: 2.2 },
  { id: "chickpeas",      label: "Chickpeas / Garbanzo cooked (1 cup)", kcal: 269, p: 14.5, fi: 12.5, c: 32.5, fa: 4.2, su: 7.9 },
  { id: "avocado_full",   label: "Avocado full (1 medium)",          kcal: 240, p: 3,   fi: 10,  c: 3,    fa: 22,  su: 1 },
  { id: "sweet_potato",   label: "Sweet Potato baked (1 medium)",    kcal: 103, p: 2.3, fi: 3.8, c: 16,   fa: 0.2, su: 9.6 },
  { id: "cauliflower",    label: "Cauliflower cooked (1 cup)",       kcal: 29,  p: 2.3, fi: 2.9, c: 2.4,  fa: 0.6, su: 2.1 },
  { id: "lentil_soup",    label: "Lentil Soup homemade (1 cup)",     kcal: 151, p: 9,   fi: 7,   c: 17,   fa: 3,   su: 4 },
  { id: "apple_medium",   label: "Apple medium (1)",                 kcal: 95,  p: 0.5, fi: 4.4, c: 20.6, fa: 0.3, su: 18.9 },
  { id: "mixed_berries",  label: "Mixed Berries (1 cup)",            kcal: 65,  p: 1,   fi: 4,   c: 11,   fa: 0.4, su: 8 },
  { id: "strawberries",   label: "Strawberries halves (1 cup)",      kcal: 49,  p: 1,   fi: 3,   c: 8.7,  fa: 0.5, su: 7.4 },
  { id: "blueberries",    label: "Blueberries (1 cup)",              kcal: 84,  p: 1.1, fi: 3.6, c: 17.4, fa: 0.5, su: 15 },
];

const FOODS_KEY = "wellness:foods";

export function loadFoods() {
  let custom = [];
  try {
    const raw = localStorage.getItem(FOODS_KEY);
    if (raw) custom = JSON.parse(raw);
    if (!Array.isArray(custom)) custom = [];
  } catch { custom = []; }
  return [...DEFAULT_FOODS, ...custom];
}

export function saveCustomFood(food) {
  const raw = localStorage.getItem(FOODS_KEY);
  const custom = raw ? JSON.parse(raw) : [];
  custom.push(food);
  localStorage.setItem(FOODS_KEY, JSON.stringify(custom));
}

export function removeCustomFood(id) {
  const raw = localStorage.getItem(FOODS_KEY);
  if (!raw) return;
  const custom = JSON.parse(raw).filter(f => f.id !== id);
  localStorage.setItem(FOODS_KEY, JSON.stringify(custom));
}

export function isCustomFood(id) {
  return !DEFAULT_FOODS.some(f => f.id === id);
}
