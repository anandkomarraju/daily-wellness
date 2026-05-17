# Wellness v3 Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the wellness app from sectioned items + layout toggle to a flat 14-item routine, drop "By category", add fasting timer + water counter + macros log to the top of the page.

**Architecture:** Breaking change to `wellness:items` shape (`{sections:[...]}` → `{items:[...]}`). Idempotent migration in `ensureItems` rebuilds the list to the new 14-item routine while preserving renamed labels for carried-over IDs. New entry-level fields (`waterOz`, `fastStartedAt`, `fastEndedAt`, per-item `macros`) are additive — old entries remain readable. Top-of-page widgets (fasting pill, water counter, log tally) live in the same `#app` root as the ordered list and re-render on state changes; a 60-second ticker keeps the fasting duration live. The "By category" code path, layout toggle, and per-section settings UI are deleted.

**Tech Stack:** Vanilla HTML/CSS/JS modules. In-page test harness (no runner). Same constraints as v1/v2.

**Project root:** `/Users/akomarraju/workspace/wellness`
**Spec:** `/Users/akomarraju/workspace/wellness/docs/superpowers/specs/2026-05-17-wellness-v3-restructure-design.md`

---

## File Structure (changes only)

```
wellness/
├── items.js              REWRITTEN — flat items model + migration from old shape
├── storage.js            MODIFIED — drop getLayout/saveLayout (keep stubs returning "category" for safety)
├── settings.js           REWRITTEN — single flat list with rename/add/del/↑↓/macros-toggle/reset
├── timeline.js           MODIFIED — flat (no section grouping), 14 dot strips
├── app.js                LARGELY REWRITTEN — drop renderCategory + toggle, add fasting/water/log/macros
├── index.html            MODIFIED — new CSS for top widgets + macro inputs; remove unused section/toggle CSS
├── service-worker.js     MODIFIED — bump CACHE to "wellness-v4"
├── history.js            UNCHANGED (still works on the entry shape; new fields just don't render)
├── export.js             UNCHANGED (generic dump)
└── tests/tests.js        MODIFIED — append tests for items v3 migration, fasting state, water taps, log tally
```

---

## Task 1: Storage — drop layout methods (silent removal)

Layout is no longer toggleable. Replace `getLayout` / `saveLayout` so the rest of the app can be torn out cleanly without breaking older callers that may linger during refactor.

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/storage.js`

- [ ] **Step 1: Open `/Users/akomarraju/workspace/wellness/storage.js` and remove the `LAYOUT_KEY` line and the `getLayout` + `saveLayout` methods**

Locate these lines and delete them:

```js
const LAYOUT_KEY = "wellness:layout";
```

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

Also remove related tests in `/Users/akomarraju/workspace/wellness/tests/tests.js`:

```js
it("getLayout returns 'category' by default", () => { ... });
it("saveLayout then getLayout round-trips", () => { ... });
it("getLayout returns 'category' when junk is stored", () => { ... });
```

Delete those three `it()` blocks entirely.

- [ ] **Step 2: Verify with Node**

```bash
cd /Users/akomarraju/workspace/wellness
node --input-type=module -e "
  const store = new Map();
  globalThis.localStorage = { getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), clear:()=>store.clear() };
  const { Storage } = await import('./storage.js');
  const s = Storage(localStorage);
  if (typeof s.getLayout !== 'undefined') throw new Error('getLayout should be gone');
  if (typeof s.saveLayout !== 'undefined') throw new Error('saveLayout should be gone');
  // unchanged methods still work
  s.saveItems({items:[]});
  if (JSON.stringify(s.getItems()) !== '{\"items\":[]}') throw new Error('getItems broken');
  console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add storage.js tests/tests.js
git commit -m "refactor(storage): drop layout methods (no longer toggleable)"
```

---

## Task 2: Items — flat shape + migration

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/items.js`
- Modify: `/Users/akomarraju/workspace/wellness/tests/tests.js`

- [ ] **Step 1: Append failing tests to `tests/tests.js`** (before `// Render`)

```js
it("v3 defaultItems returns 14 items with flat shape", () => {
  const di = defaultItems();
  if (!Array.isArray(di.items)) throw new Error("not flat: " + JSON.stringify(di).slice(0, 80));
  if (di.items.length !== 14) throw new Error("expected 14, got " + di.items.length);
});

it("v3 defaultItems first three are b12, morning walk, breakfast in order", () => {
  const di = defaultItems();
  const ids = di.items.map(i => i.id);
  eq(ids.slice(0,3), ["b12_morning","morning_walk_30","breakfast"]);
});

it("v3 defaultItems marks the 4 logged items with macros:true", () => {
  const di = defaultItems();
  const macroIds = di.items.filter(i => i.macros === true).map(i => i.id);
  eq(macroIds.sort(), ["breakfast","dinner","lunch","nuts"]);
});

it("v3 defaultItems orders are multiples of 10 ascending", () => {
  const di = defaultItems();
  const orders = di.items.map(i => i.order);
  for (let i=1; i<orders.length; i++) if (orders[i] <= orders[i-1]) throw new Error("not ascending");
  for (const o of orders) if (o % 10 !== 0) throw new Error("not multiple of 10: "+o);
});

it("v3 ensureItems migrates v2 sectioned shape into v3 flat shape", () => {
  const s = fresh();
  const v2 = { sections: [
    { key: "nutrition", title: "Nutritional Targets", items: [
      { id: "water_140oz", label: "Water 20oz", order: 10 },
      { id: "protein_125g", label: "Protein: ≥ 125g", order: 40 },
    ]},
    { key: "supplements", title: "Supplement Checklist", items: [
      { id: "b12_morning", label: "Morning B12 (custom)", order: 20 },
      { id: "magnesium_eve", label: "Evening Magnesium Glycinate", order: 150 },
    ]},
  ]};
  s.saveItems(v2);
  const r = ensureItems(s);
  if (!Array.isArray(r.items)) throw new Error("did not migrate to flat shape");
  if (r.items.length !== 14) throw new Error("expected 14 items after migration, got " + r.items.length);
  // saved-back is also v3
  if (!Array.isArray(s.getItems().items)) throw new Error("not persisted as v3");
});

it("v3 ensureItems preserves user-renamed labels via id mapping", () => {
  const s = fresh();
  const v2 = { sections: [
    { key: "supplements", title: "S", items: [
      { id: "b12_morning", label: "My custom B12 label", order: 20 },
      { id: "d_k2_fishoil_pm", label: "My custom D label", order: 80 },
      { id: "collagen_7pm", label: "My custom collagen label", order: 140 },
    ]},
  ]};
  s.saveItems(v2);
  const r = ensureItems(s);
  const byId = Object.fromEntries(r.items.map(i => [i.id, i.label]));
  if (byId.b12_morning !== "My custom B12 label") throw new Error("b12 label not preserved");
  if (byId.d_k2_fishoil !== "My custom D label") throw new Error("d_k2_fishoil rename mapping failed");
  if (byId.collagen_coffee !== "My custom collagen label") throw new Error("collagen_coffee rename mapping failed");
});

it("v3 ensureItems is idempotent on already-flat shape", () => {
  const s = fresh();
  const v3 = { items: [
    { id: "b12_morning", label: "Morning B12 Sublingual", order: 10 },
    { id: "breakfast", label: "Breakfast", order: 30, macros: true },
  ]};
  s.saveItems(v3);
  const r = ensureItems(s);
  if (r.items.length !== 2) throw new Error("idempotency broken: count " + r.items.length);
  eq(r.items.map(i => i.id), ["b12_morning","breakfast"]);
});

it("v3 nextOrder works on flat shape", () => {
  const r = nextOrder({ items: [{ id:"a", label:"A", order:30 }, { id:"b", label:"B", order:50 }] });
  if (r !== 60) throw new Error("nextOrder wrong: " + r);
});
```

- [ ] **Step 2: Replace the entire contents of `/Users/akomarraju/workspace/wellness/items.js` with:**

```js
const RENAME_MAP = {
  "d_k2_fishoil_pm": "d_k2_fishoil",
  "collagen_7pm":    "collagen_coffee",
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
  // Return a fresh deep copy so callers can mutate.
  return { items: DEFAULT_ITEMS_V3.map(it => ({ ...it })) };
}

function migrateFromV2(saved) {
  // Collect old labels keyed by NEW id (after rename).
  const oldLabels = {};
  const oldDefaults = {
    b12_morning:        "Morning: B12 Sublingual",
    morning_walk_30:    "Morning Walk: 30 mins (Fasted)",
    magnesium_eve:      "Evening: Magnesium Glycinate",
    d_k2_fishoil_pm:    "Afternoon Fat: Vitamin D, K2 MK7, Fish Oil",
    collagen_7pm:       "By 7 PM: 1 scoop Collagen in Coffee",
  };
  for (const sec of saved.sections ?? []) {
    for (const it of sec.items ?? []) {
      const newId = RENAME_MAP[it.id] ?? it.id;
      const wasDefaultLabel = oldDefaults[it.id] && it.label === oldDefaults[it.id];
      if (it.label && !wasDefaultLabel) {
        oldLabels[newId] = it.label;
      }
    }
  }
  // Build fresh v3 list, override labels where user had renamed.
  const fresh = defaultItems();
  for (const it of fresh.items) {
    if (oldLabels[it.id]) it.label = oldLabels[it.id];
  }
  return fresh;
}

export function ensureItems(storage) {
  const saved = storage.getItems();
  if (saved && Array.isArray(saved.items)) {
    return saved; // already v3
  }
  if (saved && Array.isArray(saved.sections)) {
    const migrated = migrateFromV2(saved);
    storage.saveItems(migrated);
    return migrated;
  }
  // Nothing saved or unrecognized — seed defaults.
  const seed = defaultItems();
  storage.saveItems(seed);
  return seed;
}

export function nextOrder(items) {
  if (!items.items || items.items.length === 0) return 10;
  return Math.max(...items.items.map(i => i.order ?? 0)) + 10;
}
```

- [ ] **Step 3: Verify with Node**

```bash
cd /Users/akomarraju/workspace/wellness
node --input-type=module -e "
  const store = new Map();
  globalThis.localStorage = { getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), clear:()=>store.clear() };
  const { Storage } = await import('./storage.js');
  const { defaultItems, ensureItems, nextOrder } = await import('./items.js');

  // shape
  const di = defaultItems();
  if (!Array.isArray(di.items)) throw new Error('not flat');
  if (di.items.length !== 14) throw new Error('count: ' + di.items.length);

  // migration
  const s = Storage(localStorage);
  s.saveItems({ sections:[{ key:'s', title:'S', items:[
    { id:'b12_morning', label:'My B12', order:20 },
    { id:'d_k2_fishoil_pm', label:'My D', order:80 },
    { id:'collagen_7pm', label:'My collagen', order:140 },
  ]}]});
  const r = ensureItems(s);
  if (!Array.isArray(r.items)) throw new Error('migration shape');
  const byId = Object.fromEntries(r.items.map(i => [i.id, i.label]));
  if (byId.b12_morning !== 'My B12') throw new Error('b12 label');
  if (byId.d_k2_fishoil !== 'My D') throw new Error('d_k2 label');
  if (byId.collagen_coffee !== 'My collagen') throw new Error('collagen label');

  // idempotent on v3
  store.clear();
  s.saveItems({ items:[{id:'a',label:'A',order:10}] });
  const r2 = ensureItems(s);
  if (r2.items.length !== 1 || r2.items[0].id !== 'a') throw new Error('idempotency');

  // nextOrder
  if (nextOrder({items:[{id:'a',label:'A',order:30}]}) !== 40) throw new Error('nextOrder');

  console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add items.js tests/tests.js
git commit -m "feat(items): flat 14-item v3 shape + migration from sectioned v2"
```

---

## Task 3: Settings — single flat list

Settings becomes a single flat editor: rename / ↑↓ / ✕ / + add item / macros toggle / reset.

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/settings.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html` (CSS)

- [ ] **Step 1: Append CSS to `index.html`** (inside `<style>`, before `</style>`)

```css
.settings .flat-list { background: white; border: 1px solid var(--line); border-radius: 12px;
  padding: 8px 12px; margin-top: 6px; }
.settings .flat-list .item { display: flex; gap: 8px; align-items: center; padding: 8px 0;
  border-top: 1px solid var(--line); }
.settings .flat-list .item:first-of-type { border-top: 0; }
.settings .flat-list .num { width: 28px; color: var(--muted); font-variant-numeric: tabular-nums; }
.settings .flat-list .item input[type="text"] { flex: 1; padding: 8px; font: inherit;
  border: 1px solid var(--line); border-radius: 8px; }
.settings .flat-list .item button { padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: white; }
.settings .flat-list .macros-chip { padding: 4px 8px; border-radius: 999px; font-size: 12px;
  border: 1px solid var(--line); background: white; color: var(--muted); cursor: pointer; }
.settings .flat-list .macros-chip.on { background: var(--fg); color: white; border-color: var(--fg); }
```

- [ ] **Step 2: Replace `/Users/akomarraju/workspace/wellness/settings.js` with:**

```js
import { defaultItems, nextOrder } from "./items.js";

function slugify(s) {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "item";
}
function uniqueId(items, base) {
  const taken = new Set(items.items.map(i => i.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function renderSettings(root, storage, items, onChange) {
  const controller = new AbortController();
  const { signal } = controller;

  function save() { storage.saveItems(items); onChange(items); paint(); }

  function paint() {
    items.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    root.innerHTML = `<a href="#" class="back" id="back-link">← Back</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings";

    const list = document.createElement("div");
    list.className = "flat-list";
    items.items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "item";
      row.dataset.id = it.id;
      row.innerHTML = `
        <button data-act="up">↑</button>
        <button data-act="down">↓</button>
        <span class="num">${idx + 1}.</span>
        <input type="text" value="${it.label.replace(/"/g, "&quot;")}" />
        <button class="macros-chip ${it.macros ? "on" : ""}" data-act="macros" title="Toggle macro tracking">macros</button>
        <button data-act="del" title="Delete">✕</button>
      `;
      list.appendChild(row);
    });
    wrap.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.className = "add";
    addBtn.id = "add-btn";
    addBtn.textContent = "+ add item";
    wrap.appendChild(addBtn);

    const reset = document.createElement("button");
    reset.className = "reset";
    reset.id = "reset-btn";
    reset.textContent = "Reset to defaults";
    wrap.appendChild(reset);

    root.appendChild(wrap);
  }

  root.addEventListener("click", (ev) => {
    if (ev.target.id === "back-link") { ev.preventDefault(); controller.abort(); onChange(items, "back"); return; }
    if (ev.target.id === "reset-btn") {
      if (!confirm("Restore the default 14-item routine? Existing items will be replaced.")) return;
      const fresh = defaultItems();
      items.items = fresh.items;
      save();
      return;
    }
    if (ev.target.id === "add-btn") {
      const label = prompt("New item label:");
      if (!label) return;
      items.items.push({
        id: uniqueId(items, slugify(label)),
        label,
        order: nextOrder(items),
      });
      save();
      return;
    }
    const itemRow = ev.target.closest(".item");
    if (!itemRow) return;
    const id = itemRow.dataset.id;
    const idx = items.items.findIndex(i => i.id === id);
    const act = ev.target.dataset.act;
    if (act === "del") {
      if (!confirm("Delete this item? History keeps the old record.")) return;
      items.items.splice(idx, 1);
      save();
    } else if (act === "macros") {
      items.items[idx].macros = !items.items[idx].macros;
      save();
    } else if (act === "up" && idx > 0) {
      const a = items.items[idx], b = items.items[idx - 1];
      const t = a.order; a.order = b.order; b.order = t;
      save();
    } else if (act === "down" && idx < items.items.length - 1) {
      const a = items.items[idx], b = items.items[idx + 1];
      const t = a.order; a.order = b.order; b.order = t;
      save();
    }
  }, { signal });

  root.addEventListener("change", (ev) => {
    if (ev.target.matches('.flat-list input[type="text"]')) {
      const id = ev.target.closest(".item").dataset.id;
      const it = items.items.find(i => i.id === id);
      it.label = ev.target.value;
      save();
    }
  }, { signal });

  paint();
}
```

- [ ] **Step 3: Verify**

```bash
cd /Users/akomarraju/workspace/wellness
node --check settings.js
grep -c "AbortController" settings.js   # 1
grep -c "macros-chip" settings.js       # 1+
grep -c "items.items" settings.js       # several (>= 6)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add settings.js index.html
git commit -m "feat(settings): flat list with macros toggle and global reorder"
```

---

## Task 4: Timeline — flat list

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/timeline.js`

- [ ] **Step 1: Replace `/Users/akomarraju/workspace/wellness/timeline.js` with:**

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

  const block = document.createElement("div");
  block.className = "sec-block";
  const sorted = [...items.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const it of sorted) {
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
  root.appendChild(wrap);
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/akomarraju/workspace/wellness
node --check timeline.js
node --input-type=module -e "
  const { computeDateWindow, classifyCell } = await import('./timeline.js');
  if (computeDateWindow(new Date(2026,4,17), 5).length !== 5) throw new Error('window');
  if (classifyCell(null, 'x') !== 'red') throw new Error('null');
  if (classifyCell({items:{a:{checked:true}}}, 'a') !== 'green') throw new Error('green');
  console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add timeline.js
git commit -m "feat(timeline): flat list - drop section grouping (no sections in v3)"
```

---

## Task 4b: Entry — accept flat items shape

`entry.js` currently iterates `items.sections`, which breaks under the v3 flat shape. Update `blankEntry` and `snapshotItems` to handle both shapes via a small helper.

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/entry.js`

- [ ] **Step 1: Replace `/Users/akomarraju/workspace/wellness/entry.js` with:**

```js
function pad(n) { return String(n).padStart(2, "0"); }

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function iterItems(items) {
  if (Array.isArray(items?.items)) return items.items;
  if (Array.isArray(items?.sections)) return items.sections.flatMap(s => s.items);
  return [];
}

export function snapshotItems(items) {
  const out = {};
  for (const it of iterItems(items)) out[it.id] = it.label;
  return out;
}

export function blankEntry(dateKey, items) {
  const out = { date: dateKey, items: {} };
  for (const it of iterItems(items)) {
    out.items[it.id] = { label: it.label, checked: false, comment: "" };
  }
  return out;
}

export function mergeIntoEntry(existing, items) {
  const blank = blankEntry(existing.date, items);
  const merged = { ...existing, items: { ...blank.items } };
  for (const id of Object.keys(existing.items)) {
    if (id in merged.items) {
      merged.items[id] = existing.items[id];
    } else {
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

- [ ] **Step 2: Verify with Node**

```bash
cd /Users/akomarraju/workspace/wellness
node --check entry.js
node --input-type=module -e "
  const { snapshotItems, blankEntry, countDone } = await import('./entry.js');
  // flat shape
  const flat = { items: [{id:'a',label:'A'}, {id:'b',label:'B'}] };
  if (Object.keys(snapshotItems(flat)).length !== 2) throw new Error('snapshot flat');
  if (Object.keys(blankEntry('2026-05-17', flat).items).length !== 2) throw new Error('blank flat');
  // sectioned (legacy) — for read-back of old data
  const sec = { sections: [{ key:'n', title:'N', items:[{id:'x',label:'X'}] }] };
  if (Object.keys(snapshotItems(sec)).length !== 1) throw new Error('snapshot sec');
  if (Object.keys(blankEntry('2026-05-17', sec).items).length !== 1) throw new Error('blank sec');
  // empty
  if (Object.keys(snapshotItems({}).length === undefined ? snapshotItems({}) : {}).length !== 0) {} // no-op safety
  // countDone
  const cd = countDone({items:{a:{checked:true}, b:{checked:false}}});
  if (cd.done !== 1 || cd.total !== 2) throw new Error('countDone');
  console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add entry.js
git commit -m "feat(entry): accept flat items shape (v3) and legacy sectioned shape"
```

---

## Task 5: App.js — top-of-page widgets + ordered render + fasting ticker

This is the big task. We REPLACE the entire `app.js` with the v3 version because the changes are pervasive (drop renderCategory, drop layout toggle, drop renderToggle, drop renderMain dispatch; add fasting widget, water widget, log tally widget, macros inputs, fasting ticker; rename `renderOrdered` → `renderToday`).

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/app.js`
- Modify: `/Users/akomarraju/workspace/wellness/index.html` (CSS for new widgets; remove obsolete CSS)

- [ ] **Step 1: Append new CSS, remove old** in `/Users/akomarraju/workspace/wellness/index.html`

Inside the `<style>` block:

(a) **Append** these new rules BEFORE `</style>`:

```css
.top-tools { display: flex; flex-direction: column; gap: 6px; margin: 8px 0 14px; }
.tool-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: white; border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; }
.tool-row .left { flex: 1; font-size: 14px; }
.tool-row button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line);
  background: white; cursor: pointer; font: inherit; }
.tool-row button.primary { background: var(--fg); color: white; border-color: var(--fg); }
.tool-row a.undo { font-size: 12px; color: var(--muted); text-decoration: underline; cursor: pointer; }
.log-tally { font-size: 13px; color: var(--muted); padding: 4px 12px;
  font-variant-numeric: tabular-nums; }

.row .macros { display: flex; gap: 6px; margin-top: 6px; }
.row .macros label { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--muted); }
.row .macros input { width: 56px; padding: 4px 6px; border: 1px solid var(--line);
  border-radius: 6px; font: inherit; font-variant-numeric: tabular-nums; }
```

(b) **Remove** these rules (they were used only by the deleted toggle / category sections):

Find and delete:

```css
.layout-toggle { display: inline-flex; border: 1px solid var(--line);
  border-radius: 10px; overflow: hidden; margin: 6px 0 12px; background: white; }
.layout-toggle button { padding: 8px 14px; border: 0; background: white;
  color: var(--muted); font: inherit; cursor: pointer; }
.layout-toggle button.active { background: var(--fg); color: white; }
```

(`section.section[data-key=...]` accent rules and `section.section h2` were removed when sections went away — leave the bare `section.section` rule in place since `.row` styles on the ordered view inherit cleanly. If the existing CSS still references `section.section[data-key=...]` blocks, leave them — they'll just never match in v3 and harm nothing.)

- [ ] **Step 2: Replace `/Users/akomarraju/workspace/wellness/app.js` with:**

```js
import { Storage } from "./storage.js";
import { ensureItems } from "./items.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";
import { renderSettings } from "./settings.js";
import { renderHistory } from "./history.js";
import { downloadExport } from "./export.js";
import { renderTimeline } from "./timeline.js";

const storage = Storage(localStorage);
const items = ensureItems(storage);

const date = todayKey();
const existing = storage.getEntry(date);
const entry = existing
  ? { waterOz: 0, fastStartedAt: null, fastEndedAt: null, ...mergeIntoEntry(existing, items) }
  : { ...blankEntry(date, items), waterOz: 0, fastStartedAt: null, fastEndedAt: null };

let lastWaterDelta = 0;     // for undo
let view = "main";
let tickerHandle = null;

function fmtTitle(d) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function persist() { storage.saveEntry(date, { ...entry, savedAt: new Date().toISOString() }); }

// ---------- fasting ----------
function fastDurationMs(startIso, endIso) {
  if (!startIso) return 0;
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, end - start);
}
function fmtDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2,"0")}m`;
}
function startFast() {
  entry.fastStartedAt = new Date().toISOString();
  entry.fastEndedAt = null;
  persist();
  renderToday();
}
function endFast() {
  if (entry.fastStartedAt && !entry.fastEndedAt) {
    entry.fastEndedAt = new Date().toISOString();
    persist();
    renderToday();
  }
}

// ---------- water ----------
function addWater(oz) {
  entry.waterOz = (entry.waterOz ?? 0) + oz;
  lastWaterDelta = oz;
  persist();
  renderToday();
}
function undoWater() {
  if (lastWaterDelta <= 0) return;
  entry.waterOz = Math.max(0, (entry.waterOz ?? 0) - lastWaterDelta);
  lastWaterDelta = 0;
  persist();
  renderToday();
}

// ---------- macros tally ----------
function macroTotals() {
  let p = 0, fi = 0, fa = 0, c = 0;
  for (const it of items.items) {
    if (!it.macros) continue;
    const m = entry.items[it.id]?.macros;
    if (!m) continue;
    p  += Number(m.p)  || 0;
    fi += Number(m.fi) || 0;
    fa += Number(m.fa) || 0;
    c  += Number(m.c)  || 0;
  }
  return { p, fi, fa, c };
}

// ---------- ticker ----------
function startTicker() {
  if (tickerHandle) return;
  tickerHandle = setInterval(() => {
    if (view === "main" && entry.fastStartedAt && !entry.fastEndedAt) {
      const pill = document.querySelector("#fasting-pill .left");
      if (pill) pill.textContent = `⏱ Fasting: ${fmtDuration(fastDurationMs(entry.fastStartedAt, null))}`;
    }
  }, 60_000);
}

// ---------- top widgets ----------
function paintTopTools(root) {
  const tools = document.createElement("div");
  tools.className = "top-tools";

  // Fasting pill
  const fast = document.createElement("div");
  fast.className = "tool-row";
  fast.id = "fasting-pill";
  if (entry.fastStartedAt && !entry.fastEndedAt) {
    fast.innerHTML = `
      <span class="left">⏱ Fasting: ${fmtDuration(fastDurationMs(entry.fastStartedAt, null))}</span>
      <button id="end-fast">End fast</button>
    `;
  } else if (entry.fastStartedAt && entry.fastEndedAt) {
    fast.innerHTML = `
      <span class="left">⏱ Fasted: ${fmtDuration(fastDurationMs(entry.fastStartedAt, entry.fastEndedAt))} ✓</span>
    `;
  } else {
    fast.innerHTML = `
      <span class="left">⏱ Not fasting</span>
      <button id="start-fast" class="primary">Start fast</button>
    `;
  }
  tools.appendChild(fast);

  // Water counter
  const water = document.createElement("div");
  water.className = "tool-row";
  water.id = "water-row";
  const w = entry.waterOz ?? 0;
  water.innerHTML = `
    <span class="left">💧 Water: ${w} / 140 oz${w >= 140 ? " ✓" : ""}</span>
    <button data-water="8">+8 oz</button>
    <button data-water="16">+16 oz</button>
    ${lastWaterDelta > 0 ? `<a class="undo" id="water-undo">undo</a>` : ""}
  `;
  tools.appendChild(water);

  // Log tally
  const tally = document.createElement("div");
  tally.className = "log-tally";
  const t = macroTotals();
  tally.textContent = `Today's log: P ${t.p}/125g · Fi ${t.fi}/35g · Fa ${t.fa}g · C ${t.c}/130g`;
  tools.appendChild(tally);

  root.appendChild(tools);
}

// ---------- ordered routine ----------
function renderToday() {
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  paintTopTools(root);

  const sec = document.createElement("section");
  sec.className = "ordered";
  const flat = [...items.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  flat.forEach((it, idx) => {
    const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = it.id;
    row.dataset.checked = String(cell.checked);
    const m = cell.macros ?? { p: "", fi: "", fa: "", c: "" };
    row.innerHTML = `
      <input type="checkbox" ${cell.checked ? "checked" : ""} />
      <div class="num">${idx + 1}.</div>
      <div class="label">
        ${it.label}
        ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
        ${(!cell.checked && cell.comment) ? `<textarea>${escapeAttr(cell.comment)}</textarea>` : ""}
        ${it.macros ? `
          <div class="macros">
            <label>P <input type="number" min="0" inputmode="numeric" data-mac="p"  value="${m.p ?? ""}"></label>
            <label>Fi <input type="number" min="0" inputmode="numeric" data-mac="fi" value="${m.fi ?? ""}"></label>
            <label>Fa <input type="number" min="0" inputmode="numeric" data-mac="fa" value="${m.fa ?? ""}"></label>
            <label>C <input type="number" min="0" inputmode="numeric" data-mac="c"  value="${m.c ?? ""}"></label>
          </div>
        ` : ""}
      </div>
    `;
    sec.appendChild(row);
  });
  root.appendChild(sec);
  startTicker();
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- delegated events ----------
document.addEventListener("change", (ev) => {
  if (ev.target.matches('.row input[type="checkbox"]')) {
    const id = ev.target.closest(".row").dataset.id;
    if (!entry.items[id]) {
      const it = items.items.find(x => x.id === id);
      entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
    }
    entry.items[id].checked = ev.target.checked;
    // Auto-end fast on Breakfast tick (whichever first)
    if (id === "breakfast" && ev.target.checked && entry.fastStartedAt && !entry.fastEndedAt) {
      entry.fastEndedAt = new Date().toISOString();
    }
    persist();
    renderToday();
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
    return;
  }
  if (ev.target.id === "start-fast") { startFast(); return; }
  if (ev.target.id === "end-fast")   { endFast(); return; }
  if (ev.target.matches('[data-water]')) {
    const oz = Number(ev.target.dataset.water);
    if (oz > 0) addWater(oz);
    return;
  }
  if (ev.target.id === "water-undo") { undoWater(); return; }
});

const typingTimers = {};
document.addEventListener("input", (ev) => {
  if (ev.target.matches(".row textarea")) {
    const id = ev.target.closest(".row").dataset.id;
    const value = ev.target.value;
    clearTimeout(typingTimers[id]);
    typingTimers[id] = setTimeout(() => {
      if (!entry.items[id]) {
        const it = items.items.find(x => x.id === id);
        entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
      }
      entry.items[id].comment = value;
      persist();
    }, 250);
  } else if (ev.target.matches('.row .macros input')) {
    const row = ev.target.closest(".row");
    const id = row.dataset.id;
    const key = ev.target.dataset.mac;
    const val = Number(ev.target.value) || 0;
    const tkey = `${id}:${key}`;
    clearTimeout(typingTimers[tkey]);
    typingTimers[tkey] = setTimeout(() => {
      if (!entry.items[id]) {
        const it = items.items.find(x => x.id === id);
        entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
      }
      entry.items[id].macros = { ...(entry.items[id].macros ?? { p: 0, fi: 0, fa: 0, c: 0 }), [key]: val };
      persist();
      // Live tally update without full re-render
      const tally = document.querySelector(".log-tally");
      if (tally) {
        const t = macroTotals();
        tally.textContent = `Today's log: P ${t.p}/125g · Fi ${t.fi}/35g · Fa ${t.fa}g · C ${t.c}/130g`;
      }
    }, 250);
  }
});

document.getElementById("save-btn").addEventListener("click", () => {
  persist();
  document.getElementById("save-btn").textContent = "Saved ✓";
  setTimeout(() => { document.getElementById("save-btn").textContent = "Save today"; }, 1200);
});

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
  } else if (view === "timeline") {
    document.getElementById("title").textContent = "Timeline";
    document.getElementById("stat").textContent = "";
    renderTimeline(root, storage, items);
  } else {
    renderToday();
  }
}

document.getElementById("link-settings").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "settings" ? "main" : "settings";
  show();
});
document.getElementById("link-history").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "history" ? "main" : "history";
  show();
});
document.getElementById("link-timeline").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "timeline" ? "main" : "timeline";
  show();
});
document.getElementById("link-export").addEventListener("click", (ev) => {
  ev.preventDefault();
  downloadExport(storage);
});

show();
```

- [ ] **Step 3: Verify**

```bash
cd /Users/akomarraju/workspace/wellness
node --check app.js
grep -c "renderCategory" app.js     # 0
grep -c "layout-toggle" app.js      # 0
grep -c "renderToggle" app.js       # 0
grep -c "renderToday" app.js        # several
grep -c "fastStartedAt" app.js      # several
grep -c "macroTotals" app.js        # >= 2
```

- [ ] **Step 4: Boot static server and check 200s**

```bash
cd /Users/akomarraju/workspace/wellness
python3 -m http.server 8765 > /tmp/wellness-server.log 2>&1 &
PID=$!
sleep 1
python3 - <<'PY'
import urllib.request
for p in ["index.html","app.js","items.js","storage.js","entry.js","settings.js","history.js","export.js","timeline.js","manifest.webmanifest","service-worker.js"]:
    try:
        r = urllib.request.urlopen(f"http://localhost:8765/{p}", timeout=2)
        print(f"{p}: HTTP {r.status}")
    except Exception as e:
        print(f"{p}: ERR {e}")
PY
kill $PID 2>/dev/null
wait 2>/dev/null
```

Expected: every line `HTTP 200`.

- [ ] **Step 5: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add app.js index.html
git commit -m "feat(view): v3 - flat routine, fasting, water, macros log"
```

---

## Task 6: Service worker — bump cache to v4

**Files:**
- Modify: `/Users/akomarraju/workspace/wellness/service-worker.js`

- [ ] **Step 1: Update `service-worker.js`**

Open the file. Change ONLY the first line:

```js
const CACHE = "wellness-v3";
```

to:

```js
const CACHE = "wellness-v4";
```

The ASSETS list stays as-is (no new files added; everything else unchanged).

- [ ] **Step 2: Verify**

```bash
cd /Users/akomarraju/workspace/wellness
node --check service-worker.js
grep -c "wellness-v4" service-worker.js   # 1
```

- [ ] **Step 3: Commit**

```bash
cd /Users/akomarraju/workspace/wellness
git add service-worker.js
git commit -m "chore(pwa): bump cache to v4 for v3 restructure"
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
  const { todayKey, blankEntry, countDone, mergeIntoEntry } = await import('./entry.js');
  const { computeDateWindow, classifyCell } = await import('./timeline.js');

  let pass=0, fail=0;
  function it(n,f){ try{ f(); pass++; console.log('PASS',n);} catch(e){ fail++; console.log('FAIL',n,'-',e.message);} }
  function eq(a,b){ if (JSON.stringify(a)!==JSON.stringify(b)) throw new Error(JSON.stringify(a)+' !== '+JSON.stringify(b)); }
  function fresh(){ store.clear(); return Storage(localStorage); }

  it('storage no longer has getLayout', () => { const s=fresh(); if (typeof s.getLayout!=='undefined') throw new Error('getLayout still exists'); });
  it('storage round-trip on items', () => { const s=fresh(); s.saveItems({items:[]}); eq(s.getItems(), {items:[]}); });

  it('v3 defaultItems is flat with 14', () => { const di=defaultItems(); if (!Array.isArray(di.items)) throw new Error('not flat'); if (di.items.length!==14) throw new Error('count='+di.items.length); });
  it('v3 default macros set on 4 items', () => { const ms=defaultItems().items.filter(i=>i.macros).map(i=>i.id).sort(); eq(ms, ['breakfast','dinner','lunch','nuts']); });
  it('v3 ensureItems migrates v2 sectioned legacy', () => {
    const s=fresh();
    s.saveItems({sections:[{key:'s',title:'S',items:[{id:'b12_morning',label:'My B12',order:20}]}]});
    const r=ensureItems(s);
    if (!Array.isArray(r.items)) throw new Error('shape');
    const b12 = r.items.find(i=>i.id==='b12_morning');
    if (!b12 || b12.label !== 'My B12') throw new Error('label not preserved');
  });
  it('v3 ensureItems renames d_k2_fishoil_pm to d_k2_fishoil', () => {
    const s=fresh();
    s.saveItems({sections:[{key:'s',title:'S',items:[{id:'d_k2_fishoil_pm',label:'Custom D',order:80}]}]});
    const r=ensureItems(s);
    const x=r.items.find(i=>i.id==='d_k2_fishoil');
    if (!x || x.label!=='Custom D') throw new Error('rename mapping failed');
  });
  it('v3 ensureItems idempotent', () => {
    const s=fresh();
    s.saveItems({items:[{id:'a',label:'A',order:10}]});
    ensureItems(s);
    if (s.getItems().items.length!==1) throw new Error('idempotency broken');
  });
  it('v3 nextOrder', () => { eq(nextOrder({items:[{id:'a',label:'A',order:30}]}), 40); });

  it('todayKey', () => { eq(todayKey(new Date(2026,4,17)), '2026-05-17'); });
  it('blankEntry on flat items', () => {
    const items={items:[{id:'a',label:'A',order:10}]};
    const e=blankEntry('2026-05-17', items);
    if (!e.items.a) throw new Error('blank entry missing key');
  });

  it('computeDateWindow length 5', () => { eq(computeDateWindow(new Date(2026,4,17), 5), ['2026-05-13','2026-05-14','2026-05-15','2026-05-16','2026-05-17']); });
  it('computeDateWindow caps at 30', () => { eq(computeDateWindow(new Date(2026,4,17), 100).length, 30); });
  it('classifyCell red null', () => { eq(classifyCell(null,'a'),'red'); });
  it('classifyCell green', () => { eq(classifyCell({items:{a:{checked:true}}},'a'),'green'); });
  it('classifyCell grey', () => { eq(classifyCell({items:{a:{checked:false}}},'a'),'grey'); });

  console.log('---','PASS:',pass,'FAIL:',fail);
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
python3 - <<'PY'
import urllib.request
for p in ["index.html","app.js","storage.js","items.js","entry.js","settings.js","history.js","export.js","timeline.js","manifest.webmanifest","service-worker.js","icons/icon-192.png","icons/icon-512.png"]:
    try:
        r=urllib.request.urlopen(f"http://localhost:8765/{p}", timeout=2)
        print(f"{p}: HTTP {r.status}")
    except Exception as e:
        print(f"{p}: ERR {e}")
PY
kill $PID 2>/dev/null
wait 2>/dev/null
```

Expected: every line `HTTP 200`.

- [ ] **Step 3: Verify clean working tree**

```bash
cd /Users/akomarraju/workspace/wellness
git status
```

Expected: working tree clean (or only the one entry.js patch from the implementer note above, committed).

---

## Out of scope for this plan
- Live midnight rollover.
- Macros aggregation in Timeline / History.
- Water target customization.
- Drag-and-drop reorder on touch.
- Times-of-day on items.
- Macros breakdown of structural recovery (the recovery item is just a checkbox).
