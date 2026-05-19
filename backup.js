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
  let db = null;            // sync handle once open resolves
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
        const handle = ev.target.result;
        if (!handle.objectStoreNames || !handle.objectStoreNames.contains || !handle.objectStoreNames.contains(STORE)) {
          try { handle.createObjectStore(STORE, { keyPath: "id" }); } catch {}
        }
      };
      req.onsuccess = (ev) => { db = ev.target.result; resolve(db); };
      req.onerror = () => { dbFailed = true; console.warn("[backup] open failed"); resolve(null); };
    });
    return dbPromise;
  }

  // Kick off openDB eagerly so failure is detected before first queue
  openDB();

  function doPut(handle, snapshot) {
    try {
      const tx = handle.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id: "latest", savedAt: now(), data: snapshot });
    } catch (e) {
      console.warn("[backup] write failed", e);
    }
  }

  function writeNow(snapshot) {
    if (dbFailed) return;
    if (db) { doPut(db, snapshot); return; }
    // open hasn't completed yet — fall back to async path
    openDB().then((resolved) => { if (resolved && !dbFailed) doPut(resolved, snapshot); });
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

  function readLatest(handle) {
    return new Promise((resolve) => {
      try {
        const tx = handle.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get("latest");
        req.onsuccess = (ev) => resolve(ev.target.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function restore() {
    if (db) return readLatest(db);
    const handle = await openDB();
    if (!handle) return null;
    return readLatest(handle);
  }

  function close() { /* tests use this; real DB stays open */ }

  return { queue, flush, restore, close };
}
