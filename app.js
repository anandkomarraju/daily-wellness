import { Storage } from "./storage.js";
import { Backup } from "./backup.js";
import { ensureItems, ICONS } from "./items.js";
import { loadGoals } from "./goals.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";
import { renderSettings, renderGoals } from "./settings.js";
import { renderHistory } from "./history.js";

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
function refreshGoals() { goals = loadGoals(storage); }

const date = todayKey();
const existing = storage.getEntry(date);
const baseExtras = { waterOz: 0, steps: 0, snacks: [], completedFasts: [], fastGoalHours: DEFAULT_FAST_GOAL_HOURS };
const entry = existing
  ? { ...baseExtras, ...mergeIntoEntry(existing, items) }
  : { ...blankEntry(date, items), ...baseExtras };
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
// Total fasted hours for a given day (including a still-running fast that started on/before that day).
// For TODAY: counts any still-active fast (using now() as a virtual end).
// For PAST days: counts only completed fasts whose end-day matches.
function totalFastedHoursForEntry(e, dateKey) {
  let ms = 0;
  for (const f of (e?.completedFasts ?? [])) {
    if (f.startedAt && f.endedAt) {
      ms += Math.max(0, new Date(f.endedAt).getTime() - new Date(f.startedAt).getTime());
    }
  }
  // If this is TODAY and a fast is currently active, count its elapsed time.
  if (dateKey === date && activeFast) {
    ms += Math.max(0, Date.now() - new Date(activeFast.startedAt).getTime());
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
  return { p, fi, fa, c, su, kcal };
}

function pct(value, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function startTicker() {
  if (tickerHandle) return;
  tickerHandle = setInterval(() => {
    if (activeFast && !fastEditOpen) {
      rerender();
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

function computeScores(e = entry, dateKey = date) {
  // Weights (sum to 1.00)
  // Fast 10 · Water 10 · Steps 10 · Nutrients 10 (protein+fiber) ·
  // Recovery 10 · Strength 10 · Other routine items 40
  const goalH = e?.fastGoalHours ?? DEFAULT_FAST_GOAL_HOURS;
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

  // "Other" = entry's own items minus recovery + strength
  const eItems = e?.items ?? {};
  const otherIds = Object.keys(eItems).filter(id => id !== "recovery_routine" && id !== "strength_training");
  const otherTotal = otherIds.length;
  const otherDone = otherIds.filter(id => eItems[id]?.checked).length;
  const otherFrac = otherTotal > 0 ? otherDone / otherTotal : 0;

  // Overall = weighted sum
  const overall = Math.round((
    fastFrac * 0.10 +
    waterFrac * 0.10 +
    stepsFrac * 0.10 +
    nutFrac * 0.10 +
    recoveryDone * 0.10 +
    strengthDone * 0.10 +
    otherFrac * 0.40
  ) * 100);

  // Routine sub-score combines recovery + strength + other proportionally to their weights
  // (10 + 10 + 40 = 60 → renormalize to 0..1)
  const routineFrac = (recoveryDone * 0.10 + strengthDone * 0.10 + otherFrac * 0.40) / 0.60;

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

function paintHeroCard(root) {
  const hero = document.createElement("div");
  hero.className = "hero";

  const scores = computeScores();
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

function renderNutrientRings(t) {
  // direction: "min" = green when value >= target (target/atLeast); "max" = green when value <= target (limit)
  function ring(key, label, value, target, unit = "g", direction = "min") {
    const p = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
    const denom = target ? `/ ${target}${unit}` : unit;
    const met = direction === "min" ? value >= target : value <= target;
    const status = met ? "met" : "unmet";
    return `
      <div class="nutrient-ring" data-key="${key}" data-status="${status}">
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
      ${ring("kcal","Calories",  t.kcal, goals.kcal,        "",  "min")}
      ${ring("p",   "Protein",   t.p,    goals.protein_g,   "g", "min")}
      ${ring("fi",  "Fiber",     t.fi,   goals.fiber_g,     "g", "min")}
      ${ring("fa",  "Fats",      t.fa,   goals.fats_g,      "g", "max")}
      ${ring("c",   "Net Carbs", t.c,    goals.net_carbs_g, "g", "max")}
      ${ring("su",  "Sugar",     t.su,   goals.sugar_max_g, "g", "max")}
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
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} tracked`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  paintHeroCard(root);

  // Fasting + Steps rings (moved from Tracking)
  const controls = document.createElement("section");
  controls.className = "controls-panel";
  controls.innerHTML = renderControlsPanel();
  root.appendChild(controls);

  // Nutrient rings (moved from Tracking)
  const nutWrap = document.createElement("section");
  nutWrap.className = "nutrients-block";
  nutWrap.id = "macros-block";
  nutWrap.innerHTML = renderNutrientRings(macroTotals());
  root.appendChild(nutWrap);

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

function renderFastingRing() {
  const goalH = entry.fastGoalHours ?? DEFAULT_FAST_GOAL_HOURS;
  const totalH = totalFastedHoursToday();
  const pct = Math.min(100, Math.round((totalH / goalH) * 100));
  const status = totalH >= goalH ? "met" : "unmet";
  const isFasting = !!activeFast;
  const stage = isFasting ? currentFastStage(totalH) : null;
  const completedCount = (entry.completedFasts ?? []).length;
  const lastFast = completedCount > 0 ? entry.completedFasts[completedCount - 1] : null;

  const subline = isFasting
    ? `now · ${stage.name}`
    : (completedCount > 0
        ? `${completedCount} fast${completedCount === 1 ? '' : 's'} done`
        : "not started");

  // Center: just the number — neutral ring stroke, text colored by status.
  const centerHtml = `
    <div class="ring-center-num" data-status="${status}">${totalH.toFixed(1)}<span class="ring-unit">h</span></div>
    <div class="ring-center-goal">/ ${goalH}h</div>
  `;

  let actions = "";
  if (fastEditOpen) {
    actions = `
      <input type="datetime-local" id="fast-start-input" value="${toLocalDatetimeInput(new Date((activeFast && activeFast.startedAt) || (lastFast && lastFast.startedAt) || Date.now()))}" />
      <button class="primary" id="fast-start-save">Save</button>
      <button class="ghost" id="fast-edit-cancel">Cancel</button>
    `;
  } else if (fastEndEditOpen && lastFast) {
    actions = `
      <input type="datetime-local" id="fast-end-input" value="${toLocalDatetimeInput(new Date(lastFast.endedAt))}" />
      <button class="primary" id="fast-end-save">Save</button>
      <button class="ghost" id="fast-end-cancel">Cancel</button>
    `;
  } else if (isFasting) {
    actions = `
      <button class="primary" id="end-fast">End</button>
      <button class="ghost small" id="fast-edit">edit start</button>
    `;
  } else {
    actions = `
      <button class="primary" id="start-fast">Start</button>
      <select id="fast-goal-select" class="small">
        ${FAST_GOAL_OPTIONS.map(o => `<option value="${o}" ${o === goalH ? "selected" : ""}>${o}h</option>`).join("")}
      </select>
      ${completedCount > 0 ? `<button class="ghost small" id="fast-end-edit">edit last</button>` : ""}
    `;
  }

  return `
    <div class="big-ring-card" data-status="${status}">
      <div class="big-ring-emoji">🩸</div>
      <div class="big-ring">
        ${bigRingSvg(pct)}
        <div class="big-ring-center">${centerHtml}</div>
      </div>
      <div class="big-ring-label">Fasting</div>
      <div class="big-ring-sub">${subline}</div>
      <div class="big-ring-actions">${actions}</div>
    </div>
  `;
}

function renderStepsRing() {
  const s = entry.steps ?? 0;
  const goal = goals.steps;
  const p = Math.min(100, Math.round((s / goal) * 100));
  const status = s >= goal ? "met" : "unmet";
  const display = s >= 1000 ? `${(s/1000).toFixed(1)}` : `${s}`;
  const unit = s >= 1000 ? "k" : "";

  const centerHtml = stepsEditOpen
    ? `<input type="number" min="0" inputmode="numeric" id="steps-input" value="${s || ''}" placeholder="0" autofocus />`
    : `<div class="ring-center-num" data-status="${status}">${display}<span class="ring-unit">${unit}</span></div>
       <div class="ring-center-goal">/ ${goal >= 1000 ? (goal/1000).toFixed(goal % 1000 === 0 ? 0 : 1) + "k" : goal}</div>`;

  const actions = stepsEditOpen
    ? `<button class="primary" id="steps-save">Save</button>
       <button class="ghost" id="steps-cancel">Cancel</button>`
    : `<button class="ghost small" id="steps-emoji-edit">edit</button>`;

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

function renderControlsPanel() {
  // Two big rings side-by-side at the top: Fasting + Steps
  return `
    <div class="rings-pair">
      ${renderFastingRing()}
      ${renderStepsRing()}
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

function renderTracking() {
  document.getElementById("title").textContent = "Log";
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";

  // Water panel
  const waterWrap = document.createElement("section");
  waterWrap.className = "controls-panel";
  waterWrap.innerHTML = renderWaterPanel();
  root.appendChild(waterWrap);

  const sec = document.createElement("section");
  sec.className = "ordered";
  const flat = [...items.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  flat.forEach((it, idx) => {
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
      <div class="num">${idx + 1}.</div>
      <div class="label">
        ${it.label}
        ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
        ${(!cell.checked && cell.comment) ? `<textarea>${escapeAttr(cell.comment)}</textarea>` : ""}
        ${it.macros ? `
          <div class="macros">
            <label>Cal <input type="number" min="0" inputmode="numeric" data-mac="kcal" value="${m.kcal ?? ""}"></label>
            <label>P <input type="number" min="0" inputmode="numeric" data-mac="p"  value="${m.p ?? ""}"></label>
            <label>Fi <input type="number" min="0" inputmode="numeric" data-mac="fi" value="${m.fi ?? ""}"></label>
            <label>Fa <input type="number" min="0" inputmode="numeric" data-mac="fa" value="${m.fa ?? ""}"></label>
            <label>NetC <input type="number" min="0" inputmode="numeric" data-mac="c"  value="${m.c ?? ""}"></label>
            <label class="${(Number(m.su)||0) > 15 ? 'sugar-warn' : ''}">Su <input type="number" min="0" inputmode="numeric" data-mac="su" value="${m.su ?? ""}"></label>
          </div>
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
        <div class="macros">
          <label>Cal <input type="number" min="0" inputmode="numeric" data-snack-mac="kcal" data-snack-id="${sn.id}" value="${m.kcal ?? ""}"></label>
          <label>P <input type="number" min="0" inputmode="numeric" data-snack-mac="p"  data-snack-id="${sn.id}" value="${m.p ?? ""}"></label>
          <label>Fi <input type="number" min="0" inputmode="numeric" data-snack-mac="fi" data-snack-id="${sn.id}" value="${m.fi ?? ""}"></label>
          <label>Fa <input type="number" min="0" inputmode="numeric" data-snack-mac="fa" data-snack-id="${sn.id}" value="${m.fa ?? ""}"></label>
          <label>NetC <input type="number" min="0" inputmode="numeric" data-snack-mac="c"  data-snack-id="${sn.id}" value="${m.c ?? ""}"></label>
          <label class="${(Number(m.su)||0) > 15 ? 'sugar-warn' : ''}">Su <input type="number" min="0" inputmode="numeric" data-snack-mac="su" data-snack-id="${sn.id}" value="${m.su ?? ""}"></label>
        </div>
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
        <div class="macros">
          <label>Cal <input type="number" min="0" inputmode="numeric" id="snack-kcal" /></label>
          <label>P <input type="number" min="0" inputmode="numeric" id="snack-p" /></label>
          <label>Fi <input type="number" min="0" inputmode="numeric" id="snack-fi" /></label>
          <label>Fa <input type="number" min="0" inputmode="numeric" id="snack-fa" /></label>
          <label>NetC <input type="number" min="0" inputmode="numeric" id="snack-c" /></label>
          <label>Su <input type="number" min="0" inputmode="numeric" id="snack-su" /></label>
        </div>
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
  if (ev.target.matches('.row input[type="checkbox"]')) {
    const id = ev.target.closest(".row").dataset.id;
    if (!entry.items[id]) {
      const it = items.items.find(x => x.id === id);
      entry.items[id] = { label: it?.label ?? id, checked: false, comment: "" };
    }
    entry.items[id].checked = ev.target.checked;
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
  // On Today: full re-render (score depends on macros).
  // On Tracking: just update the rings block in place — don't blow away input focus.
  if (view === "main") {
    renderToday();
  } else if (view === "tracking") {
    const block = document.getElementById("macros-block");
    if (block) block.innerHTML = renderNutrientRings(macroTotals());
  }
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
  if (view === "goals") {
    document.getElementById("title").textContent = "Edit goals";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderGoals(root, storage, () => { refreshGoals(); view = "settings"; show(); });
  } else if (view === "settings") {
    document.getElementById("title").textContent = "Edit checklist";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderSettings(root, storage, items, (newItems, action) => {
      if (action === "back") { view = "main"; show(); return; }
      if (action === "goals") { view = "goals"; show(); return; }
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

show();
