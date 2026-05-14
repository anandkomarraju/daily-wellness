# Daily Wellness Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page mobile-first daily wellness checklist app with editable items, per-item "missed-goal" comments, localStorage persistence, JSON export, and PWA install support.

**Architecture:** One static `index.html` with inline CSS and vanilla JS organized as small modules (`Storage`, `Items`, `Entry`, `View`, `Settings`, `Export`). All data persists to `localStorage` behind a 4-method `Storage` interface so a Google Sheets backend can replace it later without UI changes. Companion `manifest.webmanifest` and `service-worker.js` make the page installable to the iOS home screen.

**Tech Stack:** Vanilla HTML/CSS/JS. No build step, no npm, no framework. Tests use a tiny in-page test harness (no external runner) that runs against the storage and items modules in a hidden iframe.

**Project root:** `/Users/akomarraju/workspace/wellness`

---

## File Structure

```
wellness/
├── index.html                  # main app: UI shell + inline CSS + JS modules
├── manifest.webmanifest        # PWA manifest
├── service-worker.js           # offline cache for PWA
├── icons/
│   ├── icon-192.png            # PWA icon
│   └── icon-512.png            # PWA icon
├── tests/
│   ├── test.html               # opens app modules in iframe and runs assertions
│   └── tests.js                # test cases for Storage, Items, Entry
└── docs/superpowers/
    ├── specs/2026-05-13-wellness-checklist-design.md  (already exists)
    └── plans/2026-05-13-wellness-checklist.md         (this file)
```

**Module boundaries inside `index.html`:**
- `Storage` — localStorage I/O. 4 methods: `getItems`, `saveItems`, `getEntry`, `saveEntry`. Plus `exportAll`.
- `Items` — default seed list, item CRUD operations (add, rename, delete, reorder, reset).
- `Entry` — today's-entry construction, day-boundary logic, "X of Y done" counts.
- `View` — DOM rendering for the main checklist screen.
- `Settings` — DOM rendering for the settings/edit-items screen.
- `Export` — bundles items + all entries into a downloadable JSON blob.

Each module is a top-level object literal in one `<script type="module">` block. They communicate by passing data, not by reaching into each other.

---

## Task 1: Project scaffold and seed page

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/index.html`
- Create: `/Users/akomarraju/workspace/wellness/.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
.DS_Store
*.log
node_modules/
```

- [ ] **Step 2: Create minimal `index.html` shell**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <title>Daily Wellness</title>
  <link rel="manifest" href="manifest.webmanifest" />
  <style>
    :root {
      --bg: #faf8f4;
      --fg: #1d1d1f;
      --muted: #6b6b70;
      --line: #e5e3dd;
      --sage: #8aa68a;
      --amber: #c8954b;
      --sky:  #6a8caf;
      --slate: #6b7785;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
      font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    main { max-width: 640px; margin: 0 auto; padding: 16px 16px 96px; }
    header { padding: 12px 0 8px; }
    header h1 { font-size: 20px; margin: 0 0 2px; font-weight: 600; }
    header .stat { color: var(--muted); font-size: 14px; }
    .save-bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px;
      background: var(--bg); border-top: 1px solid var(--line);
      display: flex; gap: 12px; justify-content: space-between; align-items: center; }
    .save-bar button { padding: 12px 18px; border-radius: 10px; border: 0;
      background: var(--fg); color: white; font-size: 16px; font-weight: 600; }
    .save-bar a { color: var(--muted); font-size: 14px; text-decoration: none; }
    .save-bar a + a { margin-left: 12px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1 id="title">Daily Wellness</h1>
      <div class="stat" id="stat"></div>
    </header>
    <section id="app"></section>
  </main>
  <nav class="save-bar">
    <div>
      <a href="#" id="link-history">History</a>
      <a href="#" id="link-settings">Settings</a>
      <a href="#" id="link-export">Export</a>
    </div>
    <button id="save-btn">Save today</button>
  </nav>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create empty `app.js` module file**

Path: `/Users/akomarraju/workspace/wellness/app.js`

```js
// Modules added in subsequent tasks.
console.log("wellness app loaded");
```

- [ ] **Step 4: Open in browser to verify the shell renders**

Run: `open /Users/akomarraju/workspace/wellness/index.html`
Expected: page shows "Daily Wellness" title and a sticky save bar at the bottom. Console logs `wellness app loaded`.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add .gitignore index.html app.js
git commit -m "scaffold: html shell + empty app module"
```

---

## Task 2: Storage module + tests

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/storage.js`
- Create: `/Users/akomarraju/workspace/wellness/tests/test.html`
- Create: `/Users/akomarraju/workspace/wellness/tests/tests.js`

- [ ] **Step 1: Write the failing tests**

Create `/Users/akomarraju/workspace/wellness/tests/tests.js`:

```js
import { Storage } from "../storage.js";

const results = [];
function it(name, fn) {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: e.message }); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

// Reset storage between tests
function fresh() { localStorage.clear(); return Storage(localStorage); }

it("getItems returns null when nothing saved", () => {
  const s = fresh();
  eq(s.getItems(), null);
});

it("saveItems then getItems round-trips", () => {
  const s = fresh();
  const items = { sections: [{ key: "n", title: "N", items: [{ id: "a", label: "A" }] }] };
  s.saveItems(items);
  eq(s.getItems(), items);
});

it("getEntry returns null for missing date", () => {
  const s = fresh();
  eq(s.getEntry("2026-05-13"), null);
});

it("saveEntry then getEntry round-trips", () => {
  const s = fresh();
  const e = { date: "2026-05-13", items: { a: { checked: true, comment: "" } }, savedAt: "x" };
  s.saveEntry("2026-05-13", e);
  eq(s.getEntry("2026-05-13"), e);
});

it("exportAll bundles items + all entries", () => {
  const s = fresh();
  s.saveItems({ sections: [] });
  s.saveEntry("2026-05-13", { date: "2026-05-13", items: {}, savedAt: "x" });
  s.saveEntry("2026-05-12", { date: "2026-05-12", items: {}, savedAt: "y" });
  const dump = s.exportAll();
  eq(dump.items, { sections: [] });
  eq(Object.keys(dump.entries).sort(), ["2026-05-12", "2026-05-13"]);
});

// Render
const root = document.getElementById("results");
for (const r of results) {
  const li = document.createElement("li");
  li.textContent = (r.pass ? "PASS  " : "FAIL  ") + r.name + (r.err ? " — " + r.err : "");
  li.style.color = r.pass ? "green" : "red";
  root.appendChild(li);
}
```

Create `/Users/akomarraju/workspace/wellness/tests/test.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>tests</title></head>
<body>
  <h1>Tests</h1>
  <ul id="results"></ul>
  <script type="module" src="tests.js"></script>
</body></html>
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `open /Users/akomarraju/workspace/wellness/tests/test.html`
Expected: page shows red FAIL lines because `storage.js` doesn't export `Storage` yet.

- [ ] **Step 3: Implement `storage.js`**

Create `/Users/akomarraju/workspace/wellness/storage.js`:

```js
const ITEMS_KEY = "wellness:items";
const ENTRIES_KEY = "wellness:entries";

export function Storage(backend = localStorage) {
  function readJSON(key, fallback) {
    const raw = backend.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  function writeJSON(key, value) {
    backend.setItem(key, JSON.stringify(value));
  }

  return {
    getItems()        { return readJSON(ITEMS_KEY, null); },
    saveItems(items)  { writeJSON(ITEMS_KEY, items); },
    getEntry(date)    { return readJSON(ENTRIES_KEY, {})[date] ?? null; },
    saveEntry(date, e) {
      const all = readJSON(ENTRIES_KEY, {});
      all[date] = e;
      writeJSON(ENTRIES_KEY, all);
    },
    exportAll() {
      return { items: readJSON(ITEMS_KEY, null), entries: readJSON(ENTRIES_KEY, {}) };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: refresh `tests/test.html` in the browser.
Expected: all 5 lines green PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add storage.js tests/
git commit -m "feat(storage): localStorage-backed Storage module + tests"
```

---

## Task 3: Default seed items

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/items.js`
- Modify: `/Users/akomarraju/workspace/wellness/tests/tests.js`

- [ ] **Step 1: Write failing tests**

Append to `/Users/akomarraju/workspace/wellness/tests/tests.js` BEFORE the render block:

```js
import { defaultItems, ensureItems } from "../items.js";

it("defaultItems has 4 sections in order", () => {
  const d = defaultItems();
  eq(d.sections.map(s => s.key), ["nutrition", "supplements", "activity", "structural"]);
});

it("defaultItems nutrition section has 4 items", () => {
  const d = defaultItems();
  const n = d.sections.find(s => s.key === "nutrition");
  eq(n.items.length, 4);
});

it("defaultItems item ids are unique slugs", () => {
  const d = defaultItems();
  const ids = d.sections.flatMap(s => s.items.map(i => i.id));
  eq(ids.length, new Set(ids).size);
  for (const id of ids) {
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error("bad id: " + id);
  }
});

it("ensureItems returns saved items when present", () => {
  const s = fresh();
  const fake = { sections: [{ key: "x", title: "X", items: [] }] };
  s.saveItems(fake);
  eq(ensureItems(s), fake);
});

it("ensureItems seeds defaults when nothing saved", () => {
  const s = fresh();
  const result = ensureItems(s);
  eq(result.sections.map(x => x.key), ["nutrition", "supplements", "activity", "structural"]);
  // and now persists them
  eq(s.getItems().sections.map(x => x.key), ["nutrition", "supplements", "activity", "structural"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: refresh `tests/test.html`.
Expected: 5 new red FAIL lines.

- [ ] **Step 3: Implement `items.js`**

Create `/Users/akomarraju/workspace/wellness/items.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: refresh `tests/test.html`.
Expected: all tests green PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add items.js tests/tests.js
git commit -m "feat(items): default seed list + ensureItems"
```

---

## Task 4: Entry module — today's date, blank entry, counts

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/entry.js`
- Modify: `/Users/akomarraju/workspace/wellness/tests/tests.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/tests.js` BEFORE the render block:

```js
import { todayKey, blankEntry, countDone, mergeIntoEntry, snapshotItems } from "../entry.js";

it("todayKey returns YYYY-MM-DD for given Date", () => {
  eq(todayKey(new Date(2026, 4, 13, 10, 30)), "2026-05-13");
  eq(todayKey(new Date(2026, 0, 1, 0, 0)),    "2026-01-01");
});

it("blankEntry seeds all items unchecked with empty comment", () => {
  const items = {
    sections: [
      { key: "n", title: "N", items: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    ],
  };
  const e = blankEntry("2026-05-13", items);
  eq(e.date, "2026-05-13");
  eq(e.items, { a: { label: "A", checked: false, comment: "" },
                b: { label: "B", checked: false, comment: "" } });
});

it("countDone returns checked-and-total", () => {
  const e = { items: { a: { checked: true }, b: { checked: false }, c: { checked: true } } };
  eq(countDone(e), { done: 2, total: 3 });
});

it("snapshotItems freezes labels into the entry", () => {
  const items = { sections: [{ key: "n", title: "N", items: [{ id: "a", label: "Old" }] }] };
  const snap = snapshotItems(items);
  eq(snap, { a: "Old" });
});

it("mergeIntoEntry preserves existing checks/comments and adds new items as blank", () => {
  const existing = {
    date: "2026-05-13",
    items: { a: { label: "A-old", checked: true, comment: "yes" } },
  };
  const items = { sections: [{ key: "n", title: "N",
    items: [{ id: "a", label: "A-new" }, { id: "b", label: "B" }] }] };
  const merged = mergeIntoEntry(existing, items);
  eq(merged.items.a.checked, true);
  eq(merged.items.a.comment, "yes");
  eq(merged.items.a.label, "A-old");        // history immutability: keep snapshot label
  eq(merged.items.b, { label: "B", checked: false, comment: "" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: refresh `tests/test.html`.
Expected: 5 new red FAIL lines.

- [ ] **Step 3: Implement `entry.js`**

Create `/Users/akomarraju/workspace/wellness/entry.js`:

```js
function pad(n) { return String(n).padStart(2, "0"); }

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function snapshotItems(items) {
  const out = {};
  for (const sec of items.sections) {
    for (const it of sec.items) out[it.id] = it.label;
  }
  return out;
}

export function blankEntry(dateKey, items) {
  const out = { date: dateKey, items: {} };
  for (const sec of items.sections) {
    for (const it of sec.items) {
      out.items[it.id] = { label: it.label, checked: false, comment: "" };
    }
  }
  return out;
}

export function mergeIntoEntry(existing, items) {
  const blank = blankEntry(existing.date, items);
  const merged = { ...existing, items: { ...blank.items } };
  for (const id of Object.keys(existing.items)) {
    if (id in merged.items) {
      // Preserve everything from existing — including frozen label.
      merged.items[id] = existing.items[id];
    } else {
      // Item was deleted from current list, but keep historical record.
      merged.items[id] = existing.items[id];
    }
  }
  return merged;
}

export function countDone(entry) {
  let done = 0, total = 0;
  for (const id of Object.keys(entry.items)) {
    total++;
    if (entry.items[id].checked) done++;
  }
  return { done, total };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: refresh `tests/test.html`.
Expected: all green PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add entry.js tests/tests.js
git commit -m "feat(entry): date keys, blank/merge entries, counts"
```

---

## Task 5: View — render checklist for today

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/app.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html` (add styles)

- [ ] **Step 1: Add per-section accent CSS to `index.html`**

Add inside the existing `<style>` block, before `</style>`:

```css
section.section { margin: 18px 0; padding: 12px 14px; border-radius: 12px;
  background: white; border: 1px solid var(--line); }
section.section h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px;
  letter-spacing: 0.01em; }
section.section[data-key="nutrition"]   h2 { color: var(--sage); }
section.section[data-key="supplements"] h2 { color: var(--amber); }
section.section[data-key="activity"]    h2 { color: var(--sky); }
section.section[data-key="structural"]  h2 { color: var(--slate); }

.row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 4px;
  border-top: 1px solid var(--line); cursor: pointer; }
.row:first-of-type { border-top: 0; }
.row input[type="checkbox"] { width: 22px; height: 22px; margin-top: 1px; }
.row .label { flex: 1; }
.row .label small { display: block; color: var(--muted); font-size: 13px; }
.row .note-toggle { display: inline-block; margin-top: 4px; color: var(--muted);
  font-size: 13px; text-decoration: underline; cursor: pointer; }
.row textarea { display: block; width: 100%; margin-top: 6px; padding: 8px;
  border: 1px solid var(--line); border-radius: 8px; font: inherit;
  resize: vertical; min-height: 36px; }
.row[data-checked="true"] .note-toggle, .row[data-checked="true"] textarea { display: none; }
```

- [ ] **Step 2: Replace `app.js` with view wiring**

Overwrite `/Users/akomarraju/workspace/wellness/app.js`:

```js
import { Storage } from "./storage.js";
import { ensureItems } from "./items.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";

const storage = Storage(localStorage);
const items = ensureItems(storage);

const date = todayKey();
const existing = storage.getEntry(date);
const entry = existing ? mergeIntoEntry(existing, items) : blankEntry(date, items);

function fmtTitle(d) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function render() {
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  for (const sec of items.sections) {
    const el = document.createElement("section");
    el.className = "section";
    el.dataset.key = sec.key;
    el.innerHTML = `<h2>${sec.title}</h2>`;
    for (const it of sec.items) {
      const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.id = it.id;
      row.dataset.checked = String(cell.checked);
      row.innerHTML = `
        <input type="checkbox" ${cell.checked ? "checked" : ""} />
        <div class="label">
          ${it.label}
          ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
          ${(!cell.checked && cell.comment) ? `<textarea>${cell.comment}</textarea>` : ""}
        </div>
      `;
      el.appendChild(row);
    }
    root.appendChild(el);
  }
}

function persist() { storage.saveEntry(date, { ...entry, savedAt: new Date().toISOString() }); }

document.addEventListener("change", (ev) => {
  if (ev.target.matches('.row input[type="checkbox"]')) {
    const id = ev.target.closest(".row").dataset.id;
    entry.items[id].checked = ev.target.checked;
    persist();
    render();
  }
});

document.addEventListener("click", (ev) => {
  if (ev.target.matches(".note-toggle")) {
    const row = ev.target.closest(".row");
    if (!row.querySelector("textarea")) {
      const ta = document.createElement("textarea");
      ta.placeholder = "what got in the way?";
      row.querySelector(".label").appendChild(ta);
      ta.focus();
    }
  }
});

let typingTimer;
document.addEventListener("input", (ev) => {
  if (ev.target.matches(".row textarea")) {
    const id = ev.target.closest(".row").dataset.id;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      entry.items[id].comment = ev.target.value;
      persist();
    }, 250);
  }
});

document.getElementById("save-btn").addEventListener("click", () => {
  persist();
  document.getElementById("save-btn").textContent = "Saved ✓";
  setTimeout(() => { document.getElementById("save-btn").textContent = "Save today"; }, 1200);
});

render();
```

- [ ] **Step 3: Open in browser to verify rendering**

Run: `open /Users/akomarraju/workspace/wellness/index.html`
Expected:
- Title shows today's weekday and date.
- Four sections with accent-colored headers.
- 16 rows total. Tapping a checkbox flips it; "X of Y done" updates.
- Unchecked rows show "+ note"; tapping reveals a textarea; typing persists across reload.
- Save button briefly changes to "Saved ✓".

- [ ] **Step 4: Manual reload test**

Run: check 3 boxes, type a note, reload the page.
Expected: checks and note are still there. "X of Y done" matches.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add app.js index.html
git commit -m "feat(view): render today's checklist + per-row notes"
```

---

## Task 6: Settings screen — edit, add, delete, reorder, reset items

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/settings.js`
- Modify: `/Users/akomarraju/workspace/wellness/app.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html` (add minimal styles)

- [ ] **Step 1: Add settings styles to `index.html`**

Inside the existing `<style>` block, before `</style>`:

```css
.settings .sec-block { margin: 18px 0; padding: 12px 14px; border-radius: 12px;
  background: white; border: 1px solid var(--line); }
.settings .sec-block h3 { margin: 0 0 8px; font-size: 15px; }
.settings .item { display: flex; gap: 8px; align-items: center; padding: 6px 0;
  border-top: 1px solid var(--line); }
.settings .item:first-of-type { border-top: 0; }
.settings .item input[type="text"] { flex: 1; padding: 8px; font: inherit;
  border: 1px solid var(--line); border-radius: 8px; }
.settings .item button { padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: white; }
.settings .add { margin-top: 8px; }
.settings .reset { margin-top: 18px; color: var(--muted); }
.settings a.back { color: var(--muted); text-decoration: none; }
```

- [ ] **Step 2: Implement `settings.js`**

Create `/Users/akomarraju/workspace/wellness/settings.js`:

```js
import { defaultItems } from "./items.js";

function slugify(s) {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "item";
}
function uniqueId(items, base) {
  const taken = new Set(items.sections.flatMap(s => s.items.map(i => i.id)));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function renderSettings(root, storage, items, onChange) {
  function save() { storage.saveItems(items); onChange(items); paint(); }

  function paint() {
    root.innerHTML = `<a href="#" class="back" id="back-link">← Back</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings";
    for (const sec of items.sections) {
      const block = document.createElement("div");
      block.className = "sec-block";
      block.dataset.key = sec.key;
      block.innerHTML = `<h3>${sec.title}</h3>`;
      for (const it of sec.items) {
        const row = document.createElement("div");
        row.className = "item";
        row.dataset.id = it.id;
        row.innerHTML = `
          <button data-act="up">↑</button>
          <button data-act="down">↓</button>
          <input type="text" value="${it.label.replace(/"/g, "&quot;")}" />
          <button data-act="del">✕</button>
        `;
        block.appendChild(row);
      }
      const addBtn = document.createElement("button");
      addBtn.className = "add";
      addBtn.dataset.act = "add";
      addBtn.textContent = "+ add item";
      block.appendChild(addBtn);
      wrap.appendChild(block);
    }
    const reset = document.createElement("button");
    reset.className = "reset";
    reset.id = "reset-btn";
    reset.textContent = "Reset to defaults";
    wrap.appendChild(reset);
    root.appendChild(wrap);
  }

  root.addEventListener("click", (ev) => {
    if (ev.target.id === "back-link") { ev.preventDefault(); onChange(items, "back"); return; }
    if (ev.target.id === "reset-btn") {
      if (!confirm("Restore the original 4-section default list? Existing items will be replaced."))
        return;
      const fresh = defaultItems();
      items.sections = fresh.sections;
      save();
      return;
    }
    const block = ev.target.closest(".sec-block");
    if (!block) return;
    const sec = items.sections.find(s => s.key === block.dataset.key);
    const act = ev.target.dataset.act;
    if (act === "add") {
      const label = prompt("New item label:");
      if (!label) return;
      sec.items.push({ id: uniqueId(items, slugify(label)), label });
      save();
      return;
    }
    const itemRow = ev.target.closest(".item");
    if (!itemRow) return;
    const idx = sec.items.findIndex(i => i.id === itemRow.dataset.id);
    if (act === "del") {
      if (!confirm("Delete this item? History keeps the old record.")) return;
      sec.items.splice(idx, 1); save();
    } else if (act === "up" && idx > 0) {
      [sec.items[idx - 1], sec.items[idx]] = [sec.items[idx], sec.items[idx - 1]]; save();
    } else if (act === "down" && idx < sec.items.length - 1) {
      [sec.items[idx + 1], sec.items[idx]] = [sec.items[idx], sec.items[idx + 1]]; save();
    }
  });

  root.addEventListener("change", (ev) => {
    if (ev.target.matches('.settings input[type="text"]')) {
      const block = ev.target.closest(".sec-block");
      const sec = items.sections.find(s => s.key === block.dataset.key);
      const id = ev.target.closest(".item").dataset.id;
      const it = sec.items.find(i => i.id === id);
      it.label = ev.target.value;
      save();
    }
  });

  paint();
}
```

- [ ] **Step 3: Wire Settings into `app.js`**

In `/Users/akomarraju/workspace/wellness/app.js`, add an import and route between main view and settings.

Add at the top, after the existing imports:

```js
import { renderSettings } from "./settings.js";
```

Replace the `render` function with one that respects a `view` flag, and add a router. Find the existing `render();` call at the end and replace the relevant block with:

```js
let view = "main";
function show() {
  const root = document.getElementById("app");
  if (view === "settings") {
    document.getElementById("title").textContent = "Edit checklist";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderSettings(root, storage, items, (newItems, action) => {
      if (action === "back") { view = "main"; show(); return; }
      // After items change: rebuild today's entry to include new items / drop nothing.
      const merged = mergeIntoEntry(entry, items);
      Object.assign(entry, merged);
      persist();
    });
  } else {
    render();
  }
}

document.getElementById("link-settings").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "settings" ? "main" : "settings";
  show();
});

show();
```

Remove the prior bare `render();` call at the bottom.

- [ ] **Step 4: Manual test**

Run: `open /Users/akomarraju/workspace/wellness/index.html`
- Tap Settings → see editable list of all items, grouped by section.
- Rename "Wall Sits ..." → tap Back → main view shows new label.
- Add a new item to Structural → tap Back → it appears in main view, unchecked.
- Delete it → confirm → it's gone from main view; reload page → still gone.
- Reset to defaults → confirm → list returns to seed.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add settings.js app.js index.html
git commit -m "feat(settings): edit/add/delete/reorder/reset items"
```

---

## Task 7: History view (read-only) and Export JSON

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/history.js`
- Create: `/Users/akomarraju/workspace/wellness/export.js`
- Modify: `/Users/akomarraju/workspace/wellness/app.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html` (history styles)

- [ ] **Step 1: Add history styles to `index.html`**

Inside the `<style>` block, before `</style>`:

```css
.history h3 { font-size: 15px; margin: 16px 0 6px; }
.history .day { padding: 12px 14px; background: white; border: 1px solid var(--line);
  border-radius: 12px; margin-bottom: 12px; }
.history .day .summary { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
.history .day ul { margin: 0; padding-left: 18px; }
.history .day li.miss { color: var(--muted); }
.history .day li .why { color: var(--muted); font-size: 13px; }
```

- [ ] **Step 2: Implement `history.js`**

Create `/Users/akomarraju/workspace/wellness/history.js`:

```js
export function renderHistory(root, storage) {
  const all = storage.exportAll().entries;
  const dates = Object.keys(all).sort().reverse();
  root.innerHTML = `<div class="history"></div>`;
  const wrap = root.querySelector(".history");
  if (dates.length === 0) {
    wrap.innerHTML = "<p>No saved days yet.</p>";
    return;
  }
  for (const date of dates) {
    const e = all[date];
    const ids = Object.keys(e.items);
    const done = ids.filter(id => e.items[id].checked).length;
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `<h3>${date}</h3><div class="summary">${done} of ${ids.length} done</div>`;
    const ul = document.createElement("ul");
    for (const id of ids) {
      const it = e.items[id];
      const li = document.createElement("li");
      li.className = it.checked ? "" : "miss";
      li.innerHTML = `${it.checked ? "✓" : "○"} ${it.label || id}`;
      if (!it.checked && it.comment)
        li.innerHTML += ` <span class="why">— ${it.comment}</span>`;
      ul.appendChild(li);
    }
    div.appendChild(ul);
    wrap.appendChild(div);
  }
}
```

- [ ] **Step 3: Implement `export.js`**

Create `/Users/akomarraju/workspace/wellness/export.js`:

```js
export function downloadExport(storage) {
  const data = storage.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `wellness-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Wire History and Export into `app.js`**

Add at the top of `app.js`, with the other imports:

```js
import { renderHistory } from "./history.js";
import { downloadExport } from "./export.js";
```

Update the `show()` function to handle a `history` view. Replace the existing `show()` body with:

```js
function show() {
  const root = document.getElementById("app");
  if (view === "settings") {
    document.getElementById("title").textContent = "Edit checklist";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderSettings(root, storage, items, (newItems, action) => {
      if (action === "back") { view = "main"; show(); return; }
      const merged = mergeIntoEntry(entry, items);
      Object.assign(entry, merged);
      persist();
    });
  } else if (view === "history") {
    document.getElementById("title").textContent = "History";
    document.getElementById("stat").textContent = "";
    renderHistory(root, storage);
  } else {
    render();
  }
}
```

Add link handlers next to the Settings handler:

```js
document.getElementById("link-history").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "history" ? "main" : "history";
  show();
});
document.getElementById("link-export").addEventListener("click", (ev) => {
  ev.preventDefault();
  downloadExport(storage);
});
```

- [ ] **Step 5: Manual test**

Run: refresh `/Users/akomarraju/workspace/wellness/index.html`.
- Save today's entry. Tap History → see today's date with done/total summary, list of all items, ✓/○ markers, comments shown for missed items.
- Tap Export → a file `wellness-export-YYYY-MM-DD.json` downloads. Open it: contains `items` and `entries` keys.

- [ ] **Step 6: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add history.js export.js app.js index.html
git commit -m "feat: history view + json export"
```

---

## Task 8: PWA — manifest, service worker, icons

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/manifest.webmanifest`
- Create: `/Users/akomarraju/workspace/wellness/service-worker.js`
- Create: `/Users/akomarraju/workspace/wellness/icons/icon-192.png`
- Create: `/Users/akomarraju/workspace/wellness/icons/icon-512.png`
- Modify: `/Users/akomarraju/workspace/wellness/index.html`

- [ ] **Step 1: Create the manifest**

Create `/Users/akomarraju/workspace/wellness/manifest.webmanifest`:

```json
{
  "name": "Daily Wellness",
  "short_name": "Wellness",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#faf8f4",
  "theme_color": "#faf8f4",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Run:

```bash
mkdir -p /Users/akomarraju/workspace/wellness/icons
python3 - <<'PY'
import struct, zlib, os
def png(path, size, rgb):
    raw = b''
    for _ in range(size):
        raw += b'\x00' + bytes(rgb) * size
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
root = "/Users/akomarraju/workspace/wellness/icons"
png(os.path.join(root, "icon-192.png"), 192, (138, 166, 138))
png(os.path.join(root, "icon-512.png"), 512, (138, 166, 138))
PY
```

Expected: two solid sage-colored PNG files exist in `icons/`. (Replace with a designed icon later if desired.)

- [ ] **Step 3: Create the service worker**

Create `/Users/akomarraju/workspace/wellness/service-worker.js`:

```js
const CACHE = "wellness-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./storage.js",
  "./items.js",
  "./entry.js",
  "./settings.js",
  "./history.js",
  "./export.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
```

- [ ] **Step 4: Register the service worker from `index.html`**

Add this `<script>` just before the closing `</body>` (after the existing `app.js` script tag):

```html
<script>
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
</script>
```

- [ ] **Step 5: Test PWA over HTTP**

Service workers don't run from `file://`. Run a local static server:

```bash
cd /Users/akomarraju/workspace/wellness
python3 -m http.server 8000
```

Visit `http://localhost:8000/index.html` in Chrome. Open DevTools → Application → Service Workers; confirm `service-worker.js` is activated. Application → Manifest shows the manifest. Reload offline (DevTools → Network → Offline + reload) — page still loads.

- [ ] **Step 6: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add manifest.webmanifest service-worker.js icons/ index.html
git commit -m "feat(pwa): manifest, service worker, install icons"
```

---

## Task 9: Self-test pass and final smoke check

**Files:** none.

- [ ] **Step 1: Run the test page**

Run: `open /Users/akomarraju/workspace/wellness/tests/test.html`
Expected: every line green PASS.

- [ ] **Step 2: Smoke-test the full app**

Run: `python3 -m http.server 8000` in `~/workspace/wellness`, visit `http://localhost:8000/`.
Walk through: check 3 items, write a note on a 4th, tap Save → "Saved ✓". Reload — state persists. Visit Settings → rename one item → back → main view shows new label, history of any earlier entry still shows old label. Visit History → see today's entry. Tap Export → JSON file downloads. Toggle Network → Offline in DevTools → reload — page still loads.

- [ ] **Step 3: Final commit (only if anything changed)**

```bash
cd /Users/akomarraju/workspace/wellness
git status
# If clean: nothing to do.
# If dirty: git add -A && git commit -m "chore: final smoke-test fixes"
```

---

## Out of scope for this plan
- Hosting (GitHub Pages personal repo) — separate, post-build step.
- Google Sheets / Drive backend — separate plan, when v1 has a few weeks of usage.
- Trends / charts / analytics view.
- Auto-prompted weekly export.
- Section-title editing (sections fixed in v1).
