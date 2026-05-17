const ITEMS_KEY = "wellness:items";
const ENTRIES_KEY = "wellness:entries";
const LAYOUT_KEY = "wellness:layout";

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
    getLayout() {
      const v = readJSON(LAYOUT_KEY, "category");
      return v === "category" || v === "order" ? v : "category";
    },
    saveLayout(value) {
      const safe = value === "order" ? "order" : "category";
      writeJSON(LAYOUT_KEY, safe);
    },
    exportAll() {
      return { items: readJSON(ITEMS_KEY, null), entries: readJSON(ENTRIES_KEY, {}) };
    },
  };
}
