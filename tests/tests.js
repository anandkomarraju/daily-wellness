import { Storage } from "../storage.js";
import { defaultItems, ensureItems, nextOrder } from "../items.js";
import { todayKey, blankEntry, countDone, mergeIntoEntry, snapshotItems } from "../entry.js";
import { Backup, mergeKeepingToday } from "../backup.js";

const results = [];
const pending = [];
function it(name, fn) {
  pending.push((async () => {
    try { await fn(); results.push({ name, pass: true }); }
    catch (e) { results.push({ name, pass: false, err: e.message }); }
  })());
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

// Reset storage between tests
function fresh() { localStorage.clear(); return Storage(localStorage); }

// --- Fake IndexedDB for backup tests ---
function makeFakeIdb() {
  let stored = new Map(); // id -> record
  let openShouldFail = false;
  const db = {
    transaction(_name, _mode) {
      return {
        objectStore() {
          return {
            put(record) {
              stored.set(record.id, record);
              return { onsuccess: null, onerror: null };
            },
            get(id) {
              const r = stored.get(id);
              const req = { result: r, onsuccess: null, onerror: null };
              queueMicrotask(() => req.onsuccess && req.onsuccess({ target: req }));
              return req;
            },
          };
        },
        oncomplete: null,
        onerror: null,
      };
    },
    close() {},
  };
  return {
    open() {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: db };
      queueMicrotask(() => {
        if (openShouldFail) { req.onerror && req.onerror({ target: { error: new Error("open failed") } }); return; }
        req.onupgradeneeded && req.onupgradeneeded({ target: req });
        req.onsuccess && req.onsuccess({ target: req });
      });
      return req;
    },
    _stored: stored,
    _failOpen() { openShouldFail = true; },
  };
}

// --- Fake clock for debounce tests ---
function makeFakeClock() {
  let now = 0;
  const timers = []; // {id, dueAt, fn}
  let nextId = 1;
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = nextId++; timers.push({ id, dueAt: now + ms, fn }); return id; },
    clearTimeout(id) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    advance(ms) {
      now += ms;
      const due = timers.filter(t => t.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
      due.forEach(t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); t.fn(); });
    },
    pending: () => timers.length,
  };
}

async function flushMicrotasks() { await Promise.resolve(); await Promise.resolve(); }

it("getItems returns null when nothing saved", () => {
  const s = fresh();
  eq(s.getItems(), null);
});

it("saveItems then getItems round-trips", () => {
  const s = fresh();
  const items = { items: [{ id: "a", label: "A", order: 10 }] };
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
  s.saveItems({ items: [] });
  s.saveEntry("2026-05-13", { date: "2026-05-13", items: {}, savedAt: "x" });
  s.saveEntry("2026-05-12", { date: "2026-05-12", items: {}, savedAt: "y" });
  const dump = s.exportAll();
  eq(dump.items, { items: [] });
  eq(Object.keys(dump.entries).sort(), ["2026-05-12", "2026-05-13"]);
});

it("defaultItems returns a flat list with stable order values", () => {
  const d = defaultItems();
  if (!Array.isArray(d.items) || d.items.length === 0) throw new Error("items array missing or empty");
  const orders = d.items.map(i => i.order);
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] <= orders[i - 1]) throw new Error("orders not ascending");
  }
});

it("defaultItems item ids are unique slugs", () => {
  const d = defaultItems();
  const ids = d.items.map(i => i.id);
  eq(ids.length, new Set(ids).size);
  for (const id of ids) {
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error("bad id: " + id);
  }
});

it("ensureItems returns saved items when present", () => {
  const s = fresh();
  const fake = { items: [{ id: "x", label: "X", order: 10 }] };
  s.saveItems(fake);
  eq(ensureItems(s), fake);
});

it("ensureItems seeds defaults when nothing saved", () => {
  const s = fresh();
  const result = ensureItems(s);
  if (!Array.isArray(result.items) || result.items.length === 0) throw new Error("defaults missing");
  if (!Array.isArray(s.getItems().items) || s.getItems().items.length === 0) throw new Error("defaults not persisted");
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

it("Backup.queue writes once after 2s of quiet", async () => {
  const idb = makeFakeIdb();
  const clock = makeFakeClock();
  const b = Backup({ idb, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  await flushMicrotasks(); // let openDB settle
  b.queue({ items: null, entries: {}, activeFast: null });
  eq(idb._stored.size, 0, "no write before debounce elapses");
  clock.advance(1999);
  eq(idb._stored.size, 0, "still no write at 1999ms");
  clock.advance(1);
  eq(idb._stored.size, 1, "write at 2000ms");
  eq(idb._stored.get("latest").data.entries, {});
});

it("Backup.queue coalesces rapid calls into one write with the last snapshot", async () => {
  const idb = makeFakeIdb();
  const clock = makeFakeClock();
  const b = Backup({ idb, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  await flushMicrotasks();
  b.queue({ items: null, entries: { a: 1 }, activeFast: null });
  clock.advance(500);
  b.queue({ items: null, entries: { a: 2 }, activeFast: null });
  clock.advance(500);
  b.queue({ items: null, entries: { a: 3 }, activeFast: null });
  clock.advance(2000);
  eq(idb._stored.size, 1, "single coalesced write");
  eq(idb._stored.get("latest").data.entries.a, 3, "kept the last snapshot");
});

it("Backup.flush writes immediately and cancels timer", async () => {
  const idb = makeFakeIdb();
  const clock = makeFakeClock();
  const b = Backup({ idb, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  await flushMicrotasks();
  b.queue({ items: null, entries: { a: 1 }, activeFast: null });
  b.flush();
  eq(idb._stored.size, 1, "wrote immediately");
  eq(clock.pending(), 0, "timer cleared");
});

it("Backup.queue is a no-op when openDB fails", async () => {
  const idb = makeFakeIdb();
  idb._failOpen();
  const clock = makeFakeClock();
  const b = Backup({ idb, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  await flushMicrotasks();
  b.queue({ items: null, entries: {}, activeFast: null });
  clock.advance(5000);
  eq(idb._stored.size, 0);
});

// Render
await Promise.all(pending);
const root = document.getElementById("results");
for (const r of results) {
  const li = document.createElement("li");
  li.textContent = (r.pass ? "PASS  " : "FAIL  ") + r.name + (r.err ? " — " + r.err : "");
  li.style.color = r.pass ? "green" : "red";
  root.appendChild(li);
}
