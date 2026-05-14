# Daily Wellness Checklist — Design Spec

**Date:** 2026-05-13
**Owner:** Anand Komarraju
**Status:** Approved (pending written-spec review)

## Goal

A simple, mobile-first daily checklist app for tracking a personal wellness routine
across four areas (Nutrition, Supplements, Activity, Structural Recovery). Each item
can be checked off, and any unchecked item gets a short comment ("what got in the
way?"). Daily entries are saved as history. Phone-first, but usable from a laptop.

## Non-goals

- No multi-user support, no auth, no accounts.
- No charts, trend views, or weekly/monthly analytics in v1. Export to JSON is the
  path to later analysis.
- No cloud sync in v1. localStorage only. The app is structured so a Google
  Sheets / Drive backend can be swapped in later without UI changes.
- No streaks, gamification, motivational copy, or notifications.

## Hosting & Storage

**v1 (local-only):** single `index.html` opened directly in a browser, with
companion `manifest.webmanifest` and `service-worker.js` for PWA install. Data
lives in browser `localStorage`. Plan to host on a personal `github.com` Pages
repo or open from iCloud Drive — both work; decision deferred to user.

**v2 (deferred):** swap the storage layer for a Google Apps Script Web App that
appends rows to a private Google Sheet in personal Drive. Only the Storage module
changes; UI is untouched.

## Default checklist content

Seeded from the user's actual routine. Sections are fixed; items inside sections
are user-editable from day one.

### Nutritional Targets
- Protein: ≥ 125g
- Fiber: ≥ 35g
- Total Carbs: ≤ 130g
- Water: 140 oz (20 oz immediately upon waking)

### Supplement Checklist
- Morning: B12 Sublingual
- With Afternoon Fat: Vitamin D, K2 MK7, Fish Oil
- Evening: Magnesium Glycinate
- Closing Window (by 7 PM): 1 scoop Collagen in Coffee

### Activity Matrix
- Morning Walk: 30 mins (Fasted)
- Post-Meal Walks: 10–15 mins (After Breakfast, Lunch, and Dinner)
- Evening Flush: 30 mins (After Dinner)
- Strength Training: 30–45 mins (2 hours after Lunch)

### Structural Recovery Routine
- 90/90 Floor Stretch: 15–20 mins (Every night)
- Core Stability: Bird-Dogs and Dead Bugs (3 sets of 10)
- Knee Isometrics: Wall Sits (3 × 45-sec holds)
- Glute Bridges: 3 × 15 reps

The Structural section is expected to evolve; the editable-items design supports
adding/removing/renaming without code changes.

## Daily flow

1. Open app → today's date and weekday at top, plus a quiet "X of Y done" summary.
2. Checklist auto-loads in the state last left (mid-day toggles persist across reloads).
3. Tap any row to toggle the checkbox.
4. For any unchecked item, a `+ note` link appears below it. Tapping reveals a
   one-line text field for "what got in the way?". Comments auto-save (debounced).
5. Sticky "Save today" button at the bottom freezes today's entry into history.
   Entry remains editable until local midnight.
6. Footer links: History, Settings, Export.

**Day boundary:** local midnight starts a new day. Yesterday's entry is frozen
as-is, even if Save was never tapped — whatever was checked at midnight is the
record.

## Data model

One entry per day, keyed by `YYYY-MM-DD`:

```json
{
  "date": "2026-05-13",
  "items": {
    "<itemId>": { "checked": true,  "comment": "" },
    "<itemId>": { "checked": false, "comment": "skipped lunch salad" }
  },
  "savedAt": "2026-05-13T22:14:03-07:00"
}
```

Item IDs are stable slugs (`protein_125g`, `morning_walk_30min`) so renames don't
break history.

**Editable items list** is a separate structure:

```json
{
  "sections": [
    {
      "key": "nutrition",
      "title": "Nutritional Targets",
      "items": [
        { "id": "protein_125g", "label": "Protein: ≥ 125g" },
        ...
      ]
    },
    ...
  ]
}
```

Section keys/titles are fixed in v1. Items inside are user-editable.

## Storage interface

A single `Storage` module wraps all reads/writes behind four methods:

```
getItems()           -> sections + items
saveItems(items)
getEntry(date)       -> entry | null
saveEntry(date, e)
```

v1 implementation persists to `localStorage` under two keys:
- `wellness:items`
- `wellness:entries` (a `{ date: entry }` map)

v2 implementation calls a Google Apps Script Web App. Same four methods,
different bodies. UI and component code do not change.

## Editable items behavior

Settings screen (gear icon, top-right) lists items grouped by section. Each item:
rename (tap label), delete (✕), reorder (drag handle). "Add item" button per
section. "Reset to defaults" button restores the original seeded list.

**History immutability:** past entries are not retroactively modified by item
edits.
- Rename → past entries keep the old label (resolved at render via the snapshot
  in the entry, not the current items list).
- Delete → past entries still show the deleted item.
- Add → applies starting today; past entries do not gain it.

To support this, each entry stores `{ id, label, checked, comment }` per item at
save time, freezing the label as-of that day.

## Backup / export

"Export JSON" downloads a single file containing all history + the current items
list. This is the documented backup mechanism for the localStorage phase. The
user is responsible for periodic export until v2 (Drive sync) lands.

Auto-prompt for export is deferred (user accepted manual export as sufficient).

## Look & feel

- Soft off-white background, generous spacing, large readable type.
- Per-section subtle accent colors: Nutrition = sage, Supplements = amber,
  Activity = sky, Structural = slate.
- Top of page: date + weekday + quiet "X of Y done" stat. No streaks.
- Big tap targets, single column, sticky bottom Save button.
- No emojis. No motivational copy.

## PWA

- `manifest.webmanifest` declares name, icons, standalone display.
- `service-worker.js` caches the page so it works offline. Writes still go to
  localStorage.
- iPhone Safari → Share → Add to Home Screen gives a full-screen launch with an
  app icon. One-time setup.

## Tech footprint

- 3 files: `index.html` (inline CSS + JS), `manifest.webmanifest`, `service-worker.js`.
- No build step, no npm, no framework.
- Target ~400–600 lines total including CSS.
- Vanilla JS modules inside `index.html`, organized as: `Storage`, `Items`,
  `Entry`, `View` (render), `Settings`, `Export`.

## Open items / deferred

- Hosting target (GitHub Pages personal vs iCloud Drive vs other) — decision
  after v1 file is built and tested locally.
- Google Sheets backend (v2) — separate spec when the user is ready.
- Trends/analytics view — out of scope; defer until real history accumulates.
