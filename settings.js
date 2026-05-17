import { defaultItems } from "./items.js";

function slugify(s) {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "item";
}
function uniqueId(items, base) {
  const taken = new Set(items.sections.flatMap(s => s.items.map(i => i.id)));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function renderSettings(root, storage, items, onChange) {
  function save() { storage.saveItems(items); onChange(items); paint(); }

  const controller = new AbortController();
  const { signal } = controller;

  let mode = "main"; // "main" | "reorder"

  function paintMain() {
    root.innerHTML = `<a href="#" class="back" id="back-link">← Back</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings";

    const reorder = document.createElement("a");
    reorder.href = "#";
    reorder.className = "reorder-link";
    reorder.id = "reorder-link";
    reorder.textContent = "Reorder routine →";
    wrap.appendChild(reorder);

    for (const sec of items.sections) {
      const block = document.createElement("div");
      block.className = "sec-block";
      block.dataset.key = sec.key;
      block.innerHTML = `<h3>${sec.title}</h3>`;
      for (const it of sec.items) {
        const row = document.createElement("div");
        row.className = "item";
        row.dataset.id = it.id;
        row.innerHTML = `
          <button data-act="up">↑</button>
          <button data-act="down">↓</button>
          <input type="text" value="${it.label.replace(/"/g, "&quot;")}" />
          <button data-act="del">✕</button>
        `;
        block.appendChild(row);
      }
      const addBtn = document.createElement("button");
      addBtn.className = "add";
      addBtn.dataset.act = "add";
      addBtn.textContent = "+ add item";
      block.appendChild(addBtn);
      wrap.appendChild(block);
    }
    const reset = document.createElement("button");
    reset.className = "reset";
    reset.id = "reset-btn";
    reset.textContent = "Reset to defaults";
    wrap.appendChild(reset);
    root.appendChild(wrap);
  }

  function paintReorder() {
    root.innerHTML = `<a href="#" class="back" id="back-to-settings">← Back to settings</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings";
    const card = document.createElement("div");
    card.className = "reorder";

    const flat = items.sections.flatMap(s => s.items)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    flat.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "ord";
      row.dataset.id = it.id;
      row.innerHTML = `
        <button data-act="rup">↑</button>
        <button data-act="rdown">↓</button>
        <span class="num">${idx + 1}.</span>
        <span class="label">${it.label}</span>
      `;
      card.appendChild(row);
    });
    wrap.appendChild(card);
    root.appendChild(wrap);
  }

  function paint() {
    if (mode === "reorder") paintReorder();
    else paintMain();
  }

  root.addEventListener("click", (ev) => {
    if (ev.target.id === "back-link") { ev.preventDefault(); controller.abort(); onChange(items, "back"); return; }
    if (ev.target.id === "reorder-link") { ev.preventDefault(); mode = "reorder"; paint(); return; }
    if (ev.target.id === "back-to-settings") { ev.preventDefault(); mode = "main"; paint(); return; }
    if (ev.target.dataset.act === "rup" || ev.target.dataset.act === "rdown") {
      const row = ev.target.closest(".ord");
      const id = row.dataset.id;
      const flat = items.sections.flatMap(s => s.items)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const idx = flat.findIndex(i => i.id === id);
      const swapWith = ev.target.dataset.act === "rup" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= flat.length) return;
      const a = flat[idx], b = flat[swapWith];
      const tmp = a.order; a.order = b.order; b.order = tmp;
      save();
      return;
    }
    if (ev.target.id === "reset-btn") {
      if (!confirm("Restore the original 4-section default list? Existing items will be replaced."))
        return;
      const fresh = defaultItems();
      items.sections = fresh.sections;
      save();
      return;
    }
    const block = ev.target.closest(".sec-block");
    if (!block) return;
    const sec = items.sections.find(s => s.key === block.dataset.key);
    const act = ev.target.dataset.act;
    if (act === "add") {
      const label = prompt("New item label:");
      if (!label) return;
      sec.items.push({ id: uniqueId(items, slugify(label)), label });
      save();
      return;
    }
    const itemRow = ev.target.closest(".item");
    if (!itemRow) return;
    const idx = sec.items.findIndex(i => i.id === itemRow.dataset.id);
    if (act === "del") {
      if (!confirm("Delete this item? History keeps the old record.")) return;
      sec.items.splice(idx, 1); save();
    } else if (act === "up" && idx > 0) {
      [sec.items[idx - 1], sec.items[idx]] = [sec.items[idx], sec.items[idx - 1]]; save();
    } else if (act === "down" && idx < sec.items.length - 1) {
      [sec.items[idx + 1], sec.items[idx]] = [sec.items[idx], sec.items[idx + 1]]; save();
    }
  }, { signal });

  root.addEventListener("change", (ev) => {
    if (ev.target.matches('.settings input[type="text"]')) {
      const block = ev.target.closest(".sec-block");
      const sec = items.sections.find(s => s.key === block.dataset.key);
      const id = ev.target.closest(".item").dataset.id;
      const it = sec.items.find(i => i.id === id);
      it.label = ev.target.value;
      save();
    }
  }, { signal });

  paint();
}
