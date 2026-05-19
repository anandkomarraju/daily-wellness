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
