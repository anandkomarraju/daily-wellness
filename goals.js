export const DEFAULT_GOALS = {
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

export function saveGoals(storage, goals) {
  const clean = {};
  for (const k of Object.keys(DEFAULT_GOALS)) {
    const v = Number(goals[k]);
    clean[k] = Number.isFinite(v) && v > 0 ? v : DEFAULT_GOALS[k];
  }
  storage.saveGoals(clean);
  return clean;
}
