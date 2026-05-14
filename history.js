export function renderHistory(root, storage) {
  const all = storage.exportAll().entries;
  const dates = Object.keys(all).sort().reverse();
  root.innerHTML = `<div class="history"></div>`;
  const wrap = root.querySelector(".history");
  if (dates.length === 0) {
    wrap.innerHTML = "<p>No saved days yet.</p>";
    return;
  }
  for (const date of dates) {
    const e = all[date];
    const ids = Object.keys(e.items);
    const done = ids.filter(id => e.items[id].checked).length;
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `<h3>${date}</h3><div class="summary">${done} of ${ids.length} done</div>`;
    const ul = document.createElement("ul");
    for (const id of ids) {
      const it = e.items[id];
      const li = document.createElement("li");
      li.className = it.checked ? "" : "miss";
      li.innerHTML = `${it.checked ? "✓" : "○"} ${it.label || id}`;
      if (!it.checked && it.comment)
        li.innerHTML += ` <span class="why">— ${it.comment}</span>`;
      ul.appendChild(li);
    }
    div.appendChild(ul);
    wrap.appendChild(div);
  }
}
