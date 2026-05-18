# Wellness Auto-Backup + Import — Design

**Status:** Approved 2026-05-18
**Scope:** In-browser data redundancy for the wellness PWA. Adds an IndexedDB mirror of the existing localStorage data and a file-import path. No backend, no cross-device sync.

## Problem

Today, every byte of wellness data lives in a single localStorage origin. Safari ITP eviction, "Clear browsing data," or a corrupted profile wipes weeks of entries with no recovery. Manual `Export` exists but requires the user to remember to run it.

## Goal

Survive a localStorage wipe without losing history, and let the user restore from either an automatic in-browser backup or a previously-downloaded export file — without clobbering the day's in-progress work.

## Non-Goals

- Cloud sync or any server component
- Cross-device sync
- Versioning or history of multiple snapshots (only the latest is retained)
- Automatic file-system backups (no File System Access API)

## Architecture

A new `backup.js` module owns IndexedDB persistence. `storage.js` accepts an optional `backup` collaborator and calls `backup.queue(snapshot)` after every successful localStorage write. The UI gets two new actions in Settings: **Restore from backup** (reads IndexedDB) and **Import file** (reads a `.json` from disk). Both paths funnel through the same today-preserving merge.

```
┌──────────────┐  setItem    ┌──────────────┐
│   app.js     │────────────▶│  storage.js  │──▶ localStorage
│  settings.js │             │              │
└──────────────┘             │  ┌────────┐  │
       ▲                     │  │ queue  │  │
       │ restore/import      │  └───┬────┘  │
       │                     └──────┼───────┘
       │                            ▼ debounced 2s
       │                     ┌──────────────┐
       └─────────────────────│  backup.js   │──▶ IndexedDB
                             └──────────────┘
```

## Components

### `backup.js` (new)

```js
export function Backup({ idb = indexedDB, now = () => Date.now(), setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout } = {}) {
  // openDB(): Promise<IDBDatabase> — db "wellness-backup" v1, store "snapshots" (keyPath "id")
  // queue(snapshot): debounce 2s, then write { id: "latest", savedAt: now(), data: snapshot }
  // flush(): cancel pending timer and write immediately; safe to call any time
  // restore(): Promise<{ savedAt, data } | null> — reads { id: "latest" }
  // close(): release the DB handle (test cleanup)
  return { queue, flush, restore, close };
}
```

The merge helper is a pure function exported from the same module so it can be unit-tested in isolation:

```js
export function mergeKeepingToday(incoming, current, todayKey) {
  const entries = { ...incoming.entries };
  if (current.entries[todayKey]) entries[todayKey] = current.entries[todayKey];
  return {
    items: incoming.items,
    entries,
    activeFast: current.activeFast,
  };
}
```

### `storage.js` (modified)

Add optional second arg; non-breaking:

```js
export function Storage(backend = localStorage, backup = null) { ... }
```

After each of `saveItems`, `saveEntry`, `saveActiveFast`: `backup?.queue(this.exportAll())`. Failures inside `backup` must never propagate.

Also add a `replaceEntries(entriesObject)` method that writes the whole `wellness:entries` map in one shot. Used by the restore/import write-back path so dates absent from the backup don't linger. This method also fires `backup?.queue(...)`.

### `app.js` (modified)

```js
import { Backup } from "./backup.js";
const backup = Backup();
const storage = Storage(localStorage, backup);
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") backup.flush();
});
```

### `settings.js` (modified)

Two new buttons appended below the existing **Reset to defaults** button:

- **Restore from backup** → `backup.restore()`. If `null`, alert "No backup found yet." Otherwise show a confirm: *"Restore snapshot from {savedAt} ({entryCount} days)? This replaces history except today's entry and your active fast."* On confirm: `mergeKeepingToday(snapshot.data, storage.exportAll(), todayKey())` → write back through `storage` (per-date for `entries`, plus `saveItems` and `saveActiveFast`).
- **Import file** → triggers a hidden `<input type="file" accept=".json">`. Read with `FileReader.readAsText`, `JSON.parse`, validate, then identical merge + write-back path.

Both write-back paths re-trigger `backup.queue` naturally; no separate sync step.

## Data Flow

### Mirror (background, every save)

1. User action → `app.js` → `storage.saveX(...)`
2. `storage.js` writes localStorage synchronously
3. `storage.js` calls `backup.queue(storage.exportAll())` (fire-and-forget)
4. `backup.js` clears any pending timer, sets new 2s timer
5. After 2s of quiet: `db.put("snapshots", { id: "latest", savedAt: now(), data })`
6. On `visibilitychange → hidden`: `backup.flush()` cancels timer and writes immediately

### Restore from IDB

1. User clicks **Restore from backup**
2. `backup.restore()` resolves to `{ savedAt, data } | null`
3. `null` → alert and stop
4. Confirm dialog with `savedAt` and entry count
5. On confirm: `merged = mergeKeepingToday(data, storage.exportAll(), todayKey())`
6. Write back: `storage.saveItems(merged.items)`; `storage.replaceEntries(merged.entries)`; `storage.saveActiveFast(merged.activeFast)`
7. Re-paint Settings; user navigates back to Today/Timeline to see restored data

> **Note:** dates present locally but absent from the backup are dropped. This is intentional under the today-preserving rule — restore replaces history wholesale; only today's entry and the active fast carry over.

### Import file

1. User clicks **Import file** → file picker opens
2. `FileReader.readAsText(file)` → `JSON.parse` → validate
3. Validation failure → alert with reason, stop
4. Same merge + write-back as steps 5–7 above

## Error Handling

**Boundary principle:** the mirror path must never break a save. Errors in `backup` are swallowed at the boundary; errors in user-initiated restore/import surface to the UI.

### Mirror path (silent)

- `indexedDB.open` rejects (private mode, quota, corrupt DB) → keep `db = null`, `queue()` becomes a no-op, log once to `console.warn`. App keeps working off localStorage.
- `db.put` fails (quota, transaction abort) → caught inside the debounced callback, `console.warn`, no retry; next save's debounce retries naturally.
- `flush()` uses the same try/catch; never throws.

### Restore path (UI surface)

- No snapshot → alert "No backup found yet."
- IDB unavailable → alert "Backup storage unavailable in this browser."
- Write-back error → alert "Restore failed: {message}". Partial writes are acceptable; user can retry.

### Import path (UI surface)

- Unreadable file → alert "Could not read file."
- `JSON.parse` throws → "File is not valid JSON."
- Validation fails → "File doesn't look like a wellness export."
- Past validation: same write-back tolerance as restore.

### Validation rule

Deliberately loose; the export format has evolved and there is no version field yet:

```
incoming must be an object with:
  - entries: plain object (keys look like YYYY-MM-DD, values are objects)
  - items:   object or null
  - activeFast: object or null   (preserved from current regardless, but the key must exist)
```

If a version field is added later, validation can tighten.

## Testing

Add to `tests/tests.js` and `tests/test.html`. The `Backup` factory takes injectable `idb`, `now`, and `setTimeout`/`clearTimeout`, mirroring the existing `Storage(backend)` seam.

### Fake IDB (test helper, in tests.js)

~30 lines, in-memory: `open()` resolves to an object with `transaction("snapshots", "readwrite").objectStore("snapshots").put(record)` and `.get(id)`. Just enough to assert what got written.

### Fake clock

`Backup({ idb: fakeIdb, now: () => fakeTime, setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout })`. Tests advance the clock manually.

### Cases

**Mirror:**
1. `queue` once, advance 2s → one IDB write with full snapshot
2. `queue` three times rapidly within 2s → one IDB write with the *last* snapshot
3. `queue` then `flush` → immediate write, timer cancelled
4. `queue` when `idb.open` failed → no throw, no write

**Restore:**
5. `restore` with no prior write → returns `null`
6. `restore` after `queue` + flush → returns the snapshot
7. `Storage(backend, backup)` with backup wired: `saveEntry` triggers `backup.queue` with the right snapshot

**Merge / import:**
8. `mergeKeepingToday` with empty current → returns incoming verbatim except `activeFast: null`
9. `mergeKeepingToday` with today entry in current → today preserved, other dates from incoming
10. `mergeKeepingToday` with active fast in current → preserved
11. Validation: missing `entries` → throws "File doesn't look like a wellness export"
12. Validation: `entries` is an array → throws
13. `storage.replaceEntries({ "2026-05-10": e })` after a prior `saveEntry("2026-05-09", x)` → only the 05-10 entry remains; calling `getEntry("2026-05-09")` returns `null`

### Manual smoke test (documented, not automated)

- Open app, check off some items, wait 3s
- DevTools → Application → IndexedDB → `wellness-backup` → `snapshots` → confirm `latest` row exists with `savedAt` within last 5s
- Clear localStorage (not IDB), reload, click **Restore from backup** → entries come back

## Out of Scope

- Multi-snapshot history / point-in-time recovery
- Cross-device sync
- Encryption at rest
- Server backup
- File System Access API for "auto-write to chosen folder"
