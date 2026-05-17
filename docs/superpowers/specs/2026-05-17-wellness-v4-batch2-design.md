# Wellness v4 (Batch 2) — Steps + Snacks + Polish

**Date:** 2026-05-17
**Owner:** Anand Komarraju
**Status:** Approved
**Builds on:** v3 restructure (flat 14-item routine + fasting + water + macros log)

## Goals

Three additions on top of v3:

1. **Steps counter** at the top of the day with a 10,000-step goal and a manual number input.
2. **Adhoc snacks** entry — `+ Add snack` near the macro tally, with chips showing each snack and their macros flowing into the daily tally.
3. **Visual polish** — collapse the 4 stacked top widgets into a single "Today" hero card; show macros as pills with progress bars; add small monochrome line icons to routine items; add soft shadows + brief saved flash for tactile feel.

## Non-goals

- No HealthKit/Apple Health integration (PWA limitation; user types step count manually).
- No multi-step `+1000` / `+500` quick-add buttons for steps (single number input is enough).
- No notifications.
- No timing of snacks (no 4:32 PM stamp display); just a creation order.
- No editing of an existing snack — to fix one, delete and re-add.
- No emoji explosion. Icons are line/glyph style only.

---

## Feature 1: Steps counter

### Top of "Today" hero card
A single number input next to a label and goal:

```
👟 Steps  [ 6500 ]  / 10,000   ▓▓▓▓▓▓░░░░  65%
```

- Input: `<input type="number" min="0" inputmode="numeric">`. Updates `entry.steps` (number, default 0). Debounced 250ms.
- Progress bar: small inline bar showing `min(entry.steps / 10000, 1) * 100%`. When ≥ 10,000, bar is fully filled and a "✓" appears.
- Goal of 10,000 is hardcoded for now.
- Steps reset to 0 each day along with the rest of the entry.

### Data model
Add `steps: number` (default 0) to each daily entry, alongside `waterOz`, `fastStartedAt`, etc. Old entries without it default to 0 at read time.

---

## Feature 2: Adhoc snacks

### UI
A `+ Add snack` button immediately under the macros tally line. Tapping opens an inline mini-form:

```
[label: e.g. almond + apple        ] [P __] [Fi __] [Fa __] [C __] [Save] [✕]
```

After saving, the snack appears as a chip below the button:

```
🥜 almond + apple · P 6 · Fi 4 · Fa 12 · C 18  [✕]
```

Multiple snacks per day. Each chip is removable; the form re-opens fresh each time `+ Add snack` is tapped.

### Data model
On the daily entry:

```js
entry.snacks = [
  {
    id: "<random short id>",
    label: "almond + apple",
    macros: { p: 6, fi: 4, fa: 12, c: 18 },
    createdAt: "2026-05-17T15:32:00.000Z"
  },
  ...
];
```

Snack macros flow into `macroTotals()` alongside the macro-tracked routine items. The tally line updates live.

`createdAt` is stored for ordering and possible future use. ID is generated as `Math.random().toString(36).slice(2, 10)`.

### Snack chips
Rendered chronologically (oldest first). Tapping the `✕` removes the snack from `entry.snacks`, re-renders, and persists.

---

## Feature 3: Visual polish

### A. "Today" hero card

The 4 stacked top widgets (fasting pill, water row, log tally, snacks) collapse into a **single white card** at the top with internal sub-rows. Looks like:

```
┌─────────────────────────────────────────────────┐
│ Sunday, May 17 · 5 of 14 done                   │
│                                                 │
│ ⏱  Fasting: 14h 23m              [End fast]    │
│                                                 │
│ 💧  Water    [60] / 140 oz   ▓▓▓▓░░░░░  43%   │
│                                                 │
│ 👟  Steps    [6500] / 10,000  ▓▓▓▓▓▓░░  65%   │
│                                                 │
│ Today's macros                                  │
│  Protein  ▓▓▓▓▓▓▓░░░░░  87 / 125g             │
│  Fiber    ▓▓▓▓▓░░░░░░  18 / 35g                │
│  Fats                  36g                       │
│  Carbs    ▓▓▓▓▓▓▓░░░░  95 / 130g               │
│                                                 │
│ Snacks                          [+ Add snack]   │
│  🥜 almond + apple · P 6 Fi 4 Fa 12 C 18  ✕    │
└─────────────────────────────────────────────────┘
```

### B. Macros as progress pills

Each of the 4 macros gets its own row inside the hero card:
- Label (Protein/Fiber/Fats/Carbs)
- Progress bar (none for Fats since no goal)
- Number / target (or just number for Fats)

Bars use `--sage` for under-target (P/Fi: greater-than goals) and a soft amber when over for Carbs (less-than goal). Subtle, not alarming.

### C. Routine row icons

Each item gets a small leading line-icon (matching the existing visual restraint — no full-color emoji). Icons are `<span>` with text glyph, not images. Map by id:

| id | glyph |
|---|---|
| b12_morning | ◉ |
| morning_walk_30 | ⊝ |
| breakfast | ☐ |
| walk_after_breakfast | ⊝ |
| nuts | ◇ |
| d_k2_fishoil | ◉ |
| recovery_routine | ⌇ |
| lunch | ☐ |
| walk_after_lunch | ⊝ |
| strength_training | ▲ |
| dinner | ☐ |
| walk_after_dinner | ⊝ |
| collagen_coffee | ⊙ |
| magnesium_eve | ◉ |

Glyph is rendered in the `--muted` color so it doesn't compete with the label. (If user adds a custom item, no glyph — fine.)

Per-section colors are gone in v3, so this gives a tiny visual cue back to "what kind of thing is this."

### D. Card depth + saved flash

- All cards (hero, routine ordered, settings list) get a subtle `box-shadow: 0 1px 2px rgba(0,0,0,.04)` to lift off the page.
- Save button briefly shows `Saved ✓` (already exists; reaffirm polished tween).
- Macro/water/steps inputs get a soft focus ring (`box-shadow: 0 0 0 3px rgba(138,166,138,.2)`) for tactile feedback.
- A 100ms ease on `transform: scale(.98)` on `:active` for buttons.

---

## File changes

```
app.js              MODIFIED   - render new hero card; add steps + snacks; refactor paintTopTools to paintHeroCard
index.html          MODIFIED   - new CSS for hero card, progress bars, macro pills, snack chips, icons, focus rings
items.js            MODIFIED   - add ICONS map exported alongside DEFAULT_ITEMS_V3 (or include as a per-item `icon` field on defaults)
service-worker.js   MODIFIED   - bump cache to v7
```

No new module files. The existing structure is fine — we're enhancing rendering, not splitting concerns further.

---

## Out of scope / deferred

- Editing an existing snack (delete + re-add).
- Custom step goals.
- Snack timestamps shown to user.
- HealthKit / Google Fit auto-sync.
- Animations beyond focus/active microinteractions.
