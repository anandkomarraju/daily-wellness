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
