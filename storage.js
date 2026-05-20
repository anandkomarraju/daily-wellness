const ITEMS_KEY = "wellness:items";
const ENTRIES_KEY = "wellness:entries";
const ACTIVE_FAST_KEY = "wellness:activeFast";
const GOALS_KEY = "wellness:goals";
const MEAL_DEFAULTS_KEY = "wellness:mealDefaults";

export function Storage(backend = localStorage, backup = null) {
  function readJSON(key, fallback) {
    const raw = backend.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  function writeJSON(key, value) {
    backend.setItem(key, JSON.stringify(value));
  }
  function notifyBackup() {
    if (!backup) return;
    try { backup.queue(api.exportAll()); } catch (e) { console.warn("[storage] backup.queue failed", e); }
  }

  const api = {
    getItems()        { return readJSON(ITEMS_KEY, null); },
    saveItems(items)  { writeJSON(ITEMS_KEY, items); notifyBackup(); },
    getEntry(date)    { return readJSON(ENTRIES_KEY, {})[date] ?? null; },
    saveEntry(date, e) {
      const all = readJSON(ENTRIES_KEY, {});
      all[date] = e;
      writeJSON(ENTRIES_KEY, all);
      notifyBackup();
    },
    getActiveFast() { return readJSON(ACTIVE_FAST_KEY, null); },
    saveActiveFast(f) {
      if (f == null) backend.removeItem(ACTIVE_FAST_KEY);
      else writeJSON(ACTIVE_FAST_KEY, f);
      notifyBackup();
    },
    getAllEntries() { return readJSON(ENTRIES_KEY, {}); },
    replaceEntries(entries) { writeJSON(ENTRIES_KEY, entries || {}); notifyBackup(); },
    getGoals() { return readJSON(GOALS_KEY, null); },
    saveGoals(g) { writeJSON(GOALS_KEY, g); notifyBackup(); },
    getMealDefaults() { return readJSON(MEAL_DEFAULTS_KEY, null); },
    saveMealDefaults(d) { writeJSON(MEAL_DEFAULTS_KEY, d); notifyBackup(); },
    exportAll() {
      return {
        items: readJSON(ITEMS_KEY, null),
        entries: readJSON(ENTRIES_KEY, {}),
        activeFast: readJSON(ACTIVE_FAST_KEY, null),
        goals: readJSON(GOALS_KEY, null),
        mealDefaults: readJSON(MEAL_DEFAULTS_KEY, null),
      };
    },
  };
  return api;
}
