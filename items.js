export function defaultItems() {
  return {
    sections: [
      {
        key: "nutrition", title: "Nutritional Targets",
        items: [
          { id: "protein_125g",    label: "Protein: ≥ 125g" },
          { id: "fiber_35g",       label: "Fiber: ≥ 35g" },
          { id: "carbs_130g_max",  label: "Total Carbs: ≤ 130g" },
          { id: "water_140oz",     label: "Water: 140 oz (20 oz on waking)" },
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
    ],
  };
}

export function ensureItems(storage) {
  const saved = storage.getItems();
  if (saved && saved.sections) return saved;
  const seed = defaultItems();
  storage.saveItems(seed);
  return seed;
}
