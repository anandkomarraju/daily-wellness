# Wellness v3 — Routine Restructure + Fasting + Log + Water

**Date:** 2026-05-17
**Owner:** Anand Komarraju
**Status:** Approved
**Builds on:** `2026-05-13-wellness-checklist-design.md` (v1), `2026-05-17-timeline-and-ordered-routine-design.md` (v2)

## Goals

Replace the v1/v2 split-by-category checklist with a single chronological daily routine, plus three new top-of-page tools that solve real tracking gaps:

1. **Fasting timer** — start when fasting begins, end on Breakfast tick or manual stop.
2. **Water counter** — quick `+8 oz` / `+16 oz` taps against a 140 oz daily target.
3. **Macro log** — Protein/Fiber/Fats/Carbs in grams on the four meal/snack items, summed live into a daily tally with targets.

The v1 "By category" layout, the "Nutritional Targets" section, and the "Structural Recovery Routine" section are removed entirely. The data model collapses from sectioned items to a flat ordered list.

## Non-goals

- No multi-meal water (juice/coffee tracked as water). Water counter is plain water only — user discipline.
- No carbohydrate-quality differentiation (net vs. total carbs). Single carbs number per meal.
- No daily macro targets beyond what already exists (Protein ≥125g, Fiber ≥35g, Carbs ≤130g; Fats untracked).
- No fasting goals/streaks. Just measurement.
- No reminders/notifications.
- No backfill UI for water (only +8/+16, undo last tap).

---

## Removed from v2

- The `[ By category ] [ By order ]` toggle and `renderCategory()` rendering.
- `Storage.getLayout()` / `Storage.saveLayout()` and the `wellness:layout` key.
- The "Nutritional Targets" section (Protein, Fiber, Carbs, Water as separate items).
- The "Supplement Checklist" section name (its supplement items merge into the routine).
- The "Activity Matrix" section name (its items merge into the routine).
- The "Structural Recovery Routine" section entirely (90/90 stretch, core stability, wall sits, glute bridges) — the user removes structural tracking. Replaced by a single "Recovery Routine: 15–20 mins" item.
- Per-section editing UI in Settings (sections no longer exist).
- The "Reorder routine" sub-screen in Settings (the main settings list is already the ordered routine).
- Per-section accent colors (no sections to color).

---

## New ordered routine (14 items)

Items are stored in a flat list. The `order` field continues to determine sequence; defaults are spaced by 10.

| # | id | label | macros? |
|---|---|---|---|
| 10  | b12_morning            | Morning B12 Sublingual                       | — |
| 20  | morning_walk_30        | Morning Walk: 30 mins (Fasted)               | — |
| 30  | breakfast              | Breakfast                                     | ✓ |
| 40  | walk_after_breakfast   | Post-Meal Walk: 10–15 mins                   | — |
| 50  | nuts                   | Nuts                                          | ✓ |
| 60  | d_k2_fishoil           | Vitamin D, K2 MK7, Fish Oil                   | — |
| 70  | recovery_routine       | Recovery Routine: 15–20 mins                 | — |
| 80  | lunch                  | Lunch                                         | ✓ |
| 90  | walk_after_lunch       | Post-Meal Walk: 10–15 mins                   | — |
| 100 | strength_training      | Strength Training                             | — |
| 110 | dinner                 | Dinner                                        | ✓ |
| 120 | walk_after_dinner      | Post-Meal Walk: 10–15 mins                   | — |
| 130 | collagen_coffee        | 1 scoop Collagen in Coffee with Vitamin C    | — |
| 140 | magnesium_eve          | Evening Magnesium Glycinate                   | — |

Note: `b12_morning`, `morning_walk_30`, `magnesium_eve`, `d_k2_fishoil` (renamed from `d_k2_fishoil_pm`) are carried over from prior IDs. New IDs introduced: `breakfast`, `walk_after_breakfast`, `nuts`, `recovery_routine`, `lunch`, `walk_after_lunch`, `strength_training`, `dinner`, `walk_after_dinner`, `collagen_coffee`. Old IDs (`water_140oz`, `protein_125g`, `fiber_35g`, `carbs_130g_max`, `d_k2_fishoil_pm`, `post_meal_walks`, `evening_flush_30`, `strength_training_45`, `core_stability`, `wall_sits`, `glute_bridges`, `stretch_90_90`, `collagen_7pm`) are dropped from current items but remain readable in old saved entries (Timeline ignores them).

Each item has: a checkbox, a `+ note` button (revealing a textarea on demand), and — only on items where `macros: true` — a Log control with four numeric inputs (P/Fi/Fa/C in grams).

---

## Top-of-page area (above the ordered list)

Layout, top to bottom:

```
Tuesday, May 17 · 5 of 14 done

⏱ Fasting: 14h 23m              [End fast]
💧 Water: 24 / 140 oz            [+8 oz] [+16 oz]   undo
Today's log: P 0/125g · Fi 0/35g · Fa 0g · C 0/130g
```

These three rows ride above the ordered routine inside the same `#app` root. They re-render whenever their underlying state changes.

### Fasting pill

- **States and rendering:**
  - **idle**: `[ Start fast ]` button.
  - **running**: `⏱ Fasting: Xh Ym  [End fast]`. Live ticks every 60 seconds.
  - **ended (today)**: `⏱ Fasted: Xh Ym ✓` (frozen). Day shows the duration of the fast that ended that day.
- **Start**: tap "Start fast" → save `fastStartedAt` timestamp.
- **End conditions** (whichever first):
  - User taps `End fast` → save `fastEndedAt` to now.
  - User checks the **Breakfast** checkbox → auto-set `fastEndedAt` to the moment of the tick. (Typing into Breakfast Log fields does NOT end the fast — only the checkbox.)
- **Cross-midnight ownership:** a fast that started yesterday at 8 PM and ends today at 10 AM is rendered on **today's** page (the day the fast ended). Implementation: when ending a fast, store `fastEndedAt` on the entry of the date that contains `fastEndedAt` (today). The start time is also stored there even though it occurred yesterday.
- **No active fast at midnight:** if a fast is running across midnight without ending, the fasting pill renders on whichever calendar day the user is currently viewing — i.e., it's tied to wall-clock now, not to a specific entry. As soon as it ends, it gets owned by that day's entry.

### Water counter

- **State**: `entry.waterOz` (default 0).
- **Quick taps**: `[+8 oz]` and `[+16 oz]` buttons add to `waterOz`.
- **Undo last tap**: a small "undo" link reverses the most recent add. Implementation: keep an in-memory `lastWaterDelta` reset to 0 each render; tapping "undo" subtracts that value (clamped to ≥ 0) and clears it. No undo across page reloads.
- **Target**: 140 oz, shown as `XX / 140 oz`. When `XX >= 140`, target part dims and a small ✓ appears, but no celebration.
- **Day boundary**: water resets to 0 each calendar day (since it lives on the per-day entry).

### Today's log tally

- A single text line summing the four `macros: true` items' macros for today.
- Format: `P {sum}/125g · Fi {sum}/35g · Fa {sum}g · C {sum}/130g`.
- Targets shown only where the user has goals: P/Fi/C. Fats just shows the sum.
- Live-updates with a 250ms debounce (matching the comment debounce pattern).
- All sums treat blank/non-numeric as 0.

---

## Per-item rendering (ordered routine rows)

A row is:

```
☐ 3.  Breakfast                   + note
       [P __] [Fi __] [Fa __] [C __]    ← only for macro items
       eggs, avocado toast              ← textarea, only after + note tap, persists
```

- Number `1.` … `13.` is the position in the sorted list (re-numbers when items are added/removed).
- Checkbox toggles `entry.items[id].checked`.
- `+ note` reveals a `<textarea>` whose contents save into `entry.items[id].comment` (debounced 250ms; per-id timer).
- Macro fields (only when `it.macros === true`) are 4 small `<input type="number" min="0" inputmode="numeric">` boxes labeled P / Fi / Fa / C. They write to `entry.items[id].macros = { p, fi, fa, c }` (each a number ≥ 0; blank = 0). Debounced 250ms.
- Macros visible immediately on the row (not gated behind a "+ note" tap) — they're the primary purpose of these items.

---

## Data model changes

### `wellness:items` (in localStorage)

Old (v2):
```json
{
  "sections": [
    { "key": "...", "title": "...", "items": [{ "id": "...", "label": "...", "order": 10 }, ...] },
    ...
  ]
}
```

New (v3):
```json
{
  "items": [
    { "id": "b12_morning",      "label": "Morning B12 Sublingual",            "order": 10 },
    { "id": "breakfast",        "label": "Breakfast",                          "order": 30,  "macros": true },
    ...
  ]
}
```

A flat `items` array. No sections. Each item carries `id`, `label`, `order`, and (optional) `macros: true`.

### `wellness:entries`

Each daily entry shape:

```json
{
  "date": "2026-05-17",
  "items": {
    "<itemId>": { "label": "...", "checked": false, "comment": "", "macros": { "p": 0, "fi": 0, "fa": 0, "c": 0 } }
  },
  "waterOz": 24,
  "fastStartedAt": "2026-05-16T20:00:00-07:00",
  "fastEndedAt": "2026-05-17T10:23:00-07:00",
  "savedAt": "2026-05-17T22:14:03-07:00"
}
```

- `items[id].macros` is **only present** when the item has `macros: true` in the items list. For non-macro items, the field is omitted.
- `waterOz`, `fastStartedAt`, `fastEndedAt` are top-level optional fields. If absent, treated as 0 / null.
- Old entries (v1/v2) are still readable. They lack water/fast/macros fields — Timeline displays whatever IDs they contained. Top-of-page tools show 0 / idle for old days.

### Migration (one-time, idempotent)

When the app loads and finds `wellness:items` with the old `sections` shape OR no items at all:

1. Build a fresh `items` array from the new default routine (13 items, in order, with `macros: true` flags on the 4 meal/snack items).
2. **Preserve user customizations where possible**: walk old saved items; if an old `id` has a corresponding new `id`, copy the user's renamed `label` over (only if it differs from the old default — otherwise keep new default). The mapping table (old → new):
   - `b12_morning` → `b12_morning`
   - `morning_walk_30` → `morning_walk_30`
   - `magnesium_eve` → `magnesium_eve`
   - `d_k2_fishoil_pm` → `d_k2_fishoil` (rename only)
   - `collagen_7pm` → `collagen_coffee`
   - All other old IDs (`water_140oz`, `protein_125g`, `fiber_35g`, `carbs_130g_max`, `post_meal_walks`, `evening_flush_30`, `strength_training_45`, `core_stability`, `wall_sits`, `glute_bridges`, `stretch_90_90`) are dropped from current items.
3. Save the new flat `items` shape back to localStorage.

After migration, `ensureItems` returns the new shape on every subsequent load with no further changes (idempotent).

History remains untouched — old entries keep their old IDs and old data.

---

## Storage interface changes

`Storage` module:

- **Removed**: `getLayout()`, `saveLayout()`. Their localStorage key (`wellness:layout`) is left in place but no longer read or written. (Optional cleanup: delete it on first load.)
- **Unchanged**: `getItems()`, `saveItems()`, `getEntry()`, `saveEntry()`, `exportAll()`. The shape inside `getItems()` changes from `{sections: [...]}` to `{items: [...]}`.

---

## Settings page

Settings becomes a single flat list of items in routine order. Per row:

```
↑  ↓  [text input for label]   ✕
```

- Rename via the text input (debounced save).
- Add a new item via "+ add item" at the bottom of the list. New items get `order = max + 10` and `macros: false` by default.
- Delete via ✕ (with confirm). Deleted items are removed from the items list; history keeps them.
- Reorder via ↑/↓ (swap order field with neighbor; works the same as the v2 reorder sub-screen, but at the top level).
- "Reset to defaults" button at the bottom restores the 14-item default list.
- "Edit macros on/off" toggle per item: a small `[macros ✓]` / `[macros ○]` chip on each row that toggles `it.macros`. Allows the user to add macro tracking to any custom item later.

There is no longer a separate "Reorder routine" sub-screen — the main Settings IS the ordered list.

---

## Timeline page

Updated to flat list:

- One block (no section grouping, no per-section accent color).
- 14 dot strips (one per current item) in routine order, with the same dot semantics (green/grey/red) and 30-day window from v2.
- Items that are macro-tracked show macros tally as small subscript text on the right of the row, summed across the visible window? **Out of scope for now** — keep it pure dot strips. Macros tally lives only on today's page.
- Items deleted/renamed in the items list still don't appear in Timeline (Timeline iterates current items only — same rule as v2).
- Empty state, legend, and 30-day window unchanged.

---

## Layout removal

- The toggle DOM (`#layout-toggle` div) and CSS rules for it are removed.
- `app.js` exports a single `renderToday()` function (renamed/replacement for `renderOrdered`). `renderCategory` is deleted.
- `renderToggle()` is deleted.
- `renderMain()` no longer dispatches — it just calls `renderToday()`.

---

## File structure changes

```
wellness/
├── app.js              MODIFIED — top-of-page widgets, ordered render, fast timer ticker
├── items.js            MODIFIED — flat items model + migration from sections
├── storage.js          MODIFIED — drop getLayout/saveLayout (or stub them returning "category" silently)
├── settings.js         REWRITTEN — flat list with rename/add/del/↑↓/reset + macros toggle
├── history.js          MINOR — keep working with the new entry shape (water, fast, macros render)
├── timeline.js         MODIFIED — flat list (no section grouping)
├── service-worker.js   MODIFIED — bump CACHE to "wellness-v4"
├── index.html          MODIFIED — CSS for fasting/water/log tally rows; remove toggle CSS; remove section-color CSS where no longer used
└── tests/tests.js      MODIFIED — append tests for migration, log tally, fast lifecycle, water taps
```

---

## Edge cases and rules

- **Multiple "Start fast" taps in one day**: tapping Start while a fast is already running is a no-op (button only renders in idle state).
- **Multiple "End fast" or repeated Breakfast ticks**: end-time set once per fast; subsequent ticks don't update it.
- **Unticking Breakfast after auto-end**: does NOT resurrect the fast. Once ended, ended.
- **Negative water**: `[+8/+16]` only ever adds. "undo" subtracts but never below 0.
- **Macros input**: blank stays blank in the field but is treated as 0 in the tally. Negative numbers are rejected by `min="0"`.
- **Day rollover during use**: if the user has the page open across midnight, the in-memory `entry` still points to yesterday's date. **Out of scope to handle live**; we'll revisit if it becomes a real problem. The user closes/reopens to flip days.
- **Export JSON**: includes water/fast/macros fields naturally since `exportAll` is generic.

---

## Visual style notes

- Fasting pill: rounded background `var(--line)`, slightly bolder weight, `[End fast]` is a small pill button.
- Water counter: same row treatment; the two `+` buttons match the visual weight of the existing add buttons in Settings.
- Macros input row: 4 narrow `<input>` fields side by side, each ~50px wide on mobile, with a one-letter prefix label (`P`, `Fi`, `Fa`, `C`) inside or directly above each field.
- "Today's log" tally: small uppercase-ish text, monospaced numbers, fits on one line on a 390pt iPhone.

---

## Open items / deferred

- Live re-render at local midnight to roll the page to a fresh day (out of scope).
- Macros aggregation in Timeline / History (out of scope for v3).
- Water target customization (out of scope; fixed 140 oz).
- Quick taps for other water sizes (e.g., 12oz, 24oz) — start with `+8` / `+16` only.
- Undo persistence across reloads — out of scope; in-memory only.
