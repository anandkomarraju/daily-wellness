function pad(n) { return String(n).padStart(2, "0"); }

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function iterItems(items) {
  if (Array.isArray(items?.items)) return items.items;
  if (Array.isArray(items?.sections)) return items.sections.flatMap(s => s.items);
  return [];
}

export function snapshotItems(items) {
  const out = {};
  for (const it of iterItems(items)) out[it.id] = it.label;
  return out;
}

export function blankEntry(dateKey, items) {
  const out = { date: dateKey, items: {} };
  for (const it of iterItems(items)) {
    out.items[it.id] = { label: it.label, checked: false, comment: "" };
  }
  return out;
}

export function mergeIntoEntry(existing, items) {
  const blank = blankEntry(existing.date, items);
  const merged = { ...existing, items: { ...blank.items } };
  for (const id of Object.keys(existing.items)) {
    merged.items[id] = existing.items[id];
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
