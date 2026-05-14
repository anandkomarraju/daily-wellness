function pad(n) { return String(n).padStart(2, "0"); }

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function snapshotItems(items) {
  const out = {};
  for (const sec of items.sections) {
    for (const it of sec.items) out[it.id] = it.label;
  }
  return out;
}

export function blankEntry(dateKey, items) {
  const out = { date: dateKey, items: {} };
  for (const sec of items.sections) {
    for (const it of sec.items) {
      out.items[it.id] = { label: it.label, checked: false, comment: "" };
    }
  }
  return out;
}

export function mergeIntoEntry(existing, items) {
  const blank = blankEntry(existing.date, items);
  const merged = { ...existing, items: { ...blank.items } };
  for (const id of Object.keys(existing.items)) {
    if (id in merged.items) {
      // Preserve everything from existing — including frozen label.
      merged.items[id] = existing.items[id];
    } else {
      // Item was deleted from current list, but keep historical record.
      merged.items[id] = existing.items[id];
    }
  }
  return merged;
}

export function countDone(entry) {
  let done = 0, total = 0;
  for (const id of Object.keys(entry.items)) {
    total++;
    if (entry.items[id].checked) done++;
  }
  return { done, total };
}
