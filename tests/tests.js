import { Storage } from "../storage.js";
import { defaultItems, ensureItems, nextOrder } from "../items.js";
import { todayKey, blankEntry, countDone, mergeIntoEntry, snapshotItems } from "../entry.js";
import { computeDateWindow, classifyCell } from "../timeline.js";
import { mergeKeepingToday } from "../backup.js";

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

it("v3 defaultItems is flat with 14 items", () => {
  const di = defaultItems();
  if (!Array.isArray(di.items)) throw new Error("not flat");
  if (di.items.length !== 14) throw new Error("count: " + di.items.length);
});

it("v3 defaultItems orders are multiples of 10 ascending", () => {
  const di = defaultItems();
  const orders = di.items.map(i => i.order);
  for (let i=1; i<orders.length; i++) if (orders[i] <= orders[i-1]) throw new Error("not ascending");
  for (const o of orders) if (o % 10 !== 0) throw new Error("not multiple of 10: "+o);
});

it("v3 defaultItems first three are b12, morning walk, breakfast", () => {
  const ids = defaultItems().items.slice(0,3).map(i => i.id);
  eq(ids, ["b12_morning","morning_walk_30","breakfast"]);
});

it("v3 defaultItems marks 4 logged items with macros:true", () => {
  const macroIds = defaultItems().items.filter(i => i.macros === true).map(i => i.id).sort();
  eq(macroIds, ["breakfast","dinner","lunch","nuts"]);
});

it("v3 ensureItems migrates v2 sectioned shape to flat v3", () => {
  const s = fresh();
  s.saveItems({ sections: [
    { key: "supplements", title: "S", items: [
      { id: "b12_morning", label: "My custom B12", order: 20 },
      { id: "d_k2_fishoil_pm", label: "My custom D", order: 80 },
      { id: "collagen_7pm", label: "My custom collagen", order: 140 },
    ]},
  ]});
  const r = ensureItems(s);
  if (!Array.isArray(r.items)) throw new Error("not flat");
  if (r.items.length !== 14) throw new Error("expected 14 after migration, got " + r.items.length);
  const byId = Object.fromEntries(r.items.map(i => [i.id, i.label]));
  if (byId.b12_morning !== "My custom B12") throw new Error("b12 label not preserved");
  if (byId.d_k2_fishoil !== "My custom D") throw new Error("d_k2 rename mapping");
  if (byId.collagen_coffee !== "My custom collagen") throw new Error("collagen rename mapping");
});

it("v3 ensureItems idempotent on flat shape", () => {
  const s = fresh();
  s.saveItems({items:[{id:"a",label:"A",order:10}]});
  ensureItems(s);
  if (s.getItems().items.length !== 1) throw new Error("idempotency broken");
});

it("v3 nextOrder works on flat shape", () => {
  const r = nextOrder({items:[{id:"a",label:"A",order:30}]});
  if (r !== 40) throw new Error("nextOrder: " + r);
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

it("replaceEntries overwrites the entire entries map", () => {
  const s = fresh();
  s.saveEntry("2026-05-09", { date: "2026-05-09", items: {}, savedAt: "x" });
  s.saveEntry("2026-05-10", { date: "2026-05-10", items: {}, savedAt: "y" });
  s.replaceEntries({ "2026-05-11": { date: "2026-05-11", items: {}, savedAt: "z" } });
  eq(s.getEntry("2026-05-09"), null, "old date should be gone");
  eq(s.getEntry("2026-05-10"), null, "old date should be gone");
  eq(s.getEntry("2026-05-11").savedAt, "z", "new date should be present");
});

it("mergeKeepingToday with empty current returns incoming entries verbatim, activeFast null", () => {
  const incoming = {
    items: { items: [{ id: "a" }] },
    entries: { "2026-05-10": { date: "2026-05-10", items: {} } },
    activeFast: { startMs: 1 },
  };
  const current = { items: null, entries: {}, activeFast: null };
  const out = mergeKeepingToday(incoming, current, "2026-05-18");
  eq(out.items, incoming.items);
  eq(out.entries, incoming.entries);
  eq(out.activeFast, null);
});

it("mergeKeepingToday preserves today's entry from current", () => {
  const incoming = {
    items: null,
    entries: {
      "2026-05-10": { date: "2026-05-10", items: { a: { checked: false } } },
      "2026-05-18": { date: "2026-05-18", items: { a: { checked: false } } },
    },
    activeFast: null,
  };
  const todays = { date: "2026-05-18", items: { a: { checked: true } } };
  const current = { items: null, entries: { "2026-05-18": todays }, activeFast: null };
  const out = mergeKeepingToday(incoming, current, "2026-05-18");
  eq(out.entries["2026-05-18"], todays, "today preserved");
  eq(out.entries["2026-05-10"], incoming.entries["2026-05-10"], "other date from incoming");
});

it("mergeKeepingToday preserves current activeFast", () => {
  const incoming = { items: null, entries: {}, activeFast: { startMs: 1 } };
  const current = { items: null, entries: {}, activeFast: { startMs: 999 } };
  const out = mergeKeepingToday(incoming, current, "2026-05-18");
  eq(out.activeFast, current.activeFast);
});

// Render
const root = document.getElementById("results");
for (const r of results) {
  const li = document.createElement("li");
  li.textContent = (r.pass ? "PASS  " : "FAIL  ") + r.name + (r.err ? " — " + r.err : "");
  li.style.color = r.pass ? "green" : "red";
  root.appendChild(li);
}
