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
  let addingItem = false;

  function save() {
    items.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (let i = 0; i < items.items.length; i++) items.items[i].order = (i + 1) * 10;
    storage.saveItems(items);
  }

  function paint() {
    items.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    root.innerHTML = "";

    const backLink = document.createElement("a");
    backLink.href = "#";
    backLink.className = "back";
    backLink.textContent = "← Back";
    backLink.addEventListener("click", (ev) => { ev.preventDefault(); onChange(items, "back"); });
    root.appendChild(backLink);

    const wrap = document.createElement("div");
    wrap.className = "settings";

    const list = document.createElement("div");
    list.className = "flat-list";
    items.items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "item";
      row.dataset.id = it.id;

      const upBtn = document.createElement("button");
      upBtn.textContent = "↑";
      upBtn.addEventListener("click", () => {
        if (idx === 0) return;
        const temp = items.items[idx];
        items.items[idx] = items.items[idx - 1];
        items.items[idx - 1] = temp;
        save();
        paint();
      });

      const downBtn = document.createElement("button");
      downBtn.textContent = "↓";
      downBtn.addEventListener("click", () => {
        if (idx >= items.items.length - 1) return;
        const temp = items.items[idx];
        items.items[idx] = items.items[idx + 1];
        items.items[idx + 1] = temp;
        save();
        paint();
      });

      const num = document.createElement("span");
      num.className = "num";
      num.textContent = `${idx + 1}.`;

      const input = document.createElement("input");
      input.type = "text";
      input.value = it.label;
      input.addEventListener("change", () => {
        it.label = input.value;
        save();
      });

      const macrosBtn = document.createElement("button");
      macrosBtn.className = `macros-chip ${it.macros ? "on" : ""}`;
      macrosBtn.textContent = "macros";
      macrosBtn.title = "Toggle macro tracking";
      macrosBtn.addEventListener("click", () => {
        it.macros = !it.macros;
        save();
        paint();
      });

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.title = "Delete";
      delBtn.addEventListener("click", () => {
        items.items.splice(idx, 1);
        save();
        paint();
      });

      row.appendChild(upBtn);
      row.appendChild(downBtn);
      row.appendChild(num);
      row.appendChild(input);
      row.appendChild(macrosBtn);
      row.appendChild(delBtn);
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // Add item section
    if (addingItem) {
      const addForm = document.createElement("div");
      addForm.style.cssText = "display:flex; gap:8px; margin-top:12px; align-items:center;";
      const addInput = document.createElement("input");
      addInput.type = "text";
      addInput.placeholder = "New item label";
      addInput.style.cssText = "flex:1; padding:8px; border:1px solid var(--line); border-radius:8px; font:inherit;";
      addInput.id = "new-item-input";
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Add";
      saveBtn.style.cssText = "padding:8px 14px; border-radius:8px; border:0; background:var(--fg); color:white; font:inherit; font-weight:600; cursor:pointer;";
      saveBtn.addEventListener("click", () => {
        const label = addInput.value.trim();
        if (!label) return;
        items.items.push({ id: uniqueId(items, slugify(label)), label, order: nextOrder(items) });
        addingItem = false;
        save();
        paint();
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.cssText = "padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:white; font:inherit; cursor:pointer;";
      cancelBtn.addEventListener("click", () => { addingItem = false; paint(); });
      addForm.appendChild(addInput);
      addForm.appendChild(saveBtn);
      addForm.appendChild(cancelBtn);
      wrap.appendChild(addForm);
    } else {
      const addBtn = document.createElement("button");
      addBtn.className = "add";
      addBtn.textContent = "+ add item";
      addBtn.addEventListener("click", () => { addingItem = true; paint(); setTimeout(() => { const inp = document.getElementById("new-item-input"); if (inp) inp.focus(); }, 50); });
      wrap.appendChild(addBtn);
    }

    const goalsBtn = document.createElement("button");
    goalsBtn.className = "reset";
    goalsBtn.textContent = "Edit goals →";
    goalsBtn.addEventListener("click", () => onChange(items, "goals"));
    wrap.appendChild(goalsBtn);

    const mealBtn = document.createElement("button");
    mealBtn.className = "reset";
    mealBtn.textContent = "Meal defaults →";
    mealBtn.addEventListener("click", () => onChange(items, "meal-defaults"));
    wrap.appendChild(mealBtn);

    const resetBtn = document.createElement("button");
    resetBtn.className = "reset";
    resetBtn.textContent = "Reset to defaults";
    resetBtn.addEventListener("click", () => {
      const fresh = defaultItems();
      items.items = fresh.items;
      save();
      paint();
    });
    wrap.appendChild(resetBtn);

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "reset";
    restoreBtn.textContent = "Restore from backup";
    restoreBtn.addEventListener("click", async () => {
      if (!backup) { alert("Backup storage unavailable."); return; }
      let snap = null;
      try { snap = await backup.restore(); } catch { alert("Backup unavailable."); return; }
      if (!snap) { alert("No backup found."); return; }
      try {
        const { mergeKeepingToday } = await import("./backup.js");
        const { todayKey } = await import("./entry.js");
        const merged = mergeKeepingToday(snap.data, storage.exportAll(), todayKey());
        storage.saveItems(merged.items);
        storage.replaceEntries(merged.entries);
        storage.saveActiveFast(merged.activeFast);
        alert("Restore complete.");
        onChange(items, "back");
      } catch (e) { alert("Restore failed: " + e.message); }
    });
    wrap.appendChild(restoreBtn);

    const importBtn = document.createElement("button");
    importBtn.className = "reset";
    importBtn.textContent = "Import file";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { alert("Not valid JSON."); return; }
        const { mergeKeepingToday, validateImport } = await import("./backup.js");
        const { todayKey } = await import("./entry.js");
        try { validateImport(parsed); } catch (e) { alert(e.message); return; }
        const merged = mergeKeepingToday(parsed, storage.exportAll(), todayKey());
        storage.saveItems(merged.items);
        storage.replaceEntries(merged.entries);
        storage.saveActiveFast(merged.activeFast);
        alert("Import complete.");
        onChange(items, "back");
      } catch (e) { alert("Import failed: " + e.message); }
      finally { fileInput.value = ""; }
    });
    importBtn.addEventListener("click", () => fileInput.click());
    wrap.appendChild(importBtn);
    wrap.appendChild(fileInput);

    root.appendChild(wrap);
  }

  paint();
}
