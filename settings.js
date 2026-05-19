import { defaultItems, nextOrder } from "./items.js";

function slugify(s) {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "item";
}
function uniqueId(items, base) {
  const taken = new Set(items.items.map(i => i.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function renderSettings(root, storage, items, onChange, backup) {
  const controller = new AbortController();
  const { signal } = controller;

  function save() { storage.saveItems(items); onChange(items); paint(); }

  function paint() {
    items.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    root.innerHTML = `<a href="#" class="back" id="back-link">← Back</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings";

    const list = document.createElement("div");
    list.className = "flat-list";
    items.items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "item";
      row.dataset.id = it.id;
      row.innerHTML = `
        <button data-act="up">↑</button>
        <button data-act="down">↓</button>
        <span class="num">${idx + 1}.</span>
        <input type="text" value="${it.label.replace(/"/g, "&quot;")}" />
        <button class="macros-chip ${it.macros ? "on" : ""}" data-act="macros" title="Toggle macro tracking">macros</button>
        <button data-act="del" title="Delete">✕</button>
      `;
      list.appendChild(row);
    });
    wrap.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.className = "add";
    addBtn.id = "add-btn";
    addBtn.textContent = "+ add item";
    wrap.appendChild(addBtn);

    const reset = document.createElement("button");
    reset.className = "reset";
    reset.id = "reset-btn";
    reset.textContent = "Reset to defaults";
    wrap.appendChild(reset);

    const restore = document.createElement("button");
    restore.className = "reset";
    restore.id = "restore-btn";
    restore.textContent = "Restore from backup";
    wrap.appendChild(restore);

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

    root.appendChild(wrap);
  }

  root.addEventListener("click", (ev) => {
    if (ev.target.id === "back-link") { ev.preventDefault(); controller.abort(); onChange(items, "back"); return; }
    if (ev.target.id === "reset-btn") {
      if (!confirm("Restore the default 14-item routine? Existing items will be replaced.")) return;
      const fresh = defaultItems();
      items.items = fresh.items;
      save();
      return;
    }
    if (ev.target.id === "add-btn") {
      const label = prompt("New item label:");
      if (!label) return;
      items.items.push({
        id: uniqueId(items, slugify(label)),
        label,
        order: nextOrder(items),
      });
      save();
      return;
    }
    if (ev.target.id === "restore-btn") {
      (async () => {
        if (!backup) { alert("Backup storage unavailable in this browser."); return; }
        let snap = null;
        try { snap = await backup.restore(); } catch { alert("Backup storage unavailable in this browser."); return; }
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
    if (ev.target.id === "import-btn") {
      root.querySelector("#import-file").click();
      return;
    }
    const itemRow = ev.target.closest(".item");
    if (!itemRow) return;
    const id = itemRow.dataset.id;
    const idx = items.items.findIndex(i => i.id === id);
    const act = ev.target.dataset.act;
    if (act === "del") {
      if (!confirm("Delete this item? History keeps the old record.")) return;
      items.items.splice(idx, 1);
      save();
    } else if (act === "macros") {
      items.items[idx].macros = !items.items[idx].macros;
      save();
    } else if (act === "up" && idx > 0) {
      const a = items.items[idx], b = items.items[idx - 1];
      const t = a.order; a.order = b.order; b.order = t;
      save();
    } else if (act === "down" && idx < items.items.length - 1) {
      const a = items.items[idx], b = items.items[idx + 1];
      const t = a.order; a.order = b.order; b.order = t;
      save();
    }
  }, { signal });

  root.addEventListener("change", (ev) => {
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
          ev.target.value = "";
        }
      })();
      return;
    }
    if (ev.target.matches('.flat-list input[type="text"]')) {
      const id = ev.target.closest(".item").dataset.id;
      const it = items.items.find(i => i.id === id);
      it.label = ev.target.value;
      save();
    }
  }, { signal });

  paint();
}
