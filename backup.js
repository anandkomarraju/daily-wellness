export function mergeKeepingToday(incoming, current, todayKey) {
  const entries = { ...incoming.entries };
  if (current.entries && current.entries[todayKey]) {
    entries[todayKey] = current.entries[todayKey];
  }
  return {
    items: incoming.items,
    entries,
    activeFast: current.activeFast ?? null,
  };
}

const DB_NAME = "wellness-backup";
const STORE = "snapshots";
const DEBOUNCE_MS = 2000;

export function Backup({
  idb = (typeof indexedDB !== "undefined" ? indexedDB : null),
  now = () => Date.now(),
  setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
  clearTimeout: cancel = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  let dbPromise = null;
  let dbFailed = false;
  let pendingSnapshot = null;
  let timerId = null;

  function openDB() {
    if (!idb) { dbFailed = true; return Promise.resolve(null); }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames || !db.objectStoreNames.contains || !db.objectStoreNames.contains(STORE)) {
          try { db.createObjectStore(STORE, { keyPath: "id" }); } catch {}
        }
      };
      req.onsuccess = (ev) => resolve(ev.target.result);
      req.onerror = () => { dbFailed = true; console.warn("[backup] open failed"); resolve(null); };
    });
    return dbPromise;
  }

  // Kick off openDB eagerly so failure is detected before first queue
  openDB();

  async function writeNow(snapshot) {
    try {
      const db = await openDB();
      if (!db || dbFailed) return;
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put({ id: "latest", savedAt: now(), data: snapshot });
    } catch (e) {
      console.warn("[backup] write failed", e);
    }
  }

  function queue(snapshot) {
    if (dbFailed) return;
    pendingSnapshot = snapshot;
    if (timerId != null) cancel(timerId);
    timerId = schedule(() => {
      timerId = null;
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      writeNow(snap);
    }, DEBOUNCE_MS);
  }

  function flush() {
    if (timerId != null) { cancel(timerId); timerId = null; }
    if (pendingSnapshot != null) {
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      writeNow(snap);
    }
  }

  async function restore() {
    const db = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get("latest");
        req.onsuccess = (ev) => resolve(ev.target.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  function close() { /* tests use this; real DB stays open */ }

  return { queue, flush, restore, close };
}
