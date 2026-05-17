import { Storage } from "./storage.js";
import { ensureItems, ICONS } from "./items.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";
import { renderSettings } from "./settings.js";
import { renderHistory } from "./history.js";
import { downloadExport } from "./export.js";

// Fasting goal in hours. Persisted on the entry so each day's goal is independent.
const DEFAULT_FAST_GOAL_HOURS = 14;
const FAST_GOAL_OPTIONS = [14, 16, 18, 20, 24];

const FAST_STAGES = [
  { from: 0,  to: 4,   name: "Fed",       desc: "Digesting your last meal." },
  { from: 4,  to: 12,  name: "Glycogen",  desc: "Body burning stored sugar." },
  { from: 12, to: 16,  name: "Ketosis",   desc: "Fat-burning ramping up." },
  { from: 16, to: 18,  name: "Deep Ketosis", desc: "Energy from ketones." },
  { from: 18, to: 24,  name: "Autophagy", desc: "Cellular cleanup begins." },
  { from: 24, to: Infinity, name: "Deep Autophagy", desc: "Stem cell renewal." },
];

const storage = Storage(localStorage);
const items = ensureItems(storage);

const date = todayKey();
const existing = storage.getEntry(date);
const baseExtras = { waterOz: 0, steps: 0, snacks: [], fastStartedAt: null, fastEndedAt: null, fastGoalHours: DEFAULT_FAST_GOAL_HOURS };
const entry = existing
  ? { ...baseExtras, ...mergeIntoEntry(existing, items) }
  : { ...blankEntry(date, items), ...baseExtras };
// Ensure snacks is always an array (in case old entries have snacks: null)
if (!Array.isArray(entry.snacks)) entry.snacks = [];

let lastWaterDelta = 0;
let snackFormOpen = false;
let fastEditOpen = false;
let view = "main";
let tickerHandle = null;

function currentFastStage(hours) {
  for (const s of FAST_STAGES) {
    if (hours >= s.from && hours < s.to) return s;
  }
  return FAST_STAGES[FAST_STAGES.length - 1];
}

function fmtTitle(d) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function persist() { storage.saveEntry(date, { ...entry, savedAt: new Date().toISOString() }); }

function fastDurationMs(startIso, endIso) {
  if (!startIso) return 0;
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, end - start);
}
function fmtDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2,"0")}m`;
}
// Format a Date as YYYY-MM-DDTHH:mm in LOCAL time (for <input type="datetime-local"> default value).
function toLocalDatetimeInput(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function startFast() {
  // Default to now; user can edit in the picker.
  entry.fastStartedAt = new Date().toISOString();
  entry.fastEndedAt = null;
  fastEditOpen = true;
  persist();
  renderToday();
}
function setFastStart(localStr) {
  // localStr is "YYYY-MM-DDTHH:mm" interpreted as local time.
  if (!localStr) return;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return;
  entry.fastStartedAt = d.toISOString();
  fastEditOpen = false;
  persist();
  renderToday();
}
function endFast() {
  if (entry.fastStartedAt && !entry.fastEndedAt) {
    entry.fastEndedAt = new Date().toISOString();
    persist();
    renderToday();
  }
}
function setFastGoal(h) {
  entry.fastGoalHours = Number(h) || DEFAULT_FAST_GOAL_HOURS;
  persist();
  renderToday();
}

function addWater(oz) {
  entry.waterOz = (entry.waterOz ?? 0) + oz;
  lastWaterDelta = oz;
  persist();
  renderToday();
}
function undoWater() {
  if (lastWaterDelta <= 0) return;
  entry.waterOz = Math.max(0, (entry.waterOz ?? 0) - lastWaterDelta);
  lastWaterDelta = 0;
  persist();
  renderToday();
}

function macroTotals() {
  let p = 0, fi = 0, fa = 0, c = 0;
  for (const it of items.items) {
    if (!it.macros) continue;
    const m = entry.items[it.id]?.macros;
    if (!m) continue;
    p  += Number(m.p)  || 0;
    fi += Number(m.fi) || 0;
    fa += Number(m.fa) || 0;
    c  += Number(m.c)  || 0;
  }
  return { p, fi, fa, c };
}

function pct(value, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function startTicker() {
  if (tickerHandle) return;
  tickerHandle = setInterval(() => {
    if (view === "main" && entry.fastStartedAt && !entry.fastEndedAt && !fastEditOpen) {
      // Re-render only the fast block to keep ring + time in sync
      renderToday();
    }
  }, 60_000);
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function newSnackId() {
  return Math.random().toString(36).slice(2, 10);
}

function ringSvg({ pct: p, radius = 56, stroke = 10, trackClass = "track", progClass = "progress" }) {
  const c = 2 * Math.PI * radius;
  const offset = c * (1 - Math.max(0, Math.min(1, p / 100)));
  const size = (radius + stroke) * 2;
  return `
    <svg viewBox="0 0 ${size} ${size}">
      <circle class="${trackClass}" cx="${size/2}" cy="${size/2}" r="${radius}"
              stroke-width="${stroke}" />
      <circle class="${progClass}" cx="${size/2}" cy="${size/2}" r="${radius}"
              stroke-width="${stroke}"
              stroke-dasharray="${c}"
              stroke-dashoffset="${offset}" />
    </svg>
  `;
}

function paintHeroCard(root) {
  const hero = document.createElement("div");
  hero.className = "hero";

  // Fasting block
  const fast = document.createElement("div");
  fast.className = "fast-block";
  fast.id = "fasting-pill";
  const goalH = entry.fastGoalHours ?? DEFAULT_FAST_GOAL_HOURS;
  const goalMs = goalH * 3600 * 1000;

  if (entry.fastStartedAt && !entry.fastEndedAt) {
    const ms = fastDurationMs(entry.fastStartedAt, null);
    const hours = ms / 3600000;
    const stage = currentFastStage(hours);
    const ringPct = Math.min(100, (ms / goalMs) * 100);
    const remainMs = Math.max(0, goalMs - ms);
    const isComplete = ms >= goalMs;
    const timeLabel = isComplete ? "elapsed" : "remaining";
    const timeValue = isComplete
      ? fmtDuration(ms)
      : fmtDuration(remainMs);

    fast.innerHTML = `
      <div class="fast-ring${isComplete ? " complete" : ""}">
        ${ringSvg({ pct: ringPct })}
        <div class="center">
          <span class="icon">🩸</span>
          <span class="stage">${stage.name}</span>
        </div>
      </div>
      <div class="fast-info">
        <div class="fast-time">${timeValue}</div>
        <div class="fast-time-label">${timeLabel} · ${goalH}h goal</div>
        <div class="stage-detail">${stage.desc}</div>
        <div class="fast-actions">
          ${fastEditOpen ? `
            <input type="datetime-local" id="fast-start-input" value="${toLocalDatetimeInput(new Date(entry.fastStartedAt))}" />
            <button id="fast-start-save">Save</button>
            <button class="ghost" id="fast-edit-cancel">Cancel</button>
          ` : `
            <button id="end-fast">End Fasting</button>
            <button class="ghost" id="fast-edit">edit start</button>
          `}
        </div>
      </div>
    `;
  } else if (entry.fastStartedAt && entry.fastEndedAt) {
    const ms = fastDurationMs(entry.fastStartedAt, entry.fastEndedAt);
    const ringPct = Math.min(100, (ms / goalMs) * 100);
    const stage = currentFastStage(ms / 3600000);
    fast.innerHTML = `
      <div class="fast-ring complete">
        ${ringSvg({ pct: ringPct })}
        <div class="center">
          <span class="icon">✓</span>
          <span class="stage">Done</span>
        </div>
      </div>
      <div class="fast-info">
        <div class="fast-time">${fmtDuration(ms)}</div>
        <div class="fast-time-label">fasted · reached ${stage.name}</div>
      </div>
    `;
  } else {
    fast.innerHTML = `
      <div class="fast-ring">
        ${ringSvg({ pct: 0 })}
        <div class="center">
          <span class="icon">⏱</span>
          <span class="stage">Eating</span>
        </div>
      </div>
      <div class="fast-info">
        <div class="fast-time">${goalH}h</div>
        <div class="fast-time-label">goal</div>
        <div class="fast-actions">
          <button id="start-fast">Start Fasting</button>
          <select id="fast-goal-select">
            ${FAST_GOAL_OPTIONS.map(o => `<option value="${o}" ${o === goalH ? "selected" : ""}>${o}h</option>`).join("")}
          </select>
        </div>
      </div>
    `;
  }
  hero.appendChild(fast);

  // Water block — glass + actions
  const w = entry.waterOz ?? 0;
  const wpct = Math.min(100, Math.round((w / 140) * 100));
  const water = document.createElement("div");
  water.className = "water-block";
  water.id = "water-row";
  water.innerHTML = `
    <div class="water-glass">
      <div class="outline">
        <div class="water-fill" style="height: ${wpct}%"></div>
      </div>
    </div>
    <div class="water-info">
      <div class="water-value">${w}<span style="font-size:14px;color:var(--muted);font-weight:500"> oz</span></div>
      <div class="water-target">of 140 oz · ${wpct}%${w >= 140 ? " ✓" : ""}</div>
      <div class="water-actions">
        <button data-water="8">+8 oz</button>
        <button data-water="16">+16 oz</button>
        ${lastWaterDelta > 0 ? `<a class="undo" id="water-undo">undo</a>` : ""}
      </div>
    </div>
  `;
  hero.appendChild(water);

  // Steps block (compact row)
  const s = entry.steps ?? 0;
  const spct = pct(s, 10000);
  const steps = document.createElement("div");
  steps.className = "steps-block";
  steps.id = "steps-row";
  steps.innerHTML = `
    <span class="glyph">👟</span>
    <span class="label">Steps</span>
    <input type="number" min="0" inputmode="numeric" id="steps-input" value="${s || ""}" placeholder="0" />
    <span class="target">/ 10,000</span>
    <span class="bar"><span style="width: ${spct}%"></span></span>
    <span class="sub">${spct}%${s >= 10000 ? " ✓" : ""}</span>
  `;
  hero.appendChild(steps);

  // Nutrient rings
  const t = macroTotals();
  const nut = document.createElement("div");
  nut.className = "nutrients-block";
  nut.id = "macros-block";
  nut.innerHTML = renderNutrientRings(t);
  hero.appendChild(nut);

  // Snacks block
  const snacksBlock = document.createElement("div");
  snacksBlock.className = "snacks-block";
  snacksBlock.appendChild(renderSnacksBlock());
  hero.appendChild(snacksBlock);

  root.appendChild(hero);
}

function renderNutrientRings(t) {
  function ring(key, label, value, target) {
    const p = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
    const denom = target ? `/ ${target}g` : "g";
    return `
      <div class="nutrient-ring" data-key="${key}">
        <div class="ring-wrap">
          <svg viewBox="0 0 64 64">
            <circle class="track" cx="32" cy="32" r="26" stroke-width="6" />
            <circle class="prog"  cx="32" cy="32" r="26" stroke-width="6"
                    stroke-dasharray="${2 * Math.PI * 26}"
                    stroke-dashoffset="${2 * Math.PI * 26 * (1 - p/100)}"
                    transform="rotate(-90 32 32)" />
          </svg>
          <div class="ring-center">
            <div class="num">${value}</div>
            <div class="denom">${denom}</div>
          </div>
        </div>
        <div class="label">${label}</div>
      </div>
    `;
  }
  return `
    <div class="nutrients-title">Today's Nutrients</div>
    <div class="nutrient-rings">
      ${ring("p",  "Protein", t.p,  125)}
      ${ring("fi", "Fiber",   t.fi, 35)}
      ${ring("fa", "Fats",    t.fa, 0)}
      ${ring("c",  "Carbs",   t.c,  130)}
    </div>
  `;
}

function renderMacrosBlock(t) {
  return `
    <div class="macros-title">Today's macros</div>
    <div class="pill-row">
      <span class="name">Protein</span>
      <span class="bar"><span style="width: ${pct(t.p, 125)}%"></span></span>
      <span class="val">${t.p} / 125g</span>
    </div>
    <div class="pill-row">
      <span class="name">Fiber</span>
      <span class="bar"><span style="width: ${pct(t.fi, 35)}%"></span></span>
      <span class="val">${t.fi} / 35g</span>
    </div>
    <div class="pill-row">
      <span class="name">Fats</span>
      <span class="bar" style="visibility: hidden"></span>
      <span class="val">${t.fa}g</span>
    </div>
    <div class="pill-row">
      <span class="name">Carbs</span>
      <span class="bar ${t.c > 130 ? "over" : ""}"><span style="width: ${pct(t.c, 130)}%"></span></span>
      <span class="val">${t.c} / 130g</span>
    </div>
  `;
}

function renderSnacksBlock() {
  const wrap = document.createElement("div");
  const head = document.createElement("div");
  head.className = "snacks-head";
  head.innerHTML = `
    <span class="label">Snacks</span>
    <button id="snack-toggle">${snackFormOpen ? "Cancel" : "+ Add snack"}</button>
  `;
  wrap.appendChild(head);

  if (snackFormOpen) {
    const form = document.createElement("div");
    form.className = "snack-form";
    form.innerHTML = `
      <input type="text" id="snack-label" placeholder="what I ate" />
      <span class="mac-input">P <input type="number" min="0" inputmode="numeric" id="snack-p" /></span>
      <span class="mac-input">Fi <input type="number" min="0" inputmode="numeric" id="snack-fi" /></span>
      <span class="mac-input">Fa <input type="number" min="0" inputmode="numeric" id="snack-fa" /></span>
      <span class="mac-input">C <input type="number" min="0" inputmode="numeric" id="snack-c" /></span>
      <button id="snack-save">Save</button>
    `;
    wrap.appendChild(form);
  }

  const chipWrap = document.createElement("div");
  for (const sn of (entry.snacks ?? [])) {
    const chip = document.createElement("span");
    chip.className = "snack-chip";
    const m = sn.macros ?? {};
    chip.innerHTML = `
      <span>${escapeAttr(sn.label || "(unnamed)")}</span>
      <span class="chip-mac">P ${Number(m.p)||0} Fi ${Number(m.fi)||0} Fa ${Number(m.fa)||0} C ${Number(m.c)||0}</span>
      <button data-snack-del="${sn.id}">✕</button>
    `;
    chipWrap.appendChild(chip);
  }
  wrap.appendChild(chipWrap);
  return wrap;
}

function renderToday() {
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  paintHeroCard(root);

  const sec = document.createElement("section");
  sec.className = "ordered";
  const flat = [...items.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  flat.forEach((it, idx) => {
    const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = it.id;
    row.dataset.checked = String(cell.checked);
    const m = cell.macros ?? { p: "", fi: "", fa: "", c: "" };
    const glyph = ICONS[it.id] ?? "·";
    row.innerHTML = `
      <input type="checkbox" ${cell.checked ? "checked" : ""} />
      <span class="glyph">${glyph}</span>
      <div class="num">${idx + 1}.</div>
      <div class="label">
        ${it.label}
        ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
        ${(!cell.checked && cell.comment) ? `<textarea>${escapeAttr(cell.comment)}</textarea>` : ""}
        ${it.macros ? `
          <div class="macros">
            <label>P <input type="number" min="0" inputmode="numeric" data-mac="p"  value="${m.p ?? ""}"></label>
            <label>Fi <input type="number" min="0" inputmode="numeric" data-mac="fi" value="${m.fi ?? ""}"></label>
            <label>Fa <input type="number" min="0" inputmode="numeric" data-mac="fa" value="${m.fa ?? ""}"></label>
            <label>C <input type="number" min="0" inputmode="numeric" data-mac="c"  value="${m.c ?? ""}"></label>
          </div>
        ` : ""}
      </div>
    `;
    sec.appendChild(row);
  });
  root.appendChild(sec);
  startTicker();
}

document.addEventListener("change", (ev) => {
  if (ev.target.matches('.row input[type="checkbox"]')) {
    const id = ev.target.closest(".row").dataset.id;
    if (!entry.items[id]) {
      const it = items.items.find(x => x.id === id);
      entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
    }
    entry.items[id].checked = ev.target.checked;
    if (id === "breakfast" && ev.target.checked && entry.fastStartedAt && !entry.fastEndedAt) {
      entry.fastEndedAt = new Date().toISOString();
    }
    persist();
    renderToday();
    return;
  }
  if (ev.target.id === "fast-goal-select") {
    setFastGoal(ev.target.value);
    return;
  }
});

document.addEventListener("click", (ev) => {
  if (ev.target.matches(".note-toggle")) {
    const row = ev.target.closest(".row");
    if (!row.querySelector("textarea")) {
      const ta = document.createElement("textarea");
      ta.placeholder = "what got in the way?";
      row.querySelector(".label").appendChild(ta);
      ta.focus();
    }
    return;
  }
  if (ev.target.id === "start-fast") { startFast(); return; }
  if (ev.target.id === "end-fast")   { endFast(); return; }
  if (ev.target.id === "fast-edit")  { fastEditOpen = true; renderToday(); return; }
  if (ev.target.id === "fast-edit-cancel") { fastEditOpen = false; renderToday(); return; }
  if (ev.target.id === "fast-start-save") {
    const v = document.getElementById("fast-start-input")?.value;
    if (v) setFastStart(v);
    return;
  }
  if (ev.target.matches('[data-water]')) {
    const oz = Number(ev.target.dataset.water);
    if (oz > 0) addWater(oz);
    return;
  }
  if (ev.target.id === "water-undo") { undoWater(); return; }
  if (ev.target.id === "snack-toggle") {
    snackFormOpen = !snackFormOpen;
    renderToday();
    if (snackFormOpen) {
      const inp = document.getElementById("snack-label");
      if (inp) inp.focus();
    }
    return;
  }
  if (ev.target.id === "snack-save") {
    const label = (document.getElementById("snack-label")?.value ?? "").trim();
    if (!label) {
      const inp = document.getElementById("snack-label");
      if (inp) inp.focus();
      return;
    }
    const macros = {
      p:  Number(document.getElementById("snack-p")?.value)  || 0,
      fi: Number(document.getElementById("snack-fi")?.value) || 0,
      fa: Number(document.getElementById("snack-fa")?.value) || 0,
      c:  Number(document.getElementById("snack-c")?.value)  || 0,
    };
    if (!Array.isArray(entry.snacks)) entry.snacks = [];
    entry.snacks.push({
      id: newSnackId(),
      label,
      macros,
      createdAt: new Date().toISOString(),
    });
    snackFormOpen = false;
    persist();
    renderToday();
    return;
  }
  if (ev.target.matches('[data-snack-del]')) {
    const id = ev.target.dataset.snackDel;
    entry.snacks = (entry.snacks ?? []).filter(s => s.id !== id);
    persist();
    renderToday();
    return;
  }
});

const typingTimers = {};
function refreshMacrosBlock() {
  const block = document.getElementById("macros-block");
  if (block) block.innerHTML = renderNutrientRings(macroTotals());
}
document.addEventListener("input", (ev) => {
  if (ev.target.matches(".row textarea")) {
    const id = ev.target.closest(".row").dataset.id;
    const value = ev.target.value;
    clearTimeout(typingTimers[id]);
    typingTimers[id] = setTimeout(() => {
      if (!entry.items[id]) {
        const it = items.items.find(x => x.id === id);
        entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
      }
      entry.items[id].comment = value;
      persist();
    }, 250);
  } else if (ev.target.matches('.row .macros input')) {
    const row = ev.target.closest(".row");
    const id = row.dataset.id;
    const key = ev.target.dataset.mac;
    const val = Number(ev.target.value) || 0;
    const tkey = `${id}:${key}`;
    clearTimeout(typingTimers[tkey]);
    typingTimers[tkey] = setTimeout(() => {
      if (!entry.items[id]) {
        const it = items.items.find(x => x.id === id);
        entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
      }
      entry.items[id].macros = { ...(entry.items[id].macros ?? { p: 0, fi: 0, fa: 0, c: 0 }), [key]: val };
      persist();
      refreshMacrosBlock();
    }, 250);
  } else if (ev.target.id === "steps-input") {
    const val = Math.max(0, Number(ev.target.value) || 0);
    clearTimeout(typingTimers["__steps"]);
    typingTimers["__steps"] = setTimeout(() => {
      entry.steps = val;
      persist();
      // Refresh just the steps row's value/bar/sub without full re-render
      const stepsRow = document.getElementById("steps-row");
      if (stepsRow) {
        const p = pct(val, 10000);
        const bar = stepsRow.querySelector(".bar > span");
        if (bar) bar.style.width = `${p}%`;
        const sub = stepsRow.querySelector(".sub");
        if (sub) sub.textContent = `${p}%${val >= 10000 ? " ✓" : ""}`;
      }
    }, 250);
  }
});

document.getElementById("save-btn").addEventListener("click", () => {
  persist();
  document.getElementById("save-btn").textContent = "Saved ✓";
  setTimeout(() => { document.getElementById("save-btn").textContent = "Save today"; }, 1200);
});

function show() {
  const root = document.getElementById("app");
  if (view === "settings") {
    document.getElementById("title").textContent = "Edit checklist";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderSettings(root, storage, items, (newItems, action) => {
      if (action === "back") { view = "main"; show(); return; }
      const merged = mergeIntoEntry(entry, items);
      Object.assign(entry, merged);
      persist();
    });
  } else if (view === "timeline") {
    document.getElementById("title").textContent = "Timeline";
    document.getElementById("stat").textContent = "";
    renderHistory(root, storage);
  } else {
    renderToday();
  }
}

document.getElementById("link-today").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = "main";
  show();
});
document.getElementById("link-settings").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = "settings";
  show();
});
document.getElementById("link-timeline").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = "timeline";
  show();
});
document.getElementById("link-export").addEventListener("click", (ev) => {
  ev.preventDefault();
  downloadExport(storage);
});

show();
