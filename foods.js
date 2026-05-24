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
];

const FOODS_KEY = "wellness:foods";

export function loadFoods(storage) {
  const saved = storage.backend ? null : null;
  const raw = localStorage.getItem(FOODS_KEY);
  const custom = raw ? JSON.parse(raw) : [];
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
