const RENAME_MAP = {
  "d_k2_fishoil_pm": "d_k2_fishoil",
  "collagen_7pm":    "collagen_coffee",
};

export const ICONS = {
  b12_morning:          "◉",
  morning_walk_30:      "⊝",
  breakfast:            "☐",
  walk_after_breakfast: "⊝",
  nuts:                 "◇",
  d_k2_fishoil:         "◉",
  recovery_routine:     "⌇",
  lunch:                "☐",
  walk_after_lunch:     "⊝",
  strength_training:    "▲",
  dinner:               "☐",
  walk_after_dinner:    "⊝",
  collagen_coffee:      "⊙",
  magnesium_eve:        "◉",
};

const DEFAULT_ITEMS_V3 = [
  { id: "b12_morning",          label: "Morning B12 Sublingual",                order: 10 },
  { id: "morning_walk_30",      label: "Morning Walk: 30 mins (Fasted)",        order: 20 },
  { id: "breakfast",            label: "Breakfast",                              order: 30,  macros: true },
  { id: "walk_after_breakfast", label: "Post-Meal Walk: 10–15 mins",            order: 40 },
  { id: "nuts",                 label: "Nuts",                                   order: 50,  macros: true },
  { id: "d_k2_fishoil",         label: "Vitamin D, K2 MK7, Fish Oil",            order: 60 },
  { id: "recovery_routine",     label: "Recovery Routine: 15–20 mins",          order: 70 },
  { id: "lunch",                label: "Lunch",                                  order: 80,  macros: true },
  { id: "walk_after_lunch",     label: "Post-Meal Walk: 10–15 mins",            order: 90 },
  { id: "strength_training",    label: "Strength Training",                      order: 100 },
  { id: "dinner",               label: "Dinner",                                 order: 110, macros: true },
  { id: "walk_after_dinner",    label: "Post-Meal Walk: 10–15 mins",            order: 120 },
  { id: "collagen_coffee",      label: "1 scoop Collagen in Coffee with Vitamin C", order: 130 },
  { id: "magnesium_eve",        label: "Evening Magnesium Glycinate",            order: 140 },
];

export function defaultItems() {
  return { items: DEFAULT_ITEMS_V3.map(it => ({ ...it })) };
}

function migrateFromV2(saved) {
  const oldDefaults = {
    b12_morning:        "Morning: B12 Sublingual",
    morning_walk_30:    "Morning Walk: 30 mins (Fasted)",
    magnesium_eve:      "Evening: Magnesium Glycinate",
    d_k2_fishoil_pm:    "Afternoon Fat: Vitamin D, K2 MK7, Fish Oil",
    collagen_7pm:       "By 7 PM: 1 scoop Collagen in Coffee",
  };
  const oldLabels = {};
  for (const sec of saved.sections ?? []) {
    for (const it of sec.items ?? []) {
      const newId = RENAME_MAP[it.id] ?? it.id;
      const wasDefault = oldDefaults[it.id] && it.label === oldDefaults[it.id];
      if (it.label && !wasDefault) {
        oldLabels[newId] = it.label;
      }
    }
  }
  const fresh = defaultItems();
  for (const it of fresh.items) {
    if (oldLabels[it.id]) it.label = oldLabels[it.id];
  }
  return fresh;
}

export function ensureItems(storage) {
  const saved = storage.getItems();
  if (saved && Array.isArray(saved.items)) {
    return saved;
  }
  if (saved && Array.isArray(saved.sections)) {
    const migrated = migrateFromV2(saved);
    storage.saveItems(migrated);
    return migrated;
  }
  const seed = defaultItems();
  storage.saveItems(seed);
  return seed;
}

export function nextOrder(items) {
  if (!items.items || items.items.length === 0) return 10;
  return Math.max(...items.items.map(i => i.order ?? 0)) + 10;
}
