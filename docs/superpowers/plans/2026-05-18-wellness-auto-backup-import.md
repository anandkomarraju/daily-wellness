# Wellness Auto-Backup + Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an IndexedDB mirror of the localStorage data plus a file-import path, so a localStorage wipe doesn't destroy history. Import preserves today's entry and active fast.

**Architecture:** New `backup.js` module owns IndexedDB persistence and a pure `mergeKeepingToday` helper. `storage.js` accepts an optional `backup` collaborator and calls `backup.queue(snapshot)` after every write; queue debounces 2s. `app.js` wires `Backup` into `Storage` and flushes on `visibilitychange`. Settings adds **Restore from backup** and **Import file** actions; both go through the same merge + write-back path.

**Tech Stack:** Vanilla JS modules, `indexedDB` browser API, existing browser-based test harness in `tests/test.html`.

**Spec:** `docs/superpowers/specs/2026-05-18-wellness-auto-backup-import-design.md`

---

## File Structure

**New:**
- `backup.js` — `Backup({ idb, now, setTimeout, clearTimeout })` factory + `mergeKeepingToday` pure function

**Modified:**
- `storage.js` — second arg `backup`; `replaceEntries(entriesObject)` method; `queue` calls after writes
- `app.js` — import `Backup`, wire it into `Storage`, register `visibilitychange` flush
- `settings.js` — two new buttons (Restore from backup, Import file) + handlers
- `tests/tests.js` — fake IDB + fake clock helpers, mirror/restore/merge/validation cases
- `tests/test.html` — no change expected (tests.js is its sole script)

---

## Task 1: Add `Storage.replaceEntries` (TDD)

**Files:**
- Modify: `storage.js`
- Test: `tests/tests.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tests.js` *before* the `// Render` block:

```js
it("replaceEntries overwrites the entire entries map", () => {
  const s = fresh();
  s.saveEntry("2026-05-09", { date: "2026-05-09", items: {}, savedAt: "x" });
  s.saveEntry("2026-05-10", { date: "2026-05-10", items: {}, savedAt: "y" });
  s.replaceEntries({ "2026-05-11": { date: "2026-05-11", items: {}, savedAt: "z" } });
  eq(s.getEntry("2026-05-09"), null, "old date should be gone");
  eq(s.getEntry("2026-05-10"), null, "old date should be gone");
  eq(s.getEntry("2026-05-11").savedAt, "z", "new date should be present");
});
```

- [ ] **Step 2: Run tests to verify failure**

Open `tests/test.html` in a browser. Expected: FAIL on "replaceEntries overwrites the entire entries map" (TypeError: s.replaceEntries is not a function).

- [ ] **Step 3: Implement `replaceEntries`**

Edit `storage.js`. Add the method to the returned object literal, between `getAllEntries` and `exportAll`:

```js
    replaceEntries(entries) { writeJSON(ENTRIES_KEY, entries || {}); },
```

- [ ] **Step 4: Run tests to verify pass**

Reload `tests/test.html`. Expected: the new test PASSes; no prior tests regress.

- [ ] **Step 5: Commit**

```bash
git add storage.js tests/tests.js
git commit -m "feat(storage): add replaceEntries for wholesale entries reset"
```

---

## Task 2: Create `Backup` module skeleton + `mergeKeepingToday` (TDD)

**Files:**
- Create: `backup.js`
- Test: `tests/tests.js`

- [ ] **Step 1: Write the failing test**

At the top of `tests/tests.js`, add to the existing import block:

```js
import { mergeKeepingToday } from "../backup.js";
```

Append before `// Render`:

```js
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
```

- [ ] **Step 2: Run tests to verify failure**

Reload `tests/test.html`. Expected: import error or FAIL on the three new tests.

- [ ] **Step 3: Create `backup.js` with `mergeKeepingToday`**

Create `backup.js`:

```js
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

export function Backup() {
  return {
    queue() {},
    flush() {},
    async restore() { return null; },
    close() {},
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Reload `tests/test.html`. Expected: three new tests PASS; nothing regresses.

- [ ] **Step 5: Commit**

```bash
git add backup.js tests/tests.js
git commit -m "feat(backup): add backup.js skeleton + mergeKeepingToday helper"
```

---

## Task 3: Add fake IDB + fake clock test helpers, then debounced `queue`

**Files:**
- Modify: `backup.js`
- Test: `tests/tests.js`

- [ ] **Step 1: Add fake IDB + fake clock helpers to `tests/tests.js`**

Insert after the existing `fresh()` helper (around line 18):

```js
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
```

- [ ] **Step 2: Write the failing tests for `queue` debounce**

Append before `// Render`:

```js
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
```

- [ ] **Step 3: Run tests to verify failure**

Reload `tests/test.html`. Expected: all four new tests FAIL (current `queue` is a no-op).

- [ ] **Step 4: Implement `Backup` properly**

Replace the `Backup(...)` function in `backup.js`:

```js
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
```

- [ ] **Step 5: Run tests to verify pass**

Reload `tests/test.html`. Expected: four new debounce tests PASS, plus all prior tests.

- [ ] **Step 6: Commit**

```bash
git add backup.js tests/tests.js
git commit -m "feat(backup): debounced IDB mirror with flush, fake-IDB tests"
```

---

## Task 4: `Backup.restore` test (TDD)

**Files:**
- Test: `tests/tests.js` (only — `restore` is already implemented in Task 3)

- [ ] **Step 1: Write tests**

Append before `// Render`:

```js
it("Backup.restore returns null when no prior write", async () => {
  const idb = makeFakeIdb();
  const clock = makeFakeClock();
  const b = Backup({ idb, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  await flushMicrotasks();
  const r = await b.restore();
  eq(r, null);
});

it("Backup.restore returns the snapshot after queue + flush", async () => {
  const idb = makeFakeIdb();
  const clock = makeFakeClock();
  const b = Backup({ idb, now: () => 12345, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  await flushMicrotasks();
  const snap = { items: null, entries: { "2026-05-10": { foo: 1 } }, activeFast: null };
  b.queue(snap);
  b.flush();
  const r = await b.restore();
  eq(r.savedAt, 12345);
  eq(r.data, snap);
});
```

- [ ] **Step 2: Run tests to verify pass**

Reload `tests/test.html`. Expected: both new tests PASS (Task 3's implementation already supports them).

- [ ] **Step 3: Commit**

```bash
git add tests/tests.js
git commit -m "test(backup): cover restore() empty + roundtrip cases"
```

---

## Task 5: Wire `backup` into `Storage` (TDD)

**Files:**
- Modify: `storage.js`
- Test: `tests/tests.js`

- [ ] **Step 1: Write the failing test**

Append before `// Render`:

```js
it("Storage with backup wired calls backup.queue on saveEntry", () => {
  let captured = null;
  const fakeBackup = { queue: (snap) => { captured = snap; }, flush(){}, restore: async () => null, close(){} };
  localStorage.clear();
  const s = Storage(localStorage, fakeBackup);
  s.saveEntry("2026-05-10", { date: "2026-05-10", items: {}, savedAt: "x" });
  if (!captured) throw new Error("backup.queue was not called");
  eq(captured.entries["2026-05-10"].savedAt, "x", "snapshot reflects the just-saved entry");
});

it("Storage with backup wired calls backup.queue on saveItems and saveActiveFast", () => {
  const seen = [];
  const fakeBackup = { queue: (s) => seen.push(s), flush(){}, restore: async () => null, close(){} };
  localStorage.clear();
  const s = Storage(localStorage, fakeBackup);
  s.saveItems({ items: [{ id: "a" }] });
  s.saveActiveFast({ startMs: 1 });
  eq(seen.length, 2);
  eq(seen[0].items.items[0].id, "a");
  eq(seen[1].activeFast.startMs, 1);
});

it("Storage with backup wired calls backup.queue on replaceEntries", () => {
  let captured = null;
  const fakeBackup = { queue: (s) => { captured = s; }, flush(){}, restore: async () => null, close(){} };
  localStorage.clear();
  const s = Storage(localStorage, fakeBackup);
  s.replaceEntries({ "2026-05-11": { date: "2026-05-11", items: {}, savedAt: "z" } });
  if (!captured) throw new Error("backup.queue was not called");
  eq(captured.entries["2026-05-11"].savedAt, "z");
});
```

- [ ] **Step 2: Run tests to verify failure**

Reload `tests/test.html`. Expected: all three new tests FAIL ("backup.queue was not called").

- [ ] **Step 3: Modify `storage.js`**

Replace the contents of `storage.js` with:

```js
const ITEMS_KEY = "wellness:items";
const ENTRIES_KEY = "wellness:entries";
const ACTIVE_FAST_KEY = "wellness:activeFast";

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
    exportAll() {
      return { items: readJSON(ITEMS_KEY, null), entries: readJSON(ENTRIES_KEY, {}), activeFast: readJSON(ACTIVE_FAST_KEY, null) };
    },
  };
  return api;
}
```

- [ ] **Step 4: Run tests to verify pass**

Reload `tests/test.html`. Expected: three new tests PASS; all prior tests (including `replaceEntries` from Task 1) still PASS.

- [ ] **Step 5: Commit**

```bash
git add storage.js tests/tests.js
git commit -m "feat(storage): notify backup.queue after every write"
```

---

## Task 6: Wire `Backup` into `app.js` + visibilitychange flush

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add the import**

Edit `app.js` line 1-9 — add the `Backup` import next to the existing imports. Find:

```js
import { Storage } from "./storage.js";
```

Add immediately below it:

```js
import { Backup } from "./backup.js";
```

- [ ] **Step 2: Construct `Backup` and pass to `Storage`**

Find where `storage` is constructed in `app.js`. Search:

```bash
grep -n "Storage(" app.js
```

Replace the `Storage(localStorage)` call with:

```js
const backup = Backup();
const storage = Storage(localStorage, backup);
```

- [ ] **Step 3: Register visibility flush**

Append to `app.js` after the existing event-listener block (just before `show();` at the bottom):

```js
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") backup.flush();
});
```

- [ ] **Step 4: Manual smoke test**

```bash
cd ~/workspace/wellness && python3 -m http.server 8765
```

Open `http://localhost:8765/` in a browser. Toggle a checkbox. Wait 3 seconds. Open DevTools → Application → IndexedDB → `wellness-backup` → `snapshots` → confirm a row with `id: "latest"` exists with a `savedAt` timestamp from the last 5 seconds and `data.entries` containing today's entry.

Stop the server with Ctrl-C. (The test exists for verification; not a regression check.)

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(app): wire Backup into Storage, flush on visibilitychange"
```

---

## Task 7: Validation helper for imported files (TDD)

**Files:**
- Modify: `backup.js`
- Test: `tests/tests.js`

- [ ] **Step 1: Write the failing tests**

Add `validateImport` to the import line in `tests/tests.js`:

```js
import { mergeKeepingToday, validateImport } from "../backup.js";
```

Append before `// Render`:

```js
it("validateImport throws when entries is missing", () => {
  let threw = false;
  try { validateImport({ items: null, activeFast: null }); } catch { threw = true; }
  if (!threw) throw new Error("expected throw");
});

it("validateImport throws when entries is an array", () => {
  let threw = false;
  try { validateImport({ entries: [], items: null, activeFast: null }); } catch { threw = true; }
  if (!threw) throw new Error("expected throw");
});

it("validateImport accepts a valid envelope", () => {
  validateImport({ entries: { "2026-05-10": {} }, items: null, activeFast: null });
  // no throw = pass
});
```

- [ ] **Step 2: Run tests to verify failure**

Reload `tests/test.html`. Expected: import error or three FAILs.

- [ ] **Step 3: Implement `validateImport`**

Add to `backup.js`, exported alongside `mergeKeepingToday`:

```js
export function validateImport(incoming) {
  if (!incoming || typeof incoming !== "object") throw new Error("File doesn't look like a wellness export");
  const e = incoming.entries;
  if (!e || typeof e !== "object" || Array.isArray(e)) throw new Error("File doesn't look like a wellness export");
  return incoming;
}
```

- [ ] **Step 4: Run tests to verify pass**

Reload `tests/test.html`. Expected: three new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backup.js tests/tests.js
git commit -m "feat(backup): add validateImport for imported file shape"
```

---

## Task 8: Settings UI — Restore from backup

**Files:**
- Modify: `settings.js`

- [ ] **Step 1: Add a `backup` parameter to `renderSettings`**

Edit `settings.js` line 15. Change:

```js
export function renderSettings(root, storage, items, onChange) {
```

To:

```js
export function renderSettings(root, storage, items, onChange, backup) {
```

- [ ] **Step 2: Update the call site in `app.js`**

Search:

```bash
grep -n "renderSettings(" app.js
```

For each call, append `, backup` as the fifth argument. Example:

```js
renderSettings(root, storage, items, (newItems, action) => { ... }, backup);
```

- [ ] **Step 3: Add the Restore button to `settings.js` `paint()`**

In `settings.js`, locate the `reset` button block (line 51-55) and append after `wrap.appendChild(reset);`:

```js
    const restore = document.createElement("button");
    restore.className = "reset";
    restore.id = "restore-btn";
    restore.textContent = "Restore from backup";
    wrap.appendChild(restore);
```

- [ ] **Step 4: Add the click handler**

In `settings.js`, inside the existing `root.addEventListener("click", ...)` block, add a handler for `restore-btn` after the `reset-btn` handler:

```js
    if (ev.target.id === "restore-btn") {
      (async () => {
        if (!backup) { alert("Backup storage unavailable in this browser."); return; }
        const snap = await backup.restore();
        if (!snap) { alert("No backup found yet."); return; }
        const todayStr = new Date(snap.savedAt).toLocaleString();
        const dayCount = Object.keys(snap.data.entries || {}).length;
        if (!confirm(`Restore snapshot from ${todayStr} (${dayCount} days)? This replaces history except today's entry and your active fast.`)) return;
        try {
          const { mergeKeepingToday } = await import("./backup.js");
          const { todayKey } = await import("./entry.js");
          const merged = mergeKeepingToday(snap.data, storage.exportAll(), todayKey());
          storage.saveItems(merged.items);
          storage.replaceEntries(merged.entries);
          storage.saveActiveFast(merged.activeFast);
          alert("Restore complete.");
          onChange(items, "back");
        } catch (e) {
          alert("Restore failed: " + e.message);
        }
      })();
      return;
    }
```

- [ ] **Step 5: Manual smoke test**

```bash
cd ~/workspace/wellness && python3 -m http.server 8765
```

In the browser:
1. Make a few entries on different dates (use DevTools → Application → Local Storage to inject `wellness:entries` with a couple of past dates if needed)
2. Wait 3s; confirm a snapshot exists in IndexedDB
3. Clear localStorage only (DevTools → right-click "Local Storage" entry → Clear)
4. Reload page → Settings → Restore from backup → confirm dialog → confirm
5. Verify entries reappear

Stop server.

- [ ] **Step 6: Commit**

```bash
git add app.js settings.js
git commit -m "feat(settings): add Restore from backup action"
```

---

## Task 9: Settings UI — Import file

**Files:**
- Modify: `settings.js`

- [ ] **Step 1: Add the Import button to `paint()`**

In `settings.js`, after the `restore` button block from Task 8, append:

```js
    const importBtn = document.createElement("button");
    importBtn.className = "reset";
    importBtn.id = "import-btn";
    importBtn.textContent = "Import file";
    wrap.appendChild(importBtn);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.id = "import-file";
    fileInput.style.display = "none";
    wrap.appendChild(fileInput);
```

- [ ] **Step 2: Add the click handler**

Inside the click listener, after the `restore-btn` handler:

```js
    if (ev.target.id === "import-btn") {
      root.querySelector("#import-file").click();
      return;
    }
```

- [ ] **Step 3: Add the file-change handler**

Inside the existing `root.addEventListener("change", ...)` block, before the existing text-input handler, add:

```js
    if (ev.target.id === "import-file") {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      (async () => {
        try {
          const text = await file.text();
          let parsed;
          try { parsed = JSON.parse(text); } catch { alert("File is not valid JSON."); return; }
          const { mergeKeepingToday, validateImport } = await import("./backup.js");
          const { todayKey } = await import("./entry.js");
          try { validateImport(parsed); } catch (e) { alert(e.message); return; }
          const dayCount = Object.keys(parsed.entries || {}).length;
          if (!confirm(`Import ${dayCount} days from this file? This replaces history except today's entry and your active fast.`)) return;
          const merged = mergeKeepingToday(parsed, storage.exportAll(), todayKey());
          storage.saveItems(merged.items);
          storage.replaceEntries(merged.entries);
          storage.saveActiveFast(merged.activeFast);
          alert("Import complete.");
          onChange(items, "back");
        } catch (e) {
          alert("Import failed: " + e.message);
        } finally {
          ev.target.value = ""; // allow re-importing the same file
        }
      })();
      return;
    }
```

- [ ] **Step 4: Manual smoke test**

```bash
cd ~/workspace/wellness && python3 -m http.server 8765
```

In the browser:
1. Settings → Export (existing button) → save the JSON file
2. Open the file, edit one entry's `savedAt` to `"smoke-test"`, save
3. Settings → Import file → pick the edited file → confirm
4. Reload, open Timeline, find the edited day, verify the entry's `savedAt` reflects the import (use DevTools to inspect `wellness:entries`)
5. Try importing a file with `entries: []` — alert "File doesn't look like a wellness export"
6. Try importing a non-JSON file — alert "File is not valid JSON."

Stop server.

- [ ] **Step 5: Commit**

```bash
git add settings.js
git commit -m "feat(settings): add Import file action with validation"
```

---

## Task 10: Verify all tests still pass

**Files:** none

- [ ] **Step 1: Run the whole suite**

```bash
cd ~/workspace/wellness && python3 -m http.server 8765
```

Open `http://localhost:8765/tests/test.html`. Confirm every test row is green. Count: existing tests + 13 new (1 from Task 1, 3 from Task 2, 4 from Task 3, 2 from Task 4, 3 from Task 5, 3 from Task 7) = expected pass count.

If any FAIL, fix before committing. If all green, no commit needed.

- [ ] **Step 2: Final smoke flow**

In the running server:
1. Open the app in a fresh incognito window
2. Make today's entries, start a fast
3. Open DevTools → Application → IndexedDB → confirm snapshot
4. Settings → Export → save file
5. Settings → Import file → pick the just-exported file → confirm
6. Verify today's entry and active fast survived
7. Reload → confirm state is intact

Stop server.

---

## Self-Review

**Spec coverage:**
- Architecture diagram → reflected in Tasks 5+6 (storage→backup→IDB)
- `backup.js` API (`queue`/`flush`/`restore`/`close`) → Tasks 2 (skeleton) + 3 (real impl) + 4 (restore tests)
- `mergeKeepingToday` pure function → Task 2
- `Storage` second arg + `replaceEntries` → Tasks 1 + 5
- `app.js` wiring + visibilitychange → Task 6
- Settings Restore button → Task 8
- Settings Import button + validation → Tasks 7 + 9
- Error handling boundaries (silent in mirror, surfaced in UI) → Task 5 (try/catch around `notifyBackup`), Task 3 (silent open/write failures), Tasks 8-9 (alerts)
- Validation rule (loose, no version field) → Task 7
- Test cases 1-12 from spec + the new test 13 → mapped 1:1 across Tasks 1-7

**Placeholder scan:** No "TBD"/"TODO"/"add appropriate"; every code step contains complete code; every command has expected output described in the surrounding step.

**Type/name consistency:**
- `Backup({ idb, now, setTimeout, clearTimeout })` — same signature in Task 3 and used identically in Tasks 4-7
- `mergeKeepingToday(incoming, current, todayKey)` — same call shape in Task 2 (test) and Tasks 8-9 (use)
- `validateImport(parsed)` — defined in Task 7, used in Task 9
- `storage.replaceEntries(entries)` — defined in Task 1, used in Tasks 5, 8, 9
- `Storage(backend, backup)` — second arg added in Task 5, used in Task 6

**Scope:** Single feature, one plan, no decomposition needed.
