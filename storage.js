const ITEMS_KEY = "wellness:items";
const ENTRIES_KEY = "wellness:entries";
const ACTIVE_FAST_KEY = "wellness:activeFast";

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
    getActiveFast() { return readJSON(ACTIVE_FAST_KEY, null); },
    saveActiveFast(f) {
      if (f == null) backend.removeItem(ACTIVE_FAST_KEY);
      else writeJSON(ACTIVE_FAST_KEY, f);
    },
    getAllEntries() { return readJSON(ENTRIES_KEY, {}); },
    replaceEntries(entries) { writeJSON(ENTRIES_KEY, entries || {}); },
    exportAll() {
      return { items: readJSON(ITEMS_KEY, null), entries: readJSON(ENTRIES_KEY, {}), activeFast: readJSON(ACTIVE_FAST_KEY, null) };
    },
  };
}
