import { Storage } from "../storage.js";
import { defaultItems, ensureItems } from "../items.js";
import { todayKey, blankEntry, countDone, mergeIntoEntry, snapshotItems } from "../entry.js";

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

// Render
const root = document.getElementById("results");
for (const r of results) {
  const li = document.createElement("li");
  li.textContent = (r.pass ? "PASS  " : "FAIL  ") + r.name + (r.err ? " — " + r.err : "");
  li.style.color = r.pass ? "green" : "red";
  root.appendChild(li);
}
