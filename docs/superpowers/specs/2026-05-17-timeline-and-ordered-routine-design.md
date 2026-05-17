# Timeline + Ordered Routine — Design Spec

**Date:** 2026-05-17
**Owner:** Anand Komarraju
**Status:** Approved
**Builds on:** `2026-05-13-wellness-checklist-design.md` (v1)

## Goals

Two additions to the existing wellness app:

1. **Timeline page**: a per-item, dot-strip view of recent days so the user can see which goals are sticking and which keep slipping at a glance. Read-only — no checkboxes, no comments, no edits.
2. **Ordered Routine view**: today's checklist re-laid-out as a single chronologically-ordered numbered list (1. 20 oz water on waking, 2. B12, 3. Morning walk fasted, …) instead of grouped by category. Same data, different layout.

## Non-goals

- No times-of-day on items (no "9:00 AM B12"). Just a global sequence number.
- No notifications/reminders based on the ordered routine.
- No drag-and-drop on touch. ↑/↓ buttons are sufficient for 16 items.
- No filtering, zoom, or aggregation on Timeline. Pure visualization.
- No structural change to entries on disk — `wellness:entries` shape is untouched.
- No new charts (bar, line, etc.). Only the dot strip.

---

## Feature 1: Timeline page

### Nav entry
New link in the bottom save-bar between Settings and Export:

```
History · Settings · Timeline · Export
```

### Layout
- Title: "Timeline"
- Subtitle/legend (single line, small text):
  > **● done   ● tracked, not done   ● no entry** · Last 30 days · today on the right
- Per-section blocks (Nutrition, Supplements, Activity, Structural) using existing accent colors.
- Each block: section title + one row per item.
- Each row: item label on the left, horizontal dot strip on the right (today rightmost).
- 30 dot slots maximum. Strip grows day-by-day as data accumulates; older days fall off the left edge once the window exceeds 30.

### Dot semantics
For each (item, day) pair:

| State | Color | Meaning |
|---|---|---|
| **Green** | sage `--sage` | Item was checked on that day's saved entry |
| **Grey** | `--muted` | A saved entry exists for that day, but this item was unchecked |
| **Red** | a calm red (e.g., `#c87b7b`) | No saved entry exists for that day at all |

If today has not yet had an entry saved (mid-day, user hasn't toggled anything), today's column shows red. As soon as the user toggles any item or taps Save, today flips to green/grey appropriately.

### Days included
- Walk back from today (local date) up to 30 days.
- For each day in that window:
  - If `storage.getEntry(date)` exists → use its items map.
  - Else → that day shows red dots for every item.
- Days where the item didn't exist (added later) → red dot. Days where the item used to exist but was renamed → green/grey based on what was checked, displayed under today's current label.

### Item identity over time
- Renamed items: timeline row uses the **current** label.
- Deleted items: do not appear in the timeline at all (the user removed them from current goals).
- The lookup is by `id`. Entries that contain `id`s no longer in the items list are simply ignored for display purposes (still preserved in storage and visible in History).

### No interactivity
- No tap-to-zoom, no popovers, no comment text. Pure read-only.
- If the user wants details for a specific day, History is the place.

### Empty state
If `storage.exportAll().entries` is empty:
> "No saved days yet. Open the app each day and tap Save to start your timeline."

### Sizing
- Mobile-first: target ~10px dots with ~3px gap. 30 dots = ~390px wide. Fits a 390-pt iPhone.
- On desktop, dots remain the same size; the strip is left-aligned and flexes the row.

---

## Feature 2: Ordered Routine view (layout toggle on main view)

### Toggle placement
At the top of the main checklist page, just under the date/stat header, add a two-button segmented control:

```
[ By category ]  [ By order ]
```

- The currently-active button is highlighted (background = `--fg`, color = white).
- Tapping the inactive button switches layout.
- Switching does not change any data — it's purely a render mode.

### Persistence
- The active layout is stored in `localStorage` under key `wellness:layout` with values `"category" | "order"`.
- On app load, the previously-selected layout is restored. Default for first-time users: `"category"`.

### "By order" rendering
- Single flat numbered list of all current items (no section headers).
- Items sorted by their `order` integer (ascending).
- Each row: `{number}. {label}` plus checkbox + per-row note exactly like the categorized view.
- Numbering starts at 1 and increments — the displayed number is the position in the sorted list, not the raw `order` field. (This means deleting item #3 makes the next item become #3, not #4.)
- Section accent colors are NOT applied — keeps the chronological feel uncluttered. Single neutral card.

### "By category" rendering
- Unchanged from v1. Existing 4-section layout with accent colors.

### Data flow
- Toggle only changes which render function is called inside `show()` for the `main` view (e.g., `render()` vs `renderOrdered()`).
- Both render functions read from the same `entry` object in memory and the same `items` list.
- Checkbox toggling, debounce, save-bar behavior, and persistence are identical in both layouts.

---

## Feature 3: Item ordering — Settings additions

### New `order` field
Each item in `wellness:items` gets an additional integer field:

```json
{ "id": "water_140oz", "label": "Water: 140 oz (20 oz on waking)", "order": 1 }
```

`order` is global across all sections and is what "By order" sorts by. Smaller = earlier in the routine.

### Migration on first load (one-time)
When the app loads and finds existing items without `order` fields, it assigns defaults:

1. **Apply a sensible default sequence** matching the user's actual routine (see Default order below). For each existing item ID present in that sequence, assign its position.
2. **Any items not in the default sequence** (user-added items, structural items the user has tweaked) get `order` values assigned after the known ones, in their current section+index order, with gaps of 10 (e.g., 200, 210, 220) so future inserts don't require renumbering everything.
3. Save the updated items list back to localStorage.

This migration runs at most once per device. After that, `ensureItems()` finds the orders already populated and leaves them alone.

### Default order (initial sequence)
Based on the user's stated routine:

| # | id | Label |
|---|---|---|
| 10 | water_140oz | Water: 140 oz (20 oz on waking) |
| 20 | b12_morning | Morning: B12 Sublingual |
| 30 | morning_walk_30 | Morning Walk: 30 mins (Fasted) |
| 40 | protein_125g | Protein: ≥ 125g |
| 50 | fiber_35g | Fiber: ≥ 35g |
| 60 | carbs_130g_max | Total Carbs: ≤ 130g |
| 70 | post_meal_walks | Post-Meal Walks: 10–15 mins ×3 |
| 80 | d_k2_fishoil_pm | Afternoon Fat: Vitamin D, K2 MK7, Fish Oil |
| 90 | strength_training_45 | Strength Training: 30–45 mins |
| 100 | core_stability | Core: Bird-Dogs + Dead Bugs (3×10) |
| 110 | wall_sits | Wall Sits (3 × 45-sec holds) |
| 120 | glute_bridges | Glute Bridges (3 × 15) |
| 130 | evening_flush_30 | Evening Flush: 30 mins (After Dinner) |
| 140 | collagen_7pm | By 7 PM: 1 scoop Collagen in Coffee |
| 150 | magnesium_eve | Evening: Magnesium Glycinate |
| 160 | stretch_90_90 | 90/90 Floor Stretch: 15–20 mins |

Gaps of 10 leave room for inserts.

### "Reorder routine" sub-screen in Settings
The existing Settings view stays unchanged for per-section edits (rename, delete, add, ↑/↓ within section, reset). It gains one new entry point at the top:

```
[ Reorder routine →  ]   (link/button)
```

Tapping it pushes a sub-screen that:
- Lists all 16 items in current global `order` (no section grouping).
- Each row: `↑  ↓  {label}` (no rename/delete here — that stays in the main Settings screen).
- ↑ swaps the item's `order` with the previous item's; ↓ swaps with the next item's.
- Saves on every change.
- Has a back link returning to the main Settings screen.

This separation keeps section-grouped CRUD and global ordering as two distinct mental models.

### Adding a new item
When the user adds a new item via Settings → "+ add item" in some section, the new item gets an `order` value of `max(existing orders) + 10`, placing it at the very end of the routine. The user can move it earlier via the Reorder sub-screen.

---

## Storage interface changes

`Storage` module gains one method:

```
getLayout()              -> "category" | "order"
saveLayout(value)
```

Backed by `localStorage` key `wellness:layout`. Default is `"category"`.

The four existing methods (`getItems`, `saveItems`, `getEntry`, `saveEntry`, `exportAll`) are unchanged.

---

## File structure changes

New file:
- `timeline.js` — exports `renderTimeline(root, storage, items)`. Read-only DOM render. Builds the date window, walks each item, paints the dot strip.

Modified files:
- `app.js` — adds `view === "timeline"` branch in `show()`, adds `#link-timeline` click handler, adds layout toggle in main view, calls `renderOrdered()` vs `render()` based on layout.
- `index.html` — new `#link-timeline` anchor in the save bar; CSS for `.timeline`, `.dot`, `.layout-toggle`, `.ordered`.
- `items.js` — assigns `order` on `defaultItems()`. `ensureItems()` migrates existing items missing `order`.
- `settings.js` — adds "Reorder routine" entry point and the sub-screen rendering.
- `storage.js` — adds `getLayout` / `saveLayout`.
- `service-worker.js` — adds `timeline.js` to the asset cache list. Bump `CACHE` to `wellness-v2`.
- `tests/tests.js` — tests for: order migration, `getLayout`/`saveLayout`, `renderOrdered` sort behavior, timeline date-window math.

---

## Visual style

- Dots: 10px circle, border-radius 50%, 3px gap, no border. Color = legend.
- Timeline rows: same row height as the section blocks (44px target tap area, but no tap target since read-only — it's just visual rhythm).
- Layout toggle: rounded segmented control, soft border, active state inverted.
- Ordered view: single white card, items numbered "1." through "16." in a slightly lighter color than the label, fixed-width number column for tidy alignment.

No emojis. No motivational copy. Match existing visual restraint.

---

## Migration safety

- The `order` migration runs in `ensureItems()` and is idempotent — re-running it produces no change once items have `order` fields.
- If the user's saved items list has `order` fields already, they are kept as-is (no resequencing).
- If the saved list is missing some IDs that appear in the default sequence, that's fine — only present IDs are mapped.
- Cache name bumped to `wellness-v2` so the new service worker invalidates the old cached `app.js`/`items.js` etc.

---

## Open items / deferred

- Drag-and-drop on touch — deferred. ↑/↓ is fine at 16 items.
- Color-blind accessibility for the timeline (green/grey/red) — defer until issue arises. The legend at the top mitigates somewhat.
- Per-day popover on Timeline dots — deliberately removed per user request. History remains the place for details.
- Section-color tinting in Ordered view — explicitly out of scope to keep it clean.
