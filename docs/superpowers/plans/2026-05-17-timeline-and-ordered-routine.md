# Timeline + Ordered Routine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Timeline page (per-item dot strips) and a layout toggle on today's checklist that re-orders all items into a single chronological list.

**Architecture:** Pure additive change to the existing single-page vanilla-JS PWA. Adds one new module (`timeline.js`), adds two new methods to `Storage` (`getLayout`/`saveLayout`), adds an `order` integer to each item with idempotent migration in `ensureItems`, and adds a layout toggle + ordered renderer to `app.js`. Existing entries on disk are not migrated.

**Tech Stack:** Vanilla HTML/CSS/JS modules. In-page test harness (no runner). Data persists in localStorage behind the existing `Storage` interface.

**Project root:** `/Users/akomarraju/workspace/wellness`
**Spec:** `/Users/akomarraju/workspace/wellness/docs/superpowers/specs/2026-05-17-timeline-and-ordered-routine-design.md`

---

## File Structure (changes only)

```
wellness/
├── timeline.js              NEW — renderTimeline(root, storage, items)
├── items.js                 MODIFIED — add `order` to seed; migrate existing
├── storage.js               MODIFIED — add getLayout/saveLayout
├── settings.js              MODIFIED — add "Reorder routine" sub-screen
├── app.js                   MODIFIED — layout toggle + ordered renderer + timeline route
├── index.html               MODIFIED — link-timeline anchor + CSS for dots/toggle/ordered
├── service-worker.js        MODIFIED — add timeline.js + bump cache to v2
└── tests/tests.js           MODIFIED — append tests for new behavior
```

---

## Task 1: Storage — getLayout / saveLayout

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/storage.js`
- Modify: `/Users/akomarraju/workspace/wellness/tests/tests.js`

- [ ] **Step 1: Append failing tests to `tests/tests.js`**

Open `/Users/akomarraju/workspace/wellness/tests/tests.js` and insert the following block BEFORE the `// Render` line (which is near the end of the file):

```js
it("getLayout returns 'category' by default", () => {
  const s = fresh();
  eq(s.getLayout(), "category");
});

it("saveLayout then getLayout round-trips", () => {
  const s = fresh();
  s.saveLayout("order");
  eq(s.getLayout(), "order");
});

it("getLayout returns 'category' when junk is stored", () => {
  const s = fresh();
  localStorage.setItem("wellness:layout", '"banana"');
  eq(s.getLayout(), "category");
});
```

- [ ] **Step 2: Verify tests would fail**

Skip — no browser available; the tests would fail because `getLayout`/`saveLayout` don't exist yet.

- [ ] **Step 3: Update `storage.js`**

Open `/Users/akomarraju/workspace/wellness/storage.js`. At the top, add a third constant next to the existing key constants:

```js
const LAYOUT_KEY = "wellness:layout";
```

Then add `getLayout` and `saveLayout` methods to the returned object (place them after `saveEntry` and before `exportAll`):

```js
    getLayout() {
      const v = readJSON(LAYOUT_KEY, "category");
      return v === "category" || v === "order" ? v : "category";
    },
    saveLayout(value) {
      const safe = value === "order" ? "order" : "category";
      writeJSON(LAYOUT_KEY, safe);
    },
```

- [ ] **Step 4: Verify with Node**

Run:

```bash
cd /Users/akomarraju/workspace/wellness
node --input-type=module -e "
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
  };
  const { Storage } = await import('./storage.js');
  const s = Storage(localStorage);
  if (s.getLayout() !== 'category') throw new Error('default failed');
  s.saveLayout('order');
  if (s.getLayout() !== 'order') throw new Error('save round-trip failed');
  s.saveLayout('garbage');
  if (s.getLayout() !== 'category') throw new Error('saveLayout did not sanitize');
  localStorage.setItem('wellness:layout', '\"banana\"');
  if (s.getLayout() !== 'category') throw new Error('getLayout did not sanitize');
  console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add storage.js tests/tests.js
git commit -m "feat(storage): getLayout/saveLayout for layout preference"
```

---

## Task 2: Items — `order` field + migration

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/items.js`
- Modify: `/Users/akomarraju/workspace/wellness/tests/tests.js`

- [ ] **Step 1: Append failing tests to `tests/tests.js`** (before `// Render`)

```js
it("defaultItems assigns order to every item, multiples of 10, ascending", () => {
  const all = defaultItems().sections.flatMap(s => s.items);
  for (const it of all) {
    if (typeof it.order !== "number") throw new Error("missing order: " + it.id);
    if (it.order % 10 !== 0) throw new Error("order not multiple of 10: " + it.id + "=" + it.order);
  }
  // ascending overall (no duplicates)
  const orders = all.map(i => i.order).sort((a,b) => a - b);
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] === orders[i-1]) throw new Error("duplicate order: " + orders[i]);
  }
});

it("defaultItems orders water_140oz first, b12_morning second, morning_walk_30 third", () => {
  const flat = defaultItems().sections.flatMap(s => s.items);
  const byId = Object.fromEntries(flat.map(i => [i.id, i.order]));
  if (!(byId.water_140oz < byId.b12_morning && byId.b12_morning < byId.morning_walk_30))
    throw new Error("default sequence wrong: " + JSON.stringify(byId));
});

it("ensureItems migrates legacy items missing order field", () => {
  const s = fresh();
  // Simulate v1 saved items (no order field)
  const legacy = {
    sections: [
      { key: "nutrition", title: "Nutritional Targets", items: [
        { id: "water_140oz", label: "Water" },
        { id: "protein_125g", label: "Protein" },
      ]},
      { key: "supplements", title: "Supplement Checklist", items: [
        { id: "b12_morning", label: "B12" },
      ]},
    ],
  };
  s.saveItems(legacy);
  const result = ensureItems(s);
  const flat = result.sections.flatMap(sec => sec.items);
  for (const it of flat) {
    if (typeof it.order !== "number") throw new Error("migration missed: " + it.id);
  }
  // saved-back should now have orders too
  const reloaded = s.getItems().sections.flatMap(sec => sec.items);
  for (const it of reloaded) {
    if (typeof it.order !== "number") throw new Error("not persisted: " + it.id);
  }
});

it("ensureItems migration uses default sequence for known ids and falls back for unknown", () => {
  const s = fresh();
  const legacy = {
    sections: [
      { key: "nutrition", title: "N", items: [
        { id: "water_140oz", label: "Water" },           // known: gets default order
        { id: "my_custom_item", label: "Custom" },        // unknown: falls back
      ]},
    ],
  };
  s.saveItems(legacy);
  const result = ensureItems(s);
  const byId = Object.fromEntries(result.sections.flatMap(sec => sec.items).map(i => [i.id, i.order]));
  if (typeof byId.water_140oz !== "number") throw new Error("known not assigned");
  if (typeof byId.my_custom_item !== "number") throw new Error("unknown not assigned");
  // unknown should be > all known orders (at the end)
  if (byId.my_custom_item <= byId.water_140oz) throw new Error("unknown not at end");
});

it("ensureItems is idempotent: items with order are not re-assigned", () => {
  const s = fresh();
  const already = {
    sections: [
      { key: "x", title: "X", items: [
        { id: "a", label: "A", order: 5 },
        { id: "b", label: "B", order: 7 },
      ]},
    ],
  };
  s.saveItems(already);
  const result = ensureItems(s);
  const byId = Object.fromEntries(result.sections.flatMap(sec => sec.items).map(i => [i.id, i.order]));
  if (byId.a !== 5 || byId.b !== 7) throw new Error("idempotency broken: " + JSON.stringify(byId));
});
```

- [ ] **Step 2: Update `items.js`**

Replace the entire contents of `/Users/akomarraju/workspace/wellness/items.js` with:

```js
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
  // Unknown ids placed after all known ones, also on multiples of 10.
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
  ];
  // Assign default orders.
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
  // Returns true if any item was changed.
  const flat = items.sections.flatMap(s => s.items);
  if (flat.every(it => typeof it.order === "number")) return false;
  // Compute current max known order to keep unknowns after.
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
```

- [ ] **Step 3: Verify with Node**

Run:

```bash
cd /Users/akomarraju/workspace/wellness
node --input-type=module -e "
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
  };
  const { Storage } = await import('./storage.js');
  const { defaultItems, ensureItems, nextOrder } = await import('./items.js');

  // defaultItems all have order
  const flat = defaultItems().sections.flatMap(s => s.items);
  for (const it of flat) if (typeof it.order !== 'number') throw new Error('default missing order: ' + it.id);

  // sequence
  const byId = Object.fromEntries(flat.map(i => [i.id, i.order]));
  if (!(byId.water_140oz < byId.b12_morning && byId.b12_morning < byId.morning_walk_30))
    throw new Error('sequence wrong');

  // migration
  const s = Storage(localStorage);
  s.saveItems({ sections: [{ key:'n', title:'N', items: [{ id:'water_140oz', label:'W' }, { id:'unknown_x', label:'U' }] }] });
  const r = ensureItems(s);
  const m = Object.fromEntries(r.sections[0].items.map(i => [i.id, i.order]));
  if (typeof m.water_140oz !== 'number') throw new Error('known not assigned');
  if (typeof m.unknown_x !== 'number') throw new Error('unknown not assigned');
  if (m.unknown_x <= m.water_140oz) throw new Error('unknown not at end');

  // idempotent
  store.clear();
  s.saveItems({ sections: [{ key:'n', title:'N', items: [{ id:'a', label:'A', order: 5 }] }] });
  ensureItems(s);
  if (s.getItems().sections[0].items[0].order !== 5) throw new Error('idempotency broken');

  // nextOrder
  const ni = nextOrder({ sections: [{ key:'n', title:'N', items: [{ id:'a', label:'A', order: 30 }, { id:'b', label:'B', order: 50 }] }] });
  if (ni !== 60) throw new Error('nextOrder wrong: ' + ni);

  console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add items.js tests/tests.js
git commit -m "feat(items): add order field + idempotent migration"
```

---

## Task 3: Settings — Reorder Routine sub-screen

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/settings.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html` (CSS)

- [ ] **Step 1: Add CSS to `index.html`**

Inside the existing `<style>` block, BEFORE `</style>`, append (do not delete any existing CSS):

```css
.settings .reorder-link { display: inline-block; margin-bottom: 12px; padding: 10px 14px;
  background: white; border: 1px solid var(--line); border-radius: 10px;
  color: var(--fg); text-decoration: none; font-weight: 500; }
.reorder { background: white; border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 14px; margin-top: 12px; }
.reorder .ord { display: flex; gap: 8px; align-items: center; padding: 8px 0;
  border-top: 1px solid var(--line); }
.reorder .ord:first-of-type { border-top: 0; }
.reorder .ord button { padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: white; }
.reorder .ord .num { width: 28px; color: var(--muted); font-variant-numeric: tabular-nums; }
.reorder .ord .label { flex: 1; }
```

- [ ] **Step 2: Update `settings.js`**

Read `/Users/akomarraju/workspace/wellness/settings.js`. We will:

1. Replace `import { defaultItems } from "./items.js";` with:

```js
import { defaultItems } from "./items.js";
```

(unchanged — but confirm the import exists)

2. Inside `renderSettings(root, storage, items, onChange)`, after the `const { signal } = controller;` line, add:

```js
  let mode = "main"; // "main" | "reorder"
```

3. Replace the existing `function paint() { ... }` body with one that branches on `mode`:

Locate the current `function paint() { ... }`. Replace it entirely with:

```js
  function paintMain() {
    root.innerHTML = `<a href="#" class="back" id="back-link">← Back</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings";

    const reorder = document.createElement("a");
    reorder.href = "#";
    reorder.className = "reorder-link";
    reorder.id = "reorder-link";
    reorder.textContent = "Reorder routine →";
    wrap.appendChild(reorder);

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

  function paintReorder() {
    root.innerHTML = `<a href="#" class="back" id="back-to-settings">← Back to settings</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings";
    const card = document.createElement("div");
    card.className = "reorder";

    const flat = items.sections.flatMap(s => s.items)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    flat.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "ord";
      row.dataset.id = it.id;
      row.innerHTML = `
        <button data-act="rup">↑</button>
        <button data-act="rdown">↓</button>
        <span class="num">${idx + 1}.</span>
        <span class="label">${it.label}</span>
      `;
      card.appendChild(row);
    });
    wrap.appendChild(card);
    root.appendChild(wrap);
  }

  function paint() {
    if (mode === "reorder") paintReorder();
    else paintMain();
  }
```

4. Inside the existing `root.addEventListener("click", (ev) => { ... }, { signal });` handler, add reorder navigation handling at the top of the handler (before the existing back-link check). Replace the FIRST line of the handler body:

```js
    if (ev.target.id === "back-link") { ev.preventDefault(); controller.abort(); onChange(items, "back"); return; }
```

with this expanded handling block:

```js
    if (ev.target.id === "back-link") { ev.preventDefault(); controller.abort(); onChange(items, "back"); return; }
    if (ev.target.id === "reorder-link") { ev.preventDefault(); mode = "reorder"; paint(); return; }
    if (ev.target.id === "back-to-settings") { ev.preventDefault(); mode = "main"; paint(); return; }
    if (ev.target.dataset.act === "rup" || ev.target.dataset.act === "rdown") {
      const row = ev.target.closest(".ord");
      const id = row.dataset.id;
      const flat = items.sections.flatMap(s => s.items)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const idx = flat.findIndex(i => i.id === id);
      const swapWith = ev.target.dataset.act === "rup" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= flat.length) return;
      const a = flat[idx], b = flat[swapWith];
      const tmp = a.order; a.order = b.order; b.order = tmp;
      save();
      return;
    }
```

(The remainder of the click handler — the section-block handlers for add/del/up/down — stays unchanged.)

- [ ] **Step 3: Verify with Node syntax check**

```bash
cd /Users/akomarraju/workspace/wellness
node --check settings.js
grep -c "paintReorder" settings.js   # 1
grep -c "reorder-link" settings.js   # 2 (creation + click handler)
grep -c "back-to-settings" settings.js  # 2
grep -c "rup" settings.js            # 2
grep -c "rdown" settings.js          # 2
```

Expected: no syntax errors; counts as noted.

- [ ] **Step 4: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add settings.js index.html
git commit -m "feat(settings): reorder-routine sub-screen with global ↑/↓"
```

---

## Task 4: Timeline module

**Files:**
- Create: `/Users/akomarraju/workspace/wellness/timeline.js`
- Modify: `/Users/akomarraju/workspace/wellness/tests/tests.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html` (CSS)

- [ ] **Step 1: Append failing tests to `tests/tests.js`** (before `// Render`)

```js
import { computeDateWindow, classifyCell } from "../timeline.js";

it("computeDateWindow returns up to 30 dates ending in today, ascending", () => {
  const today = new Date(2026, 4, 17); // 2026-05-17
  const w = computeDateWindow(today, 5);
  eq(w, ["2026-05-13","2026-05-14","2026-05-15","2026-05-16","2026-05-17"]);
});

it("computeDateWindow caps at 30 days when given a larger N", () => {
  const today = new Date(2026, 4, 17);
  const w = computeDateWindow(today, 100);
  eq(w.length, 30);
  eq(w[w.length - 1], "2026-05-17");
});

it("classifyCell returns red when entry is missing", () => {
  eq(classifyCell(null, "any_id"), "red");
});

it("classifyCell returns green when item checked", () => {
  const e = { items: { a: { checked: true, comment: "" } } };
  eq(classifyCell(e, "a"), "green");
});

it("classifyCell returns grey when entry exists but item is unchecked", () => {
  const e = { items: { a: { checked: false, comment: "" } } };
  eq(classifyCell(e, "a"), "grey");
});

it("classifyCell returns red when item not in entry's items map", () => {
  const e = { items: { other: { checked: true } } };
  eq(classifyCell(e, "missing_id"), "red");
});
```

- [ ] **Step 2: Add CSS to `index.html`**

Inside the existing `<style>` block, BEFORE `</style>`, append (do not delete any existing CSS):

```css
.timeline-legend { color: var(--muted); font-size: 12px; margin-bottom: 8px;
  display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.timeline-legend .swatch { display: inline-block; width: 10px; height: 10px;
  border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.timeline .sec-block { margin: 14px 0; padding: 10px 12px; border-radius: 12px;
  background: white; border: 1px solid var(--line); }
.timeline .sec-block h3 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
.timeline .sec-block[data-key="nutrition"]   h3 { color: var(--sage); }
.timeline .sec-block[data-key="supplements"] h3 { color: var(--amber); }
.timeline .sec-block[data-key="activity"]    h3 { color: var(--sky); }
.timeline .sec-block[data-key="structural"]  h3 { color: var(--slate); }
.timeline .row { display: flex; align-items: center; gap: 10px; padding: 6px 0;
  border-top: 1px solid var(--line); }
.timeline .row:first-of-type { border-top: 0; }
.timeline .row .label { flex: 1; font-size: 14px; }
.timeline .strip { display: flex; gap: 3px; }
.timeline .dot { width: 10px; height: 10px; border-radius: 50%; }
.timeline .dot.green { background: var(--sage); }
.timeline .dot.grey  { background: var(--muted); opacity: 0.45; }
.timeline .dot.red   { background: #c87b7b; }
.timeline .empty { color: var(--muted); padding: 12px 0; }
@media (max-width: 460px) {
  .timeline .row { flex-direction: column; align-items: flex-start; gap: 4px; }
  .timeline .row .label { font-size: 13px; }
}
```

- [ ] **Step 3: Create `timeline.js`**

Create `/Users/akomarraju/workspace/wellness/timeline.js`:

```js
function pad(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function computeDateWindow(today = new Date(), n = 30) {
  const cap = Math.min(n, 30);
  const out = [];
  for (let i = cap - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

export function classifyCell(entry, itemId) {
  if (!entry || !entry.items) return "red";
  const cell = entry.items[itemId];
  if (!cell) return "red";
  return cell.checked ? "green" : "grey";
}

export function renderTimeline(root, storage, items) {
  const all = storage.exportAll().entries;
  const dates = computeDateWindow(new Date(), 30);

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "timeline";

  const legend = document.createElement("div");
  legend.className = "timeline-legend";
  legend.innerHTML = `
    <span><span class="swatch" style="background: var(--sage)"></span>done</span>
    <span><span class="swatch" style="background: var(--muted); opacity: 0.45"></span>tracked, not done</span>
    <span><span class="swatch" style="background: #c87b7b"></span>no entry</span>
    <span>· Last ${dates.length} days · today on the right</span>
  `;
  wrap.appendChild(legend);

  if (Object.keys(all).length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No saved days yet. Open the app each day and tap Save to start your timeline.";
    wrap.appendChild(empty);
    root.appendChild(wrap);
    return;
  }

  for (const sec of items.sections) {
    if (sec.items.length === 0) continue;
    const block = document.createElement("div");
    block.className = "sec-block";
    block.dataset.key = sec.key;
    block.innerHTML = `<h3>${sec.title}</h3>`;
    for (const it of sec.items) {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = it.label;
      row.appendChild(label);
      const strip = document.createElement("div");
      strip.className = "strip";
      for (const date of dates) {
        const cls = classifyCell(all[date], it.id);
        const dot = document.createElement("span");
        dot.className = `dot ${cls}`;
        dot.title = `${date}: ${cls}`;
        strip.appendChild(dot);
      }
      row.appendChild(strip);
      block.appendChild(row);
    }
    wrap.appendChild(block);
  }
  root.appendChild(wrap);
}
```

- [ ] **Step 4: Verify with Node**

```bash
cd /Users/akomarraju/workspace/wellness
node --check timeline.js
node --input-type=module -e "
  const { computeDateWindow, classifyCell } = await import('./timeline.js');
  const w = computeDateWindow(new Date(2026, 4, 17), 5);
  if (JSON.stringify(w) !== JSON.stringify(['2026-05-13','2026-05-14','2026-05-15','2026-05-16','2026-05-17'])) throw new Error('window wrong: ' + JSON.stringify(w));
  if (computeDateWindow(new Date(2026, 4, 17), 100).length !== 30) throw new Error('cap failed');
  if (classifyCell(null, 'a') !== 'red') throw new Error('null entry');
  if (classifyCell({items:{a:{checked:true}}}, 'a') !== 'green') throw new Error('green');
  if (classifyCell({items:{a:{checked:false}}}, 'a') !== 'grey') throw new Error('grey');
  if (classifyCell({items:{}}, 'a') !== 'red') throw new Error('missing key');
  console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add timeline.js index.html tests/tests.js
git commit -m "feat(timeline): per-item dot strips, last 30 days, read-only"
```

---

## Task 5: App wiring — Timeline route + layout toggle + ordered renderer

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/app.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html`

- [ ] **Step 1: Add `link-timeline` to the save bar in `index.html`**

Locate this block in `index.html`:

```html
      <a href="#" id="link-history">History</a>
      <a href="#" id="link-settings">Settings</a>
      <a href="#" id="link-export">Export</a>
```

Replace with:

```html
      <a href="#" id="link-history">History</a>
      <a href="#" id="link-settings">Settings</a>
      <a href="#" id="link-timeline">Timeline</a>
      <a href="#" id="link-export">Export</a>
```

- [ ] **Step 2: Add layout-toggle and ordered-list CSS to `index.html`**

Inside the existing `<style>` block, BEFORE `</style>`, append:

```css
.layout-toggle { display: inline-flex; border: 1px solid var(--line);
  border-radius: 10px; overflow: hidden; margin: 6px 0 12px; background: white; }
.layout-toggle button { padding: 8px 14px; border: 0; background: white;
  color: var(--muted); font: inherit; cursor: pointer; }
.layout-toggle button.active { background: var(--fg); color: white; }

section.ordered { margin: 18px 0; padding: 12px 14px; border-radius: 12px;
  background: white; border: 1px solid var(--line); }
section.ordered .row .num { width: 28px; color: var(--muted);
  font-variant-numeric: tabular-nums; flex: 0 0 auto; }
```

- [ ] **Step 3: Update `app.js`**

Open `/Users/akomarraju/workspace/wellness/app.js`.

(a) Add an import next to the existing imports:

```js
import { renderTimeline } from "./timeline.js";
```

(b) After the line `const items = ensureItems(storage);`, add:

```js
let layout = storage.getLayout();
```

(c) Replace the existing `function render() { ... }` (the categorized renderer) with TWO functions: `renderCategory()` (the renamed/cleaned existing one) plus `renderOrdered()`. The existing function body stays — only its name changes from `render` to `renderCategory`. Locate `function render() {` and rename it to `function renderCategory() {`. Also change the `else { render(); }` line inside `show()` to invoke a new dispatcher function `renderMain()` (added below).

Then, ABOVE `function renderCategory()`, add the toggle-rendering helper:

```js
function renderToggle() {
  const host = document.querySelector("main header");
  let bar = document.getElementById("layout-toggle");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "layout-toggle";
    bar.className = "layout-toggle";
    bar.innerHTML = `
      <button data-layout="category">By category</button>
      <button data-layout="order">By order</button>
    `;
    host.appendChild(bar);
    bar.addEventListener("click", (ev) => {
      const v = ev.target?.dataset?.layout;
      if (v !== "category" && v !== "order") return;
      if (layout === v) return;
      layout = v;
      storage.saveLayout(layout);
      renderToggle();
      renderMain();
    });
  }
  for (const btn of bar.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.layout === layout);
  }
}
```

BELOW `renderCategory`, add:

```js
function renderOrdered() {
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  const sec = document.createElement("section");
  sec.className = "ordered";
  const flat = items.sections.flatMap(s => s.items)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  flat.forEach((it, idx) => {
    const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = it.id;
    row.dataset.checked = String(cell.checked);
    row.innerHTML = `
      <input type="checkbox" ${cell.checked ? "checked" : ""} />
      <div class="num">${idx + 1}.</div>
      <div class="label">
        ${it.label}
        ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
        ${(!cell.checked && cell.comment) ? `<textarea>${cell.comment}</textarea>` : ""}
      </div>
    `;
    sec.appendChild(row);
  });
  root.appendChild(sec);
}

function renderMain() {
  // Remove any timeline/settings/history-only artifacts the toggle host depends on.
  if (layout === "order") renderOrdered();
  else renderCategory();
  renderToggle();
}
```

(d) Update `show()` so the main branch calls `renderMain()` and add a `view === "timeline"` branch. Replace the existing `show()` body:

```js
function show() {
  const root = document.getElementById("app");
  // Hide toggle outside the main view.
  const existingToggle = document.getElementById("layout-toggle");
  if (view !== "main" && existingToggle) existingToggle.remove();

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
  } else if (view === "timeline") {
    document.getElementById("title").textContent = "Timeline";
    document.getElementById("stat").textContent = "";
    renderTimeline(root, storage, items);
  } else {
    renderMain();
  }
}
```

(e) Add the `link-timeline` click handler immediately after the existing `link-history` handler:

```js
document.getElementById("link-timeline").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "timeline" ? "main" : "timeline";
  show();
});
```

- [ ] **Step 4: Verify**

```bash
cd /Users/akomarraju/workspace/wellness
node --check app.js
grep -c "renderTimeline" app.js   # 2
grep -c "renderOrdered" app.js    # 2
grep -c "renderCategory" app.js   # 2
grep -c "renderMain" app.js       # 3 or more
grep -c "link-timeline" app.js    # 1
grep -c "layout-toggle" app.js    # >= 2
grep -c "link-timeline" index.html  # 1
```

- [ ] **Step 5: Boot static server and smoke-fetch**

```bash
cd /Users/akomarraju/workspace/wellness
python3 -m http.server 8765 > /tmp/wellness-server.log 2>&1 &
PID=$!
sleep 1
curl -s -o /dev/null -w "index: HTTP %{http_code}\n" http://localhost:8765/index.html
curl -s -o /dev/null -w "timeline.js: HTTP %{http_code}\n" http://localhost:8765/timeline.js
curl -s -o /dev/null -w "app.js: HTTP %{http_code}\n" http://localhost:8765/app.js
kill $PID 2>/dev/null
wait 2>/dev/null
```

Expected: all 200.

- [ ] **Step 6: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add app.js index.html
git commit -m "feat(view): timeline route + layout toggle + ordered renderer"
```

---

## Task 6: Service worker — add timeline.js, bump cache to v2

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/service-worker.js`

- [ ] **Step 1: Update `service-worker.js`**

Replace the file contents at `/Users/akomarraju/workspace/wellness/service-worker.js` with:

```js
const CACHE = "wellness-v2";
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
  "./timeline.js",
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

- [ ] **Step 2: Verify**

```bash
cd /Users/akomarraju/workspace/wellness
node --check service-worker.js
grep -c "wellness-v2" service-worker.js   # 1
grep -c "timeline.js" service-worker.js   # 1
```

- [ ] **Step 3: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add service-worker.js
git commit -m "chore(pwa): add timeline.js + bump cache to v2"
```

---

## Task 7: Final smoke test

**Files:** none.

- [ ] **Step 1: Run all unit tests via Node**

```bash
cd /Users/akomarraju/workspace/wellness
node --input-type=module -e "
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
    removeItem: k => store.delete(k),
  };
  const { Storage } = await import('./storage.js');
  const { defaultItems, ensureItems, nextOrder } = await import('./items.js');
  const { todayKey, blankEntry, countDone, mergeIntoEntry, snapshotItems } = await import('./entry.js');
  const { computeDateWindow, classifyCell } = await import('./timeline.js');

  let pass = 0, fail = 0;
  function it(n, fn){ try{ fn(); pass++; console.log('PASS', n);} catch(e){ fail++; console.log('FAIL', n, '-', e.message);} }
  function eq(a,b){ if (JSON.stringify(a)!==JSON.stringify(b)) throw new Error(JSON.stringify(a)+' !== '+JSON.stringify(b)); }
  function fresh(){ store.clear(); return Storage(localStorage); }

  // Storage v1 (sanity)
  it('storage round-trip', () => { const s=fresh(); s.saveItems({sections:[]}); eq(s.getItems(), {sections:[]}); });
  // Storage layout
  it('default layout is category', () => { eq(fresh().getLayout(), 'category'); });
  it('saveLayout round-trips', () => { const s=fresh(); s.saveLayout('order'); eq(s.getLayout(), 'order'); });
  it('saveLayout sanitizes', () => { const s=fresh(); s.saveLayout('garbage'); eq(s.getLayout(), 'category'); });

  // Items
  it('defaultItems all have order', () => { for (const it of defaultItems().sections.flatMap(s=>s.items)) if (typeof it.order!=='number') throw new Error(it.id); });
  it('ensureItems migrates legacy', () => {
    const s=fresh(); s.saveItems({sections:[{key:'n',title:'N',items:[{id:'water_140oz',label:'W'}]}]});
    const r=ensureItems(s); if (typeof r.sections[0].items[0].order!=='number') throw new Error('not migrated');
  });
  it('ensureItems idempotent', () => {
    const s=fresh(); s.saveItems({sections:[{key:'n',title:'N',items:[{id:'a',label:'A',order:5}]}]});
    ensureItems(s); if (s.getItems().sections[0].items[0].order!==5) throw new Error('reassigned');
  });
  it('nextOrder', () => { eq(nextOrder({sections:[{key:'n',title:'N',items:[{id:'a',label:'A',order:30}]}]}), 40); });

  // Entry (sanity)
  it('todayKey', () => { eq(todayKey(new Date(2026,4,17)), '2026-05-17'); });
  it('blankEntry', () => {
    const items={sections:[{key:'n',title:'N',items:[{id:'a',label:'A',order:10}]}]};
    eq(blankEntry('2026-05-17', items).items, {a:{label:'A',checked:false,comment:''}});
  });

  // Timeline
  it('computeDateWindow length 5', () => {
    eq(computeDateWindow(new Date(2026,4,17), 5), ['2026-05-13','2026-05-14','2026-05-15','2026-05-16','2026-05-17']);
  });
  it('computeDateWindow caps at 30', () => { eq(computeDateWindow(new Date(2026,4,17), 100).length, 30); });
  it('classifyCell red null', () => { eq(classifyCell(null, 'a'), 'red'); });
  it('classifyCell green', () => { eq(classifyCell({items:{a:{checked:true}}}, 'a'), 'green'); });
  it('classifyCell grey', () => { eq(classifyCell({items:{a:{checked:false}}}, 'a'), 'grey'); });

  console.log('---', 'PASS:', pass, 'FAIL:', fail);
  if (fail>0) process.exit(1);
"
```

Expected: every line `PASS`, FAIL=0.

- [ ] **Step 2: Boot static server and verify all assets**

```bash
cd /Users/akomarraju/workspace/wellness
python3 -m http.server 8765 > /tmp/wellness-server.log 2>&1 &
PID=$!
sleep 1
for path in index.html app.js storage.js items.js entry.js settings.js history.js export.js timeline.js manifest.webmanifest service-worker.js icons/icon-192.png icons/icon-512.png; do
  curl -s -o /dev/null -w "$path: HTTP %{http_code}\n" "http://localhost:8765/$path"
done
kill $PID 2>/dev/null
wait 2>/dev/null
```

Expected: every line `HTTP 200`.

- [ ] **Step 3: Verify no uncommitted changes**

```bash
cd /Users/akomarraju/workspace/wellness
git status
```

Expected: working tree clean.

---

## Out of scope for this plan
- Drag-and-drop reorder on touch.
- Color-blind palette toggle.
- Per-day popover on Timeline dots (intentionally removed).
- Section-color tinting in Ordered view.
- Times-of-day on items.
