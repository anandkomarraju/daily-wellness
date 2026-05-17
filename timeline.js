function pad(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function computeDateWindow(today = new Date(), n = 30) {
  const cap = Math.min(n, 30);
  const out = [];
  for (let i = cap - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

export function classifyCell(entry, itemId) {
  if (!entry || !entry.items) return "red";
  const cell = entry.items[itemId];
  if (!cell) return "red";
  return cell.checked ? "green" : "grey";
}

export function renderTimeline(root, storage, items) {
  const all = storage.exportAll().entries;
  const dates = computeDateWindow(new Date(), 30);

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "timeline";

  const legend = document.createElement("div");
  legend.className = "timeline-legend";
  legend.innerHTML = `
    <span><span class="swatch" style="background: var(--sage)"></span>done</span>
    <span><span class="swatch" style="background: var(--muted); opacity: 0.45"></span>tracked, not done</span>
    <span><span class="swatch" style="background: #c87b7b"></span>no entry</span>
    <span>· Last ${dates.length} days · today on the right</span>
  `;
  wrap.appendChild(legend);

  if (Object.keys(all).length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No saved days yet. Open the app each day and tap Save to start your timeline.";
    wrap.appendChild(empty);
    root.appendChild(wrap);
    return;
  }

  for (const sec of items.sections) {
    if (sec.items.length === 0) continue;
    const block = document.createElement("div");
    block.className = "sec-block";
    block.dataset.key = sec.key;
    block.innerHTML = `<h3>${sec.title}</h3>`;
    for (const it of sec.items) {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = it.label;
      row.appendChild(label);
      const strip = document.createElement("div");
      strip.className = "strip";
      for (const date of dates) {
        const cls = classifyCell(all[date], it.id);
        const dot = document.createElement("span");
        dot.className = `dot ${cls}`;
        dot.title = `${date}: ${cls}`;
        strip.appendChild(dot);
      }
      row.appendChild(strip);
      block.appendChild(row);
    }
    wrap.appendChild(block);
  }
  root.appendChild(wrap);
}
