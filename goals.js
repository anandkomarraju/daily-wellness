export const DEFAULT_GOALS = {
  track_nutrients: true,
  water_oz: 140,
  steps: 10000,
  kcal: 1800,
  protein_g: 125,
  fiber_g: 35,
  fats_g: 75,
  net_carbs_g: 90,
  sugar_max_g: 40,
};

export function loadGoals(storage) {
  const saved = storage.getGoals ? storage.getGoals() : null;
  return { ...DEFAULT_GOALS, ...(saved || {}) };
}

export function loadMealDefaults(storage) {
  return (storage.getMealDefaults && storage.getMealDefaults()) || {};
}

export function saveMealDefaults(storage, defaults) {
  const clean = {};
  for (const id of Object.keys(defaults || {})) {
    const m = defaults[id] || {};
    const row = {};
    for (const k of ["kcal","p","fi","fa","c","su"]) {
      const v = Number(m[k]);
      row[k] = Number.isFinite(v) && v >= 0 ? v : 0;
    }
    const allZero = Object.values(row).every(v => v === 0);
    if (!allZero) clean[id] = row;
  }
  storage.saveMealDefaults(clean);
  return clean;
}

export function saveGoals(storage, goals) {
  const clean = {};
  for (const k of Object.keys(DEFAULT_GOALS)) {
    if (k === "track_nutrients") {
      clean[k] = goals[k] !== false;
      continue;
    }
    const v = Number(goals[k]);
    clean[k] = Number.isFinite(v) && v > 0 ? v : DEFAULT_GOALS[k];
  }
  storage.saveGoals(clean);
  return clean;
}
