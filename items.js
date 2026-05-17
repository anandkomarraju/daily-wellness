const DEFAULT_ORDER = [
  "water_140oz",
  "b12_morning",
  "morning_walk_30",
  "protein_125g",
  "fiber_35g",
  "carbs_130g_max",
  "post_meal_walks",
  "d_k2_fishoil_pm",
  "strength_training_45",
  "core_stability",
  "wall_sits",
  "glute_bridges",
  "evening_flush_30",
  "collagen_7pm",
  "magnesium_eve",
  "stretch_90_90",
];

function orderFor(id, fallbackIndex) {
  const idx = DEFAULT_ORDER.indexOf(id);
  if (idx >= 0) return (idx + 1) * 10;
  return (DEFAULT_ORDER.length + 1 + fallbackIndex) * 10;
}

export function defaultItems() {
  const sections = [
    {
      key: "nutrition", title: "Nutritional Targets",
      items: [
        { id: "protein_125g",    label: "Protein: ≥ 125g" },
        { id: "fiber_35g",       label: "Fiber: ≥ 35g" },
        { id: "carbs_130g_max",  label: "Total Carbs: ≤ 130g" },
        { id: "water_140oz",     label: "Water 20oz" },
      ],
    },
    {
      key: "supplements", title: "Supplement Checklist",
      items: [
        { id: "b12_morning",     label: "Morning: B12 Sublingual" },
        { id: "d_k2_fishoil_pm", label: "Afternoon Fat: Vitamin D, K2 MK7, Fish Oil" },
        { id: "magnesium_eve",   label: "Evening: Magnesium Glycinate" },
        { id: "collagen_7pm",    label: "By 7 PM: 1 scoop Collagen in Coffee" },
      ],
    },
    {
      key: "activity", title: "Activity Matrix",
      items: [
        { id: "morning_walk_30",       label: "Morning Walk: 30 mins (Fasted)" },
        { id: "post_meal_walks",       label: "Post-Meal Walks: 10–15 mins ×3" },
        { id: "evening_flush_30",      label: "Evening Flush: 30 mins (After Dinner)" },
        { id: "strength_training_45",  label: "Strength Training: 30–45 mins" },
      ],
    },
    {
      key: "structural", title: "Structural Recovery Routine",
      items: [
        { id: "stretch_90_90",  label: "90/90 Floor Stretch: 15–20 mins" },
        { id: "core_stability", label: "Core: Bird-Dogs + Dead Bugs (3×10)" },
        { id: "wall_sits",      label: "Wall Sits (3 × 45-sec holds)" },
        { id: "glute_bridges",  label: "Glute Bridges (3 × 15)" },
      ],
    },
  ];
  let unknownIdx = 0;
  for (const sec of sections) {
    for (const it of sec.items) {
      it.order = orderFor(it.id, unknownIdx);
      if (DEFAULT_ORDER.indexOf(it.id) < 0) unknownIdx++;
    }
  }
  return { sections };
}

function migrateOrders(items) {
  const flat = items.sections.flatMap(s => s.items);
  if (flat.every(it => typeof it.order === "number")) return false;
  let unknownIdx = 0;
  for (const sec of items.sections) {
    for (const it of sec.items) {
      if (typeof it.order === "number") continue;
      it.order = orderFor(it.id, unknownIdx);
      if (DEFAULT_ORDER.indexOf(it.id) < 0) unknownIdx++;
    }
  }
  return true;
}

export function ensureItems(storage) {
  const saved = storage.getItems();
  if (saved && saved.sections) {
    if (migrateOrders(saved)) storage.saveItems(saved);
    return saved;
  }
  const seed = defaultItems();
  storage.saveItems(seed);
  return seed;
}

export function nextOrder(items) {
  const flat = items.sections.flatMap(s => s.items);
  if (flat.length === 0) return 10;
  return Math.max(...flat.map(i => i.order ?? 0)) + 10;
}
