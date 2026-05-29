import { Storage } from "./storage.js";
import { Backup } from "./backup.js";
import { ensureItems, ICONS } from "./items.js";
import { loadGoals, loadMealDefaults } from "./goals.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";
import { renderSettings, renderGoals, renderMealDefaults } from "./settings.js";
import { renderHistory } from "./history.js";
import { loadFoods } from "./foods.js";

// Expose helpers used by history.js timeline view (so it can compute past-day scores)
// Set lazily after the helper functions are defined below.
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

const backup = Backup();
const storage = Storage(localStorage, backup);
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") backup.flush();
});
const items = ensureItems(storage);
let goals = loadGoals(storage);
let mealDefaults = loadMealDefaults(storage);
function refreshGoals() { goals = loadGoals(storage); mealDefaults = loadMealDefaults(storage); }

const date = todayKey();
const existing = storage.getEntry(date);
const baseExtras = { waterOz: 0, steps: 0, snacks: [], completedFasts: [], fastGoalHours: DEFAULT_FAST_GOAL_HOURS };
const entry = existing
  ? { ...baseExtras, ...mergeIntoEntry(existing, items) }
  : { ...blankEntry(date, items), ...baseExtras };

// Home page can view past dates; viewDate === date means "today" (live entry).
let viewDate = date;
function getViewEntry() {
  if (viewDate === date) return entry;
  const stored = storage.getEntry(viewDate);
  if (!stored) return { ...blankEntry(viewDate, items), ...baseExtras };
  return { ...baseExtras, ...mergeIntoEntry(stored, items) };
}
function isViewingToday() { return viewDate === date; }
function shiftViewDate(deltaDays) {
  const [y, m, d] = viewDate.split("-").map(Number);
  const next = new Date(y, m - 1, d + deltaDays);
  const ymd = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
  if (ymd > date) return; // never go beyond today
  viewDate = ymd;
  show();
}
// Ensure snacks is always an array (in case old entries have snacks: null)
if (!Array.isArray(entry.snacks)) entry.snacks = [];
if (!Array.isArray(entry.completedFasts)) entry.completedFasts = [];

// === ACTIVE FAST migration: was stored per-day, now stored globally ===
// If today's entry (or any prior loaded entry) still has legacy fastStartedAt set,
// migrate it to the global active-fast slot. If both per-entry and global exist,
// global wins (we already migrated).
let activeFast = storage.getActiveFast();
if (!activeFast) {
  // Check today's entry first
  if (entry.fastStartedAt && !entry.fastEndedAt) {
    activeFast = { startedAt: entry.fastStartedAt };
    storage.saveActiveFast(activeFast);
  } else {
    // Walk all stored entries; if any has an unfinished fast, lift it.
    const allEntries = storage.getAllEntries();
    for (const d of Object.keys(allEntries)) {
      const en = allEntries[d];
      if (en.fastStartedAt && !en.fastEndedAt) {
        activeFast = { startedAt: en.fastStartedAt };
        storage.saveActiveFast(activeFast);
        // Clean it off that entry to avoid re-migration
        delete en.fastStartedAt;
        delete en.fastEndedAt;
        storage.saveEntry(d, en);
        break;
      }
    }
  }
}
// Always remove legacy fields from in-memory today's entry
delete entry.fastStartedAt;
delete entry.fastEndedAt;

let lastWaterDelta = 0;
let snackFormOpen = false;
let fastEditOpen = false;
let fastEndEditOpen = false;
let stepsEditOpen = false;
let pickerOpenFor = null; // item id whose food picker is open
let pickerQuantities = {}; // { foodId: quantity } for the open picker
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

function shortDate(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${days[dt.getDay()]} ${months[dt.getMonth()]} ${dt.getDate()}`;
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
function rerender() {
  if (view === "tracking") renderTracking();
  else renderToday();
}
// Format a Date as YYYY-MM-DD in local time.
function ymd(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function startFast() {
  // Active fast lives globally, NOT on a per-day entry. Default start = now.
  activeFast = { startedAt: new Date().toISOString() };
  storage.saveActiveFast(activeFast);
  fastEditOpen = true;
  rerender();
}
function setFastStart(localStr) {
  // Edits start of the ACTIVE fast (global) OR the last completed fast on today's entry.
  if (!localStr) return;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return;
  if (activeFast) {
    activeFast.startedAt = d.toISOString();
    storage.saveActiveFast(activeFast);
  } else if ((entry.completedFasts ?? []).length > 0) {
    const last = entry.completedFasts[entry.completedFasts.length - 1];
    if (d.getTime() <= new Date(last.endedAt).getTime()) {
      last.startedAt = d.toISOString();
      persist();
    }
  }
  fastEditOpen = false;
  rerender();
}
function endFast() {
  if (!activeFast) return;
  endFastAt(new Date());
  rerender();
}
function endFastAt(endDate) {
  if (!activeFast) return;
  const startedAt = activeFast.startedAt;
  const endedAt = endDate.toISOString();
  // The completed fast belongs to the END day.
  const endDayKey = ymd(endDate);
  const allEntries = storage.getAllEntries();
  let endEntry = allEntries[endDayKey];
  if (!endEntry) {
    // Create a minimal entry for that day
    endEntry = blankEntry(endDayKey, items);
    Object.assign(endEntry, { ...baseExtras });
  }
  if (!Array.isArray(endEntry.completedFasts)) endEntry.completedFasts = [];
  endEntry.completedFasts.push({ startedAt, endedAt });
  endEntry.savedAt = new Date().toISOString();
  storage.saveEntry(endDayKey, endEntry);
  // If the end day is today, sync our in-memory entry too
  if (endDayKey === date) {
    if (!Array.isArray(entry.completedFasts)) entry.completedFasts = [];
    entry.completedFasts.push({ startedAt, endedAt });
  }
  activeFast = null;
  storage.saveActiveFast(null);
}
function setFastEnd(localStr) {
  // Edits the end of the last completed fast on TODAY's entry.
  if (!localStr) return;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return;
  const list = entry.completedFasts ?? [];
  if (list.length === 0) return;
  const last = list[list.length - 1];
  if (d.getTime() < new Date(last.startedAt).getTime()) return;
  last.endedAt = d.toISOString();
  fastEndEditOpen = false;
  persist();
  rerender();
}
// Total fasted hours for a given day.
// While a fast is ACTIVE: today's ring shows only this fast's elapsed time
//   (each new fast resets the timer to zero — completed fasts of the day
//   are recorded but not stacked under the active one).
// When NO fast is active: ring shows the sum of completed fasts attributed to that day.
function totalFastedHoursForEntry(e, dateKey) {
  if (dateKey === date && activeFast) {
    return Math.max(0, Date.now() - new Date(activeFast.startedAt).getTime()) / 3600000;
  }
  let ms = 0;
  for (const f of (e?.completedFasts ?? [])) {
    if (f.startedAt && f.endedAt) {
      ms += Math.max(0, new Date(f.endedAt).getTime() - new Date(f.startedAt).getTime());
    }
  }
  return ms / 3600000;
}
function totalFastedHoursToday(e = entry) {
  return totalFastedHoursForEntry(e, date);
}
function setSteps(n) {
  entry.steps = Math.max(0, Number(n) || 0);
  stepsEditOpen = false;
  persist();
  rerender();
}
function setFastGoal(h) {
  entry.fastGoalHours = Number(h) || DEFAULT_FAST_GOAL_HOURS;
  persist();
  rerender();
}

function addWater(oz) {
  entry.waterOz = (entry.waterOz ?? 0) + oz;
  lastWaterDelta = oz;
  persist();
  rerender();
}
function undoWater() {
  if (lastWaterDelta <= 0) return;
  entry.waterOz = Math.max(0, (entry.waterOz ?? 0) - lastWaterDelta);
  lastWaterDelta = 0;
  persist();
  rerender();
}

function macroTotals(e = entry) {
  let p = 0, fi = 0, fa = 0, c = 0, su = 0, kcal = 0;
  // Iterate over the entry's own items keys so historical entries (with old item ids) work too.
  for (const id of Object.keys(e?.items ?? {})) {
    const m = e.items[id]?.macros;
    if (!m) continue;
    p    += Number(m.p)    || 0;
    fi   += Number(m.fi)   || 0;
    fa   += Number(m.fa)   || 0;
    c    += Number(m.c)    || 0;
    su   += Number(m.su)   || 0;
    kcal += Number(m.kcal) || 0;
  }
  for (const sn of (e?.snacks ?? [])) {
    const m = sn.macros;
    if (!m) continue;
    p    += Number(m.p)    || 0;
    fi   += Number(m.fi)   || 0;
    fa   += Number(m.fa)   || 0;
    c    += Number(m.c)    || 0;
    su   += Number(m.su)   || 0;
    kcal += Number(m.kcal) || 0;
  }
  // Manual nutrient bar additions
  p  += Number(e?.protein_manual) || 0;
  fi += Number(e?.fiber_manual)   || 0;
  fa += Number(e?.fats_manual)    || 0;
  return { p, fi, fa, c, su, kcal };
}

function pct(value, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function startTicker() {
  if (tickerHandle) return;
  tickerHandle = setInterval(() => {
    if (!activeFast || fastEditOpen || stepsEditOpen) return;
    // Only update the fasting timer text, don't re-render the whole page
    const ftTime = document.querySelector('.ft-time');
    const ftSub = document.querySelector('.ft-sub');
    if (ftTime && ftSub) {
      const goalH = goals.fast_goal_hours ?? DEFAULT_FAST_GOAL_HOURS;
      const totalH = totalFastedHoursToday();
      const elapsedMs = totalH * 3600000;
      const eH = Math.floor(elapsedMs / 3600000);
      const eM = Math.floor((elapsedMs % 3600000) / 60000);
      const eS = Math.floor((elapsedMs % 60000) / 1000);
      ftTime.textContent = `${String(eH).padStart(2,"0")}:${String(eM).padStart(2,"0")}:${String(eS).padStart(2,"0")}`;
      const remainingMs = Math.max(0, (goalH * 3600000) - elapsedMs);
      if (remainingMs > 0) {
        const rH = Math.floor(remainingMs / 3600000);
        const rM = Math.floor((remainingMs % 3600000) / 60000);
        ftSub.textContent = `${rH}h ${String(rM).padStart(2,"0")}m remaining · ${currentFastStage(totalH).name}`;
      } else {
        ftSub.textContent = `Goal reached! · ${currentFastStage(totalH).name}`;
      }
    }
  }, 1000);
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

function computeScores(e = entry, dateKey = date) {
  // Weights (sum to 1.00)
  // Fast 10 · Water 10 · Steps 10 · Nutrients 10 (protein+fiber) ·
  // Recovery 10 · Strength 10 · Other routine items 40
  const goalH = goals.fast_goal_hours ?? DEFAULT_FAST_GOAL_HOURS;
  const fastFrac = Math.min(1, totalFastedHoursForEntry(e, dateKey) / goalH);

  const w = e?.waterOz ?? 0;
  const waterFrac = Math.min(1, w / goals.water_oz);

  const s = e?.steps ?? 0;
  const stepsFrac = Math.min(1, s / goals.steps);

  const t = macroTotals(e);
  const pFrac    = Math.min(1, t.p / goals.protein_g);
  const fiFrac   = Math.min(1, t.fi / goals.fiber_g);
  const nutFrac  = (pFrac + fiFrac) / 2;

  const recoveryDone = e?.items?.["recovery_routine"]?.checked ? 1 : 0;
  const strengthDone = e?.items?.["strength_training"]?.checked ? 1 : 0;

  // Walks: use consolidated walksCompleted field
  const WALK_IDS = ["walk_after_breakfast", "walk_after_lunch", "walk_after_dinner"];
  const walkGoal = goals.walks_goal ?? 3;
  const walksDone = e?.walksCompleted ?? 0;
  const walksFrac = walkGoal > 0 ? Math.min(1, walksDone / walkGoal) : 0;

  // "Other" = entry's own items minus recovery, strength, and walks
  const eItems = e?.items ?? {};
  const otherIds = Object.keys(eItems).filter(id => id !== "recovery_routine" && id !== "strength_training" && !WALK_IDS.includes(id));
  const otherTotal = otherIds.length;
  const otherDone = otherIds.filter(id => eItems[id]?.checked).length;
  const otherFrac = otherTotal > 0 ? otherDone / otherTotal : 0;

  // Overall = weighted sum. When nutrients are disabled, drop the 0.10 nutrients
  // weight and rescale so the score still tops out at 100.
  const trackNut = goals.track_nutrients !== false;
  const sumWeighted =
    fastFrac * 0.10 +
    waterFrac * 0.10 +
    stepsFrac * 0.10 +
    (trackNut ? nutFrac * 0.10 : 0) +
    walksFrac * 0.10 +
    recoveryDone * 0.10 +
    strengthDone * 0.10 +
    otherFrac * 0.30;
  const totalWeight = trackNut ? 1.0 : 0.90;
  const overall = Math.round((sumWeighted / totalWeight) * 100);

  // Routine sub-score
  const routineFrac = (walksFrac * 0.10 + recoveryDone * 0.10 + strengthDone * 0.10 + otherFrac * 0.30) / 0.60;

  return {
    overall,
    fast: Math.round(fastFrac * 100),
    water: Math.round(waterFrac * 100),
    steps: Math.round(stepsFrac * 100),
    nutrients: Math.round(nutFrac * 100),
    recovery: Math.round(recoveryDone * 100),
    strength: Math.round(strengthDone * 100),
    other: Math.round(otherFrac * 100),
    routine: Math.round(routineFrac * 100),
  };
}

function scoreTagline(score) {
  if (score >= 90) return `Outstanding day. Keep it going.`;
  if (score >= 75) return `Strong progress. <strong>Almost there.</strong>`;
  if (score >= 50) return `Good momentum. Keep pushing.`;
  if (score >= 25) return `Get moving. <strong>You've got this.</strong>`;
  return `Let's start the day strong.`;
}

function paintHeroCard(root, e = entry, dateKey = date) {
  const hero = document.createElement("div");
  hero.className = "hero";

  const scores = computeScores(e, dateKey);
  const overall = scores.overall;
  const status = overall >= 75 ? "met" : overall >= 50 ? "ok" : "low";

  const scoreBlock = document.createElement("div");
  scoreBlock.className = "score-block";
  scoreBlock.innerHTML = `
    <div class="score-row">
      <span class="score-num" data-status="${status}">${overall}</span>
      <span class="score-denom">/100</span>
      <span class="score-label">Wellness Score</span>
    </div>
    <div class="score-bar"><span style="width:${Math.max(0, Math.min(100, overall))}%"></span></div>
    <div class="score-tagline">${scoreTagline(overall)}</div>
  `;
  hero.appendChild(scoreBlock);
  root.appendChild(hero);
}

function renderNutrientBars(t, interactive = true) {
  function slider(key, label, value, target, max) {
    const pct = Math.min(100, Math.round((value / target) * 100));
    const met = value >= target;
    const manualKey = key === "p" ? "protein_manual" : key === "fi" ? "fiber_manual" : "fats_manual";
    const manualVal = entry[manualKey] ?? 0;
    return `
      <div class="nb-row" data-status="${met ? 'met' : ''}">
        <div class="nb-label">${label}</div>
        <div class="nb-value">${Math.round(value)}<span class="nb-unit">/ ${target}g</span></div>
        ${interactive ? `<input type="range" class="nb-slider" data-nut-slider="${key}" min="0" max="${max}" step="1" value="${manualVal}" />` : `<div class="nb-track"><span class="nb-fill" style="width:${pct}%"></span></div>`}
      </div>
    `;
  }
  return `
    <div class="nb-title">Nutrients</div>
    ${slider("p",  "Protein", t.p,  goals.protein_g, 200)}
    ${slider("fi", "Fiber",   t.fi, goals.fiber_g,   80)}
    ${slider("fa", "Fats",    t.fa, goals.fats_g,    120)}
  `;
}

function renderStepsHorizontal(e = entry, interactive = true) {
  const s = e.steps ?? 0;
  const goal = goals.steps;
  const p = Math.min(100, Math.round((s / goal) * 100));
  const met = s >= goal;
  const display = s >= 1000 ? `${(s/1000).toFixed(1)}k` : `${s}`;
  const goalDisp = goal >= 1000 ? `${(goal/1000).toFixed(goal % 1000 === 0 ? 0 : 1)}k` : goal;

  const editHtml = (interactive && stepsEditOpen)
    ? `<div class="steps-edit"><input type="number" min="0" inputmode="numeric" id="steps-input" value="${s || ''}" placeholder="0" /><button class="ft-btn primary" id="steps-save">Save</button><button class="ft-btn ghost" id="steps-cancel">Cancel</button></div>`
    : (interactive ? `<button class="ft-btn ghost small" id="steps-emoji-edit">edit</button>` : "");

  return `
    <div class="steps-horiz ${met ? 'met' : ''}">
      <span class="steps-icon">👟</span>
      <div class="steps-body">
        <div class="steps-top">
          <span class="steps-val">${display}</span>
          <span class="steps-goal">/ ${goalDisp} steps${met ? ' ✓' : ''}</span>
          ${editHtml}
        </div>
        <div class="steps-bar"><span style="width:${p}%"></span></div>
      </div>
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
      <span class="mac-input">Cal <input type="number" min="0" inputmode="numeric" id="snack-kcal" /></span>
      <span class="mac-input">P <input type="number" min="0" inputmode="numeric" id="snack-p" /></span>
      <span class="mac-input">Fi <input type="number" min="0" inputmode="numeric" id="snack-fi" /></span>
      <span class="mac-input">Fa <input type="number" min="0" inputmode="numeric" id="snack-fa" /></span>
      <span class="mac-input">NetC <input type="number" min="0" inputmode="numeric" id="snack-c" /></span>
      <span class="mac-input">Su <input type="number" min="0" inputmode="numeric" id="snack-su" /></span>
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
      <span class="chip-mac">${Number(m.kcal)||0} kcal · P ${Number(m.p)||0} Fi ${Number(m.fi)||0} Fa ${Number(m.fa)||0} NetC ${Number(m.c)||0}${(Number(m.su)||0) > 15 ? ` <span class="sugar-flag">Su ${Number(m.su)||0}⚠</span>` : ` Su ${Number(m.su)||0}`}</span>
      <button data-snack-del="${sn.id}">✕</button>
    `;
    chipWrap.appendChild(chip);
  }
  wrap.appendChild(chipWrap);
  return wrap;
}

function renderToday() {
  const ve = getViewEntry();
  const viewing = isViewingToday();
  // Hide the redundant header on Home — the date-nav pill and score card carry this info.
  document.querySelector("header")?.classList.add("hidden");
  document.getElementById("title").textContent = "";
  document.getElementById("stat").textContent = "";

  const root = document.getElementById("app");
  root.innerHTML = "";

  // Date-nav row above hero
  const nav = document.createElement("div");
  nav.className = "date-nav";
  nav.innerHTML = `
    <button id="date-prev" class="date-arrow" aria-label="Previous day">‹</button>
    <label class="date-label-wrap">
      <span class="date-label-text">${shortDate(viewDate)}</span>
      <input type="date" id="date-picker" value="${viewDate}" max="${date}" />
    </label>
    <button id="date-next" class="date-arrow" aria-label="Next day" ${viewing ? "disabled" : ""}>›</button>
  `;
  root.appendChild(nav);

  // Fasting timer
  const fastWrap = document.createElement("section");
  fastWrap.innerHTML = renderFastingTimer(ve, viewDate, viewing);
  root.appendChild(fastWrap);

  // Water panel
  const waterWrap = document.createElement("section");
  waterWrap.className = "controls-panel";
  waterWrap.innerHTML = renderWaterPanel();
  root.appendChild(waterWrap);

  // Nutrient sliders
  if (goals.track_nutrients !== false) {
    const nutWrap = document.createElement("section");
    nutWrap.className = "nb-block";
    nutWrap.id = "macros-block";
    nutWrap.innerHTML = renderNutrientBars(macroTotals(ve), viewing);
    root.appendChild(nutWrap);
  }

  // Steps (horizontal)
  const stepsWrap = document.createElement("section");
  stepsWrap.innerHTML = renderStepsHorizontal(ve, viewing);
  root.appendChild(stepsWrap);

  // Sleep display
  const sleepH = ve.sleepHours ?? 0;
  if (sleepH > 0) {
    const sleepEl = document.createElement("div");
    sleepEl.className = "sleep-block";
    const sleepGoal = 8;
    const sleepPct = Math.min(100, Math.round((sleepH / sleepGoal) * 100));
    sleepEl.innerHTML = `
      <span class="sleep-icon">🌙</span>
      <div class="sleep-info">
        <div class="sleep-value">${sleepH}<span class="sleep-unit">h</span></div>
        <div class="sleep-target">sleep${sleepH >= 7 ? ' ✓' : sleepH >= 5 ? '' : ' — low'}</div>
      </div>
      <div class="sleep-bar"><span style="width:${sleepPct}%"></span></div>
    `;
    root.appendChild(sleepEl);
  }

  // Wellness Score card (summary at bottom)
  paintHeroCard(root, ve, viewDate);

  startTicker();
}

function bigRingSvg(p) {
  // Neutral ring stroke — status is conveyed by the TEXT color inside, not the ring.
  const r = 50;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, p / 100)));
  return `
    <svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="#e8e3d8" stroke-width="9" />
      <circle cx="60" cy="60" r="${r}" fill="none"
              stroke="#8a9b8a" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${c}" stroke-dashoffset="${off}"
              transform="rotate(-90 60 60)" />
    </svg>
  `;
}

function renderFastingTimer(e = entry, dateKey = date, interactive = true) {
  const goalH = goals.fast_goal_hours ?? DEFAULT_FAST_GOAL_HOURS;
  const totalH = totalFastedHoursForEntry(e, dateKey);
  const pct = Math.min(100, Math.round((totalH / goalH) * 100));
  const isFasting = interactive && !!activeFast;
  const completedCount = (e.completedFasts ?? []).length;
  const lastFast = completedCount > 0 ? e.completedFasts[completedCount - 1] : null;

  // Countdown: time REMAINING to reach goal
  const remainingMs = Math.max(0, (goalH * 3600000) - (totalH * 3600000));
  const remH = Math.floor(remainingMs / 3600000);
  const remM = Math.floor((remainingMs % 3600000) / 60000);
  const remS = Math.floor((remainingMs % 60000) / 1000);
  const countdown = `${String(remH).padStart(2,"0")}:${String(remM).padStart(2,"0")}:${String(remS).padStart(2,"0")}`;
  const goalReached = totalH >= goalH;

  // Ring SVG (compact, 56px)
  const r = 22, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, pct / 100));
  const ringColor = isFasting ? (goalReached ? "#4a9b6a" : "#5bb88a") : "#8a9b8a";
  const ringSvg = `
    <svg viewBox="0 0 56 56" class="ft-ring-svg">
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="#e8e3d8" stroke-width="5" />
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="${ringColor}" stroke-width="5"
              stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
              transform="rotate(-90 28 28)" />
    </svg>
  `;
  const icon = isFasting ? "⚡" : "🕐";
  const stateLabel = isFasting ? "FASTING" : (completedCount > 0 ? "DONE" : "EATING");

  // Fast starts at 8pm (20:00) always. After 8pm, show 00:00:00 countdown (time to start).
  const fastStartHour = 20;

  let timeDisplay, subtext;
  if (isFasting) {
    // Big number: how long you've been fasting (elapsed)
    const elapsedMs = totalH * 3600000;
    const eH = Math.floor(elapsedMs / 3600000);
    const eM = Math.floor((elapsedMs % 3600000) / 60000);
    const eS = Math.floor((elapsedMs % 60000) / 1000);
    timeDisplay = `${String(eH).padStart(2,"0")}:${String(eM).padStart(2,"0")}:${String(eS).padStart(2,"0")}`;
    // Subtext: remaining time OR goal reached
    if (goalReached) {
      subtext = `Goal reached! · ${currentFastStage(totalH).name}`;
    } else {
      const remH = Math.floor(remainingMs / 3600000);
      const remM = Math.floor((remainingMs % 3600000) / 60000);
      subtext = `${remH}h ${String(remM).padStart(2,"0")}m remaining · ${currentFastStage(totalH).name}`;
    }
  } else if (completedCount > 0) {
    timeDisplay = `${totalH.toFixed(1)}h`;
    subtext = `${completedCount} fast${completedCount === 1 ? '' : 's'} completed today`;
  } else {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    if (h >= fastStartHour) {
      timeDisplay = "00:00:00";
      subtext = "Time to start fasting!";
    } else {
      const untilMs = (fastStartHour - h) * 3600000;
      const uH = Math.floor(untilMs / 3600000);
      const uM = Math.floor((untilMs % 3600000) / 60000);
      const uS = Math.floor((untilMs % 60000) / 1000);
      timeDisplay = `${String(uH).padStart(2,"0")}:${String(uM).padStart(2,"0")}:${String(uS).padStart(2,"0")}`;
      subtext = `Eating window · fast starts 8pm`;
    }
  }

  let actions = "";
  if (!interactive) {
    actions = "";
  } else if (fastEditOpen) {
    actions = `
      <input type="datetime-local" id="fast-start-input" value="${toLocalDatetimeInput(new Date((activeFast && activeFast.startedAt) || (lastFast && lastFast.startedAt) || Date.now()))}" />
      <button class="ft-btn primary" id="fast-start-save">Save</button>
      <button class="ft-btn ghost" id="fast-edit-cancel">Cancel</button>
    `;
  } else if (fastEndEditOpen && lastFast) {
    actions = `
      <input type="datetime-local" id="fast-end-input" value="${toLocalDatetimeInput(new Date(lastFast.endedAt))}" />
      <button class="ft-btn primary" id="fast-end-save">Save</button>
      <button class="ft-btn ghost" id="fast-end-cancel">Cancel</button>
    `;
  } else if (isFasting) {
    actions = `
      <button class="ft-btn end" id="end-fast">End Fasting</button>
      <button class="ft-btn ghost small" id="fast-edit">edit</button>
    `;
  } else {
    actions = `
      <button class="ft-btn start" id="start-fast">Start Fasting</button>
      ${completedCount > 0 ? `<button class="ft-btn ghost small" id="fast-end-edit">edit</button>` : ""}
    `;
  }

  return `
    <div class="fast-timer ${isFasting ? 'active' : ''}">
      <div class="ft-ring">
        ${ringSvg}
        <div class="ft-ring-icon">${icon}</div>
        <div class="ft-ring-label">${stateLabel}</div>
      </div>
      <div class="ft-info">
        <div class="ft-time">${timeDisplay}</div>
        <div class="ft-sub">${subtext}</div>
        <div class="ft-actions">${actions}</div>
      </div>
    </div>
  `;
}

function renderStepsRing(e = entry, interactive = true) {
  const s = e.steps ?? 0;
  const goal = goals.steps;
  const p = Math.min(100, Math.round((s / goal) * 100));
  const status = s >= goal ? "met" : "unmet";
  const display = s >= 1000 ? `${(s/1000).toFixed(1)}` : `${s}`;
  const unit = s >= 1000 ? "k" : "";

  const centerHtml = (interactive && stepsEditOpen)
    ? `<input type="number" min="0" inputmode="numeric" id="steps-input" value="${s || ''}" placeholder="0" autofocus />`
    : `<div class="ring-center-num" data-status="${status}">${display}<span class="ring-unit">${unit}</span></div>
       <div class="ring-center-goal">/ ${goal >= 1000 ? (goal/1000).toFixed(goal % 1000 === 0 ? 0 : 1) + "k" : goal}</div>`;

  const actions = !interactive ? "" : (stepsEditOpen
    ? `<button class="primary" id="steps-save">Save</button>
       <button class="ghost" id="steps-cancel">Cancel</button>`
    : `<button class="ghost small" id="steps-emoji-edit">edit</button>`);

  return `
    <div class="big-ring-card" data-status="${status}">
      <div class="big-ring-emoji">👟</div>
      <div class="big-ring">
        ${bigRingSvg(p)}
        <div class="big-ring-center">${centerHtml}</div>
      </div>
      <div class="big-ring-label">Steps</div>
      <div class="big-ring-sub">${p}% of goal</div>
      <div class="big-ring-actions">${actions}</div>
    </div>
  `;
}

function renderControlsPanel(e = entry, dateKey = date, interactive = true) {
  return `
    ${renderFastingTimer(e, dateKey, interactive)}
    <div class="rings-pair" style="margin-top:12px">
      ${renderStepsRing(e, interactive)}
    </div>
  `;
}

function renderWaterPanel() {
  const w = entry.waterOz ?? 0;
  const wGoal = goals.water_oz;
  const wpct = Math.min(100, Math.round((w / wGoal) * 100));
  return `
    <div class="ctrl-row water">
      <div class="ctrl-icon">💧</div>
      <div class="ctrl-body">
        <div class="ctrl-line">
          <span class="ctrl-label">Water</span>
          <span class="ctrl-time">${w} <span class="ctrl-sub">/ ${wGoal} oz · ${wpct}%${w >= wGoal ? ' ✓' : ''}</span></span>
        </div>
        <div class="ctrl-bar"><span style="width:${wpct}%"></span></div>
        <div class="ctrl-actions">
          <button data-water="8">+8 oz</button>
          <button data-water="16">+16 oz</button>
          ${lastWaterDelta > 0 ? `<a class="undo" id="water-undo">undo</a>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderFoodPicker(itemId) {
  let foods;
  try { foods = loadFoods(); } catch (e) { return `<div style="color:red;font-size:12px">Food library error: ${e.message}</div>`; }
  const qtys = pickerQuantities;
  let rows = "";
  for (const f of foods) {
    const q = qtys[f.id] ?? 0;
    rows += `
      <div class="fp-row" data-food-id="${f.id}">
        <div class="fp-info">
          <div class="fp-name">${f.label}</div>
          <div class="fp-macros">${f.kcal} cal · P${f.p} Fi${f.fi} Fa${f.fa} C${f.c}</div>
        </div>
        <div class="fp-stepper">
          <button class="fp-minus" data-food-id="${f.id}" ${q === 0 ? "disabled" : ""}>−</button>
          <span class="fp-qty">${q}</span>
          <button class="fp-plus" data-food-id="${f.id}">+</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="food-picker" data-picker-for="${itemId}">
      <div class="fp-header">
        <span>Pick foods</span>
        <button class="fp-done" data-picker-done="${itemId}">Done</button>
      </div>
      <div class="fp-list">${rows}</div>
    </div>
  `;
}

function applyFoodPicker(itemId) {
  const foods = loadFoods();
  const qtys = pickerQuantities;
  let kcal = 0, p = 0, fi = 0, fa = 0, c = 0, su = 0;
  for (const f of foods) {
    const q = qtys[f.id] ?? 0;
    if (q <= 0) continue;
    kcal += f.kcal * q;
    p    += f.p * q;
    fi   += f.fi * q;
    fa   += f.fa * q;
    c    += f.c * q;
    su   += f.su * q;
  }
  if (!entry.items[itemId]) {
    const it = items.items.find(x => x.id === itemId);
    entry.items[itemId] = { label: it?.label ?? itemId, checked: false, comment: "" };
  }
  const existing = entry.items[itemId].macros ?? { kcal: 0, p: 0, fi: 0, fa: 0, c: 0, su: 0 };
  entry.items[itemId].macros = {
    kcal: Math.round((Number(existing.kcal) || 0) + kcal),
    p:    Math.round(((Number(existing.p) || 0) + p) * 10) / 10,
    fi:   Math.round(((Number(existing.fi) || 0) + fi) * 10) / 10,
    fa:   Math.round(((Number(existing.fa) || 0) + fa) * 10) / 10,
    c:    Math.round(((Number(existing.c) || 0) + c) * 10) / 10,
    su:   Math.round(((Number(existing.su) || 0) + su) * 10) / 10,
  };
  pickerOpenFor = null;
  pickerQuantities = {};
  persist();
  rerender();
}

function renderTracking() {
  document.querySelector("header")?.classList.add("hidden");
  document.getElementById("title").textContent = "";
  document.getElementById("stat").textContent = "";

  const root = document.getElementById("app");
  root.innerHTML = "";

  // Date navigation
  const nav = document.createElement("div");
  nav.className = "date-nav";
  nav.innerHTML = `
    <button id="date-prev" class="date-arrow" aria-label="Previous day">‹</button>
    <label class="date-label-wrap">
      <span class="date-label-text">${shortDate(viewDate)}</span>
      <input type="date" id="date-picker" value="${viewDate}" max="${date}" />
    </label>
    <button id="date-next" class="date-arrow" aria-label="Next day" ${isViewingToday() ? "disabled" : ""}>›</button>
  `;
  root.appendChild(nav);

  const sec = document.createElement("section");
  sec.className = "ordered";
  const WALK_IDS = ["walk_after_breakfast", "walk_after_lunch", "walk_after_dinner"];
  const flat = [...items.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const nonWalkItems = flat.filter(it => !WALK_IDS.includes(it.id));
  let rowNum = 0;
  let walksInserted = false;

  flat.forEach((it) => {
    // Skip individual walk items — they're consolidated below
    if (WALK_IDS.includes(it.id)) {
      // Insert the walks row once, after the first walk's natural position
      if (!walksInserted) {
        walksInserted = true;
        rowNum++;
        const walkGoal = goals.walks_goal ?? 3;
        const walksDone = entry.walksCompleted ?? 0;
        const walkRow = document.createElement("div");
        walkRow.className = "row walks-row";
        walkRow.dataset.id = "walks_consolidated";
        walkRow.innerHTML = `
          <span class="glyph">🚶</span>
          <div class="num">${rowNum}.</div>
          <div class="label">
            Post-Meal Walks
            <div class="walk-chips">
              ${Array.from({length: walkGoal}, (_, i) => {
                const n = i + 1;
                const active = n <= walksDone;
                return `<button class="walk-chip ${active ? 'active' : ''}" data-walk-n="${n}">${n}</button>`;
              }).join("")}
              <span class="walk-count">${walksDone} of ${walkGoal}</span>
            </div>
          </div>
        `;
        sec.appendChild(walkRow);
      }
      return;
    }

    rowNum++;
    const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = it.id;
    row.dataset.checked = String(cell.checked);
    const m = cell.macros ?? { p: "", fi: "", fa: "", c: "", su: "", kcal: "" };
    const glyph = ICONS[it.id] ?? "·";
    row.innerHTML = `
      <input type="checkbox" ${cell.checked ? "checked" : ""} />
      <span class="glyph">${glyph}</span>
      <div class="num">${rowNum}.</div>
      <div class="label">
        ${it.label}
        ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
        ${(!cell.checked && cell.comment) ? `<textarea>${escapeAttr(cell.comment)}</textarea>` : ""}
        ${it.macros && goals.track_nutrients !== false ? `
          <div class="macros">
            <button class="food-pick-btn" data-pick-for="${it.id}">📋</button>
            <label>Cal <input type="number" min="0" inputmode="numeric" data-mac="kcal" value="${m.kcal ?? ""}"></label>
            <label>P <input type="number" min="0" inputmode="numeric" data-mac="p"  value="${m.p ?? ""}"></label>
            <label>Fi <input type="number" min="0" inputmode="numeric" data-mac="fi" value="${m.fi ?? ""}"></label>
            <label>Fa <input type="number" min="0" inputmode="numeric" data-mac="fa" value="${m.fa ?? ""}"></label>
            <label>NetC <input type="number" min="0" inputmode="numeric" data-mac="c"  value="${m.c ?? ""}"></label>
            <label class="${(Number(m.su)||0) > 15 ? 'sugar-warn' : ''}">Su <input type="number" min="0" inputmode="numeric" data-mac="su" value="${m.su ?? ""}"></label>
          </div>
          ${pickerOpenFor === it.id ? renderFoodPicker(it.id) : ""}
        ` : ""}
      </div>
    `;
    sec.appendChild(row);
  });

  // Snack rows — appended after routine, styled like routine rows
  const snacks = entry.snacks ?? [];
  let nextNum = flat.length + 1;
  for (const sn of snacks) {
    const m = sn.macros ?? {};
    const row = document.createElement("div");
    row.className = "row snack-row";
    row.dataset.snackId = sn.id;
    row.dataset.checked = "true";
    row.innerHTML = `
      <input type="checkbox" checked disabled />
      <span class="glyph">🍿</span>
      <div class="num">${nextNum++}.</div>
      <div class="label">
        ${escapeAttr(sn.label || "(snack)")}
        <button class="snack-del" data-snack-del="${sn.id}" title="Remove snack">✕</button>
        ${goals.track_nutrients !== false ? `
        <div class="macros">
          <label>Cal <input type="number" min="0" inputmode="numeric" data-snack-mac="kcal" data-snack-id="${sn.id}" value="${m.kcal ?? ""}"></label>
          <label>P <input type="number" min="0" inputmode="numeric" data-snack-mac="p"  data-snack-id="${sn.id}" value="${m.p ?? ""}"></label>
          <label>Fi <input type="number" min="0" inputmode="numeric" data-snack-mac="fi" data-snack-id="${sn.id}" value="${m.fi ?? ""}"></label>
          <label>Fa <input type="number" min="0" inputmode="numeric" data-snack-mac="fa" data-snack-id="${sn.id}" value="${m.fa ?? ""}"></label>
          <label>NetC <input type="number" min="0" inputmode="numeric" data-snack-mac="c"  data-snack-id="${sn.id}" value="${m.c ?? ""}"></label>
          <label class="${(Number(m.su)||0) > 15 ? 'sugar-warn' : ''}">Su <input type="number" min="0" inputmode="numeric" data-snack-mac="su" data-snack-id="${sn.id}" value="${m.su ?? ""}"></label>
        </div>
        ` : ""}
      </div>
    `;
    sec.appendChild(row);
  }

  // Add-snack form / button as the last row
  const addRow = document.createElement("div");
  addRow.className = "row snack-add-row";
  if (snackFormOpen) {
    addRow.innerHTML = `
      <span class="glyph">🍿</span>
      <div class="num">${nextNum}.</div>
      <div class="label">
        <input type="text" id="snack-label" placeholder="what I ate" class="snack-label-input" />
        ${goals.track_nutrients !== false ? `
        <div class="macros">
          <label>Cal <input type="number" min="0" inputmode="numeric" id="snack-kcal" /></label>
          <label>P <input type="number" min="0" inputmode="numeric" id="snack-p" /></label>
          <label>Fi <input type="number" min="0" inputmode="numeric" id="snack-fi" /></label>
          <label>Fa <input type="number" min="0" inputmode="numeric" id="snack-fa" /></label>
          <label>NetC <input type="number" min="0" inputmode="numeric" id="snack-c" /></label>
          <label>Su <input type="number" min="0" inputmode="numeric" id="snack-su" /></label>
        </div>
        ` : ""}
        <div class="snack-form-actions">
          <button id="snack-save" class="snack-save-btn">Save</button>
          <button id="snack-toggle" class="snack-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
  } else {
    addRow.innerHTML = `
      <button id="snack-toggle" class="snack-add-btn">+ Add snack</button>
    `;
  }
  sec.appendChild(addRow);

  root.appendChild(sec);

  startTicker();
}

document.addEventListener("change", (ev) => {
  if (ev.target.id === "date-picker") {
    const v = ev.target.value;
    if (v && v <= date) { viewDate = v; show(); }
    return;
  }
  if (ev.target.matches('.row input[type="checkbox"]')) {
    const id = ev.target.closest(".row").dataset.id;
    if (!entry.items[id]) {
      const it = items.items.find(x => x.id === id);
      entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
    }
    const wasChecked = entry.items[id].checked;
    entry.items[id].checked = ev.target.checked;
    // Auto-fill macros from defaults on first check, when nutrients tracked
    if (!wasChecked && ev.target.checked && goals.track_nutrients !== false) {
      const itemDef = items.items.find(x => x.id === id);
      if (itemDef?.macros && mealDefaults[id]) {
        const cur = entry.items[id].macros;
        const isEmpty = !cur || Object.values(cur).every(v => !Number(v));
        if (isEmpty) entry.items[id].macros = { ...mealDefaults[id] };
      }
    }
    if (id === "breakfast" && ev.target.checked && activeFast) {
      endFastAt(new Date());
    }
    persist();
    rerender();
    return;
  }
  if (ev.target.id === "fast-goal-select") {
    setFastGoal(ev.target.value);
    return;
  }
});

document.addEventListener("click", (ev) => {
  // Food picker interactions
  if (ev.target.matches('.food-pick-btn[data-pick-for]')) {
    ev.preventDefault();
    ev.stopPropagation();
    const id = ev.target.dataset.pickFor;
    if (pickerOpenFor === id) { pickerOpenFor = null; } else { pickerOpenFor = id; pickerQuantities = {}; }
    renderTracking();
    const picker = document.querySelector('.food-picker');
    if (picker) picker.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (ev.target.matches('.fp-plus[data-food-id]')) {
    ev.stopPropagation();
    const fid = ev.target.dataset.foodId;
    pickerQuantities[fid] = (pickerQuantities[fid] ?? 0) + 1;
    renderTracking();
    return;
  }
  if (ev.target.matches('.fp-minus[data-food-id]')) {
    ev.stopPropagation();
    const fid = ev.target.dataset.foodId;
    pickerQuantities[fid] = Math.max(0, (pickerQuantities[fid] ?? 0) - 1);
    renderTracking();
    return;
  }
  if (ev.target.matches('.fp-done[data-picker-done]')) {
    ev.stopPropagation();
    applyFoodPicker(ev.target.dataset.pickerDone);
    return;
  }
  if (ev.target.id === "date-prev") { shiftViewDate(-1); return; }
  if (ev.target.id === "date-next") { shiftViewDate(1); return; }
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
  if (ev.target.id === "steps-emoji-edit") { stepsEditOpen = true; rerender(); return; }
  if (ev.target.id === "steps-save") {
    const v = document.getElementById("steps-input")?.value;
    setSteps(v);
    return;
  }
  if (ev.target.id === "steps-cancel") { stepsEditOpen = false; rerender(); return; }
  if (ev.target.id === "fast-edit")  { fastEditOpen = true; fastEndEditOpen = false; rerender(); return; }
  if (ev.target.id === "fast-edit-cancel") { fastEditOpen = false; rerender(); return; }
  if (ev.target.id === "fast-start-save") {
    const v = document.getElementById("fast-start-input")?.value;
    if (v) setFastStart(v);
    return;
  }
  if (ev.target.id === "fast-end-edit")   { fastEndEditOpen = true; fastEditOpen = false; rerender(); return; }
  if (ev.target.id === "fast-end-cancel") { fastEndEditOpen = false; rerender(); return; }
  if (ev.target.id === "fast-end-save") {
    const v = document.getElementById("fast-end-input")?.value;
    if (v) setFastEnd(v);
    return;
  }
  if (ev.target.matches('.nb-btn[data-nut-key]')) {
    const key = ev.target.dataset.nutKey;
    const delta = Number(ev.target.dataset.nutDelta);
    const macKey = key === "p" ? "protein_manual" : key === "fi" ? "fiber_manual" : "fats_manual";
    entry[macKey] = Math.max(0, (entry[macKey] ?? 0) + delta);
    persist();
    rerender();
    return;
  }
  if (ev.target.matches('.walk-chip[data-walk-n]')) {
    const n = Number(ev.target.dataset.walkN);
    entry.walksCompleted = (entry.walksCompleted === n) ? n - 1 : n;
    persist();
    rerender();
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
    rerender();
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
      su: Number(document.getElementById("snack-su")?.value) || 0,
      kcal: Number(document.getElementById("snack-kcal")?.value) || 0,
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
    rerender();
    return;
  }
  if (ev.target.matches('[data-snack-del]')) {
    const id = ev.target.dataset.snackDel;
    entry.snacks = (entry.snacks ?? []).filter(s => s.id !== id);
    persist();
    rerender();
    return;
  }
});

const typingTimers = {};
function refreshMacrosBlock() {
  if (view === "main") {
    renderToday();
  } else if (view === "tracking") {
    const block = document.getElementById("macros-block");
    if (block) block.innerHTML = renderNutrientBars(macroTotals());
  }
}
document.addEventListener("input", (ev) => {
  if (ev.target.matches('.nb-slider[data-nut-slider]')) {
    const key = ev.target.dataset.nutSlider;
    const val = Number(ev.target.value) || 0;
    const macKey = key === "p" ? "protein_manual" : key === "fi" ? "fiber_manual" : "fats_manual";
    entry[macKey] = val;
    persist();
    const block = document.getElementById("macros-block");
    if (block) {
      const valEl = ev.target.closest(".nb-row")?.querySelector(".nb-value");
      if (valEl) {
        const t = macroTotals();
        const total = key === "p" ? t.p : key === "fi" ? t.fi : t.fa;
        const target = key === "p" ? goals.protein_g : key === "fi" ? goals.fiber_g : goals.fats_g;
        valEl.innerHTML = `${Math.round(total)}<span class="nb-unit">/ ${target}g</span>`;
      }
    }
    return;
  }
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
  } else if (ev.target.matches('input[data-snack-mac]')) {
    const snackId = ev.target.dataset.snackId;
    const key = ev.target.dataset.snackMac;
    const val = Number(ev.target.value) || 0;
    const tkey = `snack:${snackId}:${key}`;
    clearTimeout(typingTimers[tkey]);
    typingTimers[tkey] = setTimeout(() => {
      const sn = (entry.snacks ?? []).find(s => s.id === snackId);
      if (!sn) return;
      sn.macros = { ...(sn.macros ?? { p: 0, fi: 0, fa: 0, c: 0, su: 0, kcal: 0 }), [key]: val };
      persist();
      refreshMacrosBlock();
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
      entry.items[id].macros = { ...(entry.items[id].macros ?? { p: 0, fi: 0, fa: 0, c: 0, su: 0, kcal: 0 }), [key]: val };
      persist();
      refreshMacrosBlock();
    }, 250);
  }
});

function show() {
  const root = document.getElementById("app");
  document.querySelector("header")?.classList.remove("hidden");
  if (view === "goals") {
    document.getElementById("title").textContent = "Edit goals";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderGoals(root, storage, () => { refreshGoals(); view = "settings"; show(); });
  } else if (view === "meal-defaults") {
    document.getElementById("title").textContent = "Meal defaults";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderMealDefaults(root, storage, items, () => { refreshGoals(); view = "settings"; show(); });
  } else if (view === "settings") {
    document.getElementById("title").textContent = "Edit checklist";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderSettings(root, storage, items, (newItems, action) => {
      if (action === "back") { view = "main"; show(); return; }
      if (action === "goals") { view = "goals"; show(); return; }
      if (action === "meal-defaults") { view = "meal-defaults"; show(); return; }
      const merged = mergeIntoEntry(entry, items);
      Object.assign(entry, merged);
      persist();
    }, backup);
  } else if (view === "timeline") {
    document.getElementById("title").textContent = "History";
    document.getElementById("stat").textContent = "";
    renderHistory(root, storage);
  } else if (view === "tracking") {
    renderTracking();
  } else {
    renderToday();
  }
}

document.getElementById("link-today").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = "main";
  viewDate = date;
  show();
});
document.getElementById("link-tracking").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = "tracking";
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

// Expose helpers for the Timeline page (history.js)
window.__wellness_computeScores = computeScores;
window.__wellness_macroTotals = macroTotals;
window.__wellness_totalFastedHoursToday = totalFastedHoursToday;
window.__wellness_totalFastedHoursForEntry = totalFastedHoursForEntry;
window.__wellness_goals = () => goals;

// === URL Parameter Intake (for Apple Shortcuts integration) ===
(function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.toString() === "") return;

  // Force-restore items list
  if (params.get("restore") === "1") {
    const fullItems = {"items":[
      {"id":"b12_morning","label":"Morning B12 Sublingual","order":10},
      {"id":"morning_walk_30","label":"Morning Walk: 30 mins (Fasted)","order":20},
      {"id":"breakfast","label":"Breakfast","order":30,"macros":true},
      {"id":"walk_after_breakfast","label":"Post-Meal Walk: 10–15 mins","order":40},
      {"id":"nuts","label":"Nuts","order":50,"macros":true},
      {"id":"d_k2_fishoil","label":"Supplements (Fats Soluble: Vitamin D, K2 MK7, Fish Oil) with Nuts","order":60},
      {"id":"recovery_routine","label":"Recovery Routine: 15–20 mins","order":70},
      {"id":"lunch","label":"Lunch","order":80,"macros":true},
      {"id":"walk_after_lunch","label":"Post-Meal Walk: 10–15 mins","order":90},
      {"id":"strength_training","label":"Strength Training","order":100},
      {"id":"dinner","label":"Dinner","order":110,"macros":true},
      {"id":"walk_after_dinner","label":"Post-Meal Walk: 10–15 mins","order":120},
      {"id":"collagen_coffee","label":"1 scoop Collagen in Coffee with Vitamin C","order":130},
      {"id":"magnesium_eve","label":"Evening Magnesium Glycinate","order":140}
    ]};
    storage.saveItems(fullItems);
    history.replaceState(null, "", location.pathname);
    location.reload();
    return;
  }

  let changed = false;

  const stepsParam = params.get("steps");
  if (stepsParam != null) {
    const v = Math.round(Number(stepsParam));
    if (v > 0) { entry.steps = v; changed = true; }
  }

  const sleepParam = params.get("sleep");
  if (sleepParam != null) {
    const v = parseFloat(sleepParam);
    if (v > 0) { entry.sleepHours = Math.round(v * 10) / 10; changed = true; }
  }

  const waterParam = params.get("water");
  if (waterParam != null) {
    const v = Math.round(Number(waterParam));
    if (v > 0) { entry.waterOz = (entry.waterOz ?? 0) + v; changed = true; }
  }

  const snackParam = params.get("snack");
  if (snackParam != null && snackParam.trim()) {
    const macros = {
      p:  Number(params.get("p"))  || 0,
      fi: Number(params.get("fi")) || 0,
      fa: Number(params.get("fa")) || 0,
      c:  Number(params.get("c"))  || 0,
      su: Number(params.get("su")) || 0,
      kcal: Number(params.get("kcal")) || 0,
    };
    if (!Array.isArray(entry.snacks)) entry.snacks = [];
    entry.snacks.push({ id: newSnackId(), label: snackParam.trim(), macros, createdAt: new Date().toISOString() });
    changed = true;
  }

  const fastParam = params.get("fast");
  if (fastParam === "start" && !activeFast) {
    activeFast = { startedAt: new Date().toISOString() };
    storage.saveActiveFast(activeFast);
    changed = true;
  } else if (fastParam === "end" && activeFast) {
    endFastAt(new Date());
    changed = true;
  }

  if (changed) persist();
  history.replaceState(null, "", location.pathname);
})();

show();
