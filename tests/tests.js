import { Storage } from "../storage.js";
import { defaultItems, ensureItems, nextOrder } from "../items.js";
import { todayKey, blankEntry, countDone, mergeIntoEntry, snapshotItems } from "../entry.js";
import { computeDateWindow, classifyCell } from "../timeline.js";

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

it("defaultItems assigns order to every item, multiples of 10, ascending", () => {
  const all = defaultItems().sections.flatMap(s => s.items);
  for (const it of all) {
    if (typeof it.order !== "number") throw new Error("missing order: " + it.id);
    if (it.order % 10 !== 0) throw new Error("order not multiple of 10: " + it.id + "=" + it.order);
  }
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
        { id: "water_140oz", label: "Water" },
        { id: "my_custom_item", label: "Custom" },
      ]},
    ],
  };
  s.saveItems(legacy);
  const result = ensureItems(s);
  const byId = Object.fromEntries(result.sections.flatMap(sec => sec.items).map(i => [i.id, i.order]));
  if (typeof byId.water_140oz !== "number") throw new Error("known not assigned");
  if (typeof byId.my_custom_item !== "number") throw new Error("unknown not assigned");
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

it("computeDateWindow returns up to 30 dates ending in today, ascending", () => {
  const today = new Date(2026, 4, 17);
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

// Render
const root = document.getElementById("results");
for (const r of results) {
  const li = document.createElement("li");
  li.textContent = (r.pass ? "PASS  " : "FAIL  ") + r.name + (r.err ? " — " + r.err : "");
  li.style.color = r.pass ? "green" : "red";
  root.appendChild(li);
}
