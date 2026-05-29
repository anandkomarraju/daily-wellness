import { defaultItems, nextOrder } from "./items.js";
import { DEFAULT_GOALS, loadGoals, saveGoals, loadMealDefaults, saveMealDefaults } from "./goals.js";

export function renderMealDefaults(root, storage, items, onBack) {
  const controller = new AbortController();
  const { signal } = controller;
  let mealDefaults = loadMealDefaults(storage);
  const macroItems = (items.items || []).filter(it => it.macros).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

  function paint() {
    root.innerHTML = `<a href="#" class="back" id="back-link">← Back</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings goals";

    const intro = document.createElement("p");
    intro.style.color = "var(--muted)";
    intro.style.fontSize = "13px";
    intro.style.margin = "0 0 12px";
    intro.textContent = "Set typical macros per meal. When you check a meal, empty macros auto-fill from these. You can still edit on top.";
    wrap.appendChild(intro);

    if (macroItems.length === 0) {
      const empty = document.createElement("p");
      empty.style.color = "var(--muted)";
      empty.textContent = "No meals with macros enabled. Enable macros on items in Settings first.";
      wrap.appendChild(empty);
      root.appendChild(wrap);
      return;
    }

    for (const it of macroItems) {
      const m = mealDefaults[it.id] || { kcal: "", p: "", fi: "", fa: "", c: "", su: "" };
      const card = document.createElement("div");
      card.className = "meal-default-card";
      card.dataset.id = it.id;
      card.innerHTML = `
        <div class="meal-default-name">${it.label}</div>
        <div class="meal-default-grid">
          <label>Cal <input type="number" min="0" inputmode="numeric" data-md-mac="kcal" value="${m.kcal || ""}"></label>
          <label>P <input type="number" min="0" inputmode="numeric" data-md-mac="p" value="${m.p || ""}"></label>
          <label>Fi <input type="number" min="0" inputmode="numeric" data-md-mac="fi" value="${m.fi || ""}"></label>
          <label>Fa <input type="number" min="0" inputmode="numeric" data-md-mac="fa" value="${m.fa || ""}"></label>
          <label>NetC <input type="number" min="0" inputmode="numeric" data-md-mac="c" value="${m.c || ""}"></label>
          <label>Su <input type="number" min="0" inputmode="numeric" data-md-mac="su" value="${m.su || ""}"></label>
        </div>
      `;
      wrap.appendChild(card);
    }

    const clear = document.createElement("button");
    clear.className = "reset";
    clear.id = "clear-meal-defaults-btn";
    clear.textContent = "Clear all defaults";
    wrap.appendChild(clear);

    root.appendChild(wrap);
  }

  root.addEventListener("click", (ev) => {
    if (ev.target.id === "back-link") { ev.preventDefault(); controller.abort(); onBack(); return; }
    if (ev.target.id === "clear-meal-defaults-btn") {
      if (!confirm("Clear all meal defaults?")) return;
      mealDefaults = saveMealDefaults(storage, {});
      paint();
    }
  }, { signal });

  root.addEventListener("change", (ev) => {
    if (ev.target.matches('input[data-md-mac]')) {
      const card = ev.target.closest(".meal-default-card");
      if (!card) return;
      const id = card.dataset.id;
      const key = ev.target.dataset.mdMac;
      const cur = mealDefaults[id] || { kcal: 0, p: 0, fi: 0, fa: 0, c: 0, su: 0 };
      mealDefaults = saveMealDefaults(storage, { ...mealDefaults, [id]: { ...cur, [key]: ev.target.value } });
    }
  }, { signal });

  paint();
}

const GOAL_FIELDS = [
  { key: "water_oz",    label: "Water",     unit: "oz",   hint: "daily intake target",   nutrient: false },
  { key: "steps",       label: "Steps",     unit: "",     hint: "daily walking goal",    nutrient: false },
  { key: "walks_goal",  label: "Post-Meal Walks", unit: "", hint: "daily target (1-3)", nutrient: false },
  { key: "fast_goal_hours", label: "Fasting Goal", unit: "h", hint: "14, 16, 18, 20, or 24", nutrient: false },
  { key: "kcal",        label: "Calories",  unit: "kcal", hint: "daily intake target",   nutrient: true },
  { key: "protein_g",   label: "Protein",   unit: "g",    hint: "daily minimum",         nutrient: true },
  { key: "fiber_g",     label: "Fiber",     unit: "g",    hint: "daily minimum",         nutrient: true },
  { key: "fats_g",      label: "Fats",      unit: "g",    hint: "daily target",          nutrient: true },
  { key: "net_carbs_g", label: "Net Carbs", unit: "g",    hint: "daily target",          nutrient: true },
  { key: "sugar_max_g", label: "Sugar",     unit: "g",    hint: "daily maximum (warning)", nutrient: true },
];

export function renderGoals(root, storage, onBack) {
  const controller = new AbortController();
  const { signal } = controller;
  let goals = loadGoals(storage);

  function paint() {
    root.innerHTML = `<a href="#" class="back" id="back-link">← Back</a>`;
    const wrap = document.createElement("div");
    wrap.className = "settings goals";

    const intro = document.createElement("p");
    intro.style.color = "var(--muted)";
    intro.style.fontSize = "13px";
    intro.style.margin = "0 0 12px";
    intro.textContent = "Set your daily targets. Saved automatically.";
    wrap.appendChild(intro);

    const toggleRow = document.createElement("div");
    toggleRow.className = "item goal-row";
    toggleRow.style.borderTop = "0";
    toggleRow.innerHTML = `
      <label style="flex:1; font-weight:500;">Track nutrients<br><small style="color:var(--muted); font-weight:400;">Show nutrient ring on Home and macro inputs in Log</small></label>
      <label class="toggle-switch">
        <input type="checkbox" id="track-nutrients-toggle" ${goals.track_nutrients !== false ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
    `;
    wrap.appendChild(toggleRow);

    const list = document.createElement("div");
    list.className = "flat-list";
    const trackNut = goals.track_nutrients !== false;
    for (const f of GOAL_FIELDS) {
      if (f.nutrient && !trackNut) continue;
      const row = document.createElement("div");
      row.className = "item goal-row";
      row.innerHTML = `
        <label style="flex:1; font-weight:500;">${f.label}<br><small style="color:var(--muted); font-weight:400;">${f.hint}</small></label>
        <input type="number" min="1" inputmode="numeric" data-key="${f.key}" value="${goals[f.key]}" style="width:90px; text-align:right;" />
        <span style="color:var(--muted); font-size:13px; min-width:30px;">${f.unit}</span>
      `;
      list.appendChild(row);
    }
    wrap.appendChild(list);

    const reset = document.createElement("button");
    reset.className = "reset";
    reset.id = "reset-goals-btn";
    reset.textContent = "Reset to defaults";
    wrap.appendChild(reset);

    root.appendChild(wrap);
  }

  root.addEventListener("click", (ev) => {
    if (ev.target.id === "back-link") { ev.preventDefault(); controller.abort(); onBack(); return; }
    if (ev.target.id === "reset-goals-btn") {
      if (!confirm("Reset all goals to defaults?")) return;
      goals = saveGoals(storage, { ...DEFAULT_GOALS });
      paint();
    }
  }, { signal });

  root.addEventListener("change", (ev) => {
    if (ev.target.id === "track-nutrients-toggle") {
      goals = saveGoals(storage, { ...goals, track_nutrients: ev.target.checked });
      paint();
      return;
    }
    if (ev.target.matches('.goal-row input[type="number"]')) {
      const key = ev.target.dataset.key;
      goals = saveGoals(storage, { ...goals, [key]: ev.target.value });
      ev.target.value = goals[key];
    }
  }, { signal });

  paint();
}

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

  function save() {
    // Normalize order values to sequential 10, 20, 30...
    items.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (let i = 0; i < items.items.length; i++) items.items[i].order = (i + 1) * 10;
    storage.saveItems(items);
    onChange(items);
    paint();
  }

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

    const goalsLink = document.createElement("button");
    goalsLink.className = "reset";
    goalsLink.id = "edit-goals-btn";
    goalsLink.textContent = "Edit goals →";
    wrap.appendChild(goalsLink);

    const mealDefaultsLink = document.createElement("button");
    mealDefaultsLink.className = "reset";
    mealDefaultsLink.id = "edit-meal-defaults-btn";
    mealDefaultsLink.textContent = "Meal defaults →";
    wrap.appendChild(mealDefaultsLink);

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
    if (ev.target.id === "edit-goals-btn") {
      controller.abort();
      onChange(items, "goals");
      return;
    }
    if (ev.target.id === "edit-meal-defaults-btn") {
      controller.abort();
      onChange(items, "meal-defaults");
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
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const itemRow = btn.closest(".item");
    if (!itemRow) return;
    const id = itemRow.dataset.id;
    const act = btn.dataset.act;
    if (!act) return;
    ev.stopPropagation();
    // Sort items first so we work with visual positions
    items.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = items.items.findIndex(i => i.id === id);
    if (idx === -1) return;
    if (act === "del") {
      if (!confirm("Delete this item?")) return;
      items.items.splice(idx, 1);
      save();
    } else if (act === "macros") {
      items.items[idx].macros = !items.items[idx].macros;
      save();
    } else if (act === "up" && idx > 0) {
      const temp = items.items[idx];
      items.items[idx] = items.items[idx - 1];
      items.items[idx - 1] = temp;
      save();
    } else if (act === "down" && idx < items.items.length - 1) {
      const temp = items.items[idx];
      items.items[idx] = items.items[idx + 1];
      items.items[idx + 1] = temp;
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
