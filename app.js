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
function rerender() {
  if (view === "tracking") renderTracking();
  else renderToday();
}
function startFast() {
  // Default to now; user can edit in the picker.
  entry.fastStartedAt = new Date().toISOString();
  entry.fastEndedAt = null;
  fastEditOpen = true;
  persist();
  rerender();
}
function setFastStart(localStr) {
  // localStr is "YYYY-MM-DDTHH:mm" interpreted as local time.
  if (!localStr) return;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return;
  entry.fastStartedAt = d.toISOString();
  fastEditOpen = false;
  persist();
  rerender();
}
function endFast() {
  if (entry.fastStartedAt && !entry.fastEndedAt) {
    entry.fastEndedAt = new Date().toISOString();
    persist();
    rerender();
  }
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

function macroTotals() {
  let p = 0, fi = 0, fa = 0, c = 0, su = 0, kcal = 0;
  for (const it of items.items) {
    if (!it.macros) continue;
    const m = entry.items[it.id]?.macros;
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
    if (entry.fastStartedAt && !entry.fastEndedAt && !fastEditOpen) {
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

function computeScores() {
  // Each metric → 0..1 contribution to overall score
  const goalH = entry.fastGoalHours ?? DEFAULT_FAST_GOAL_HOURS;
  const goalMs = goalH * 3600 * 1000;
  const fastMs = entry.fastStartedAt
    ? fastDurationMs(entry.fastStartedAt, entry.fastEndedAt)
    : 0;
  const fastFrac = Math.min(1, fastMs / goalMs);

  const w = entry.waterOz ?? 0;
  const waterFrac = Math.min(1, w / 140);

  const s = entry.steps ?? 0;
  const stepsFrac = Math.min(1, s / 10000);

  const t = macroTotals();
  // Nutrient sub-score: avg of P/Fi (under-goal targets), C/Su (over-penalized), kcal (in-window)
  const pFrac    = Math.min(1, t.p / 125);
  const fiFrac   = Math.min(1, t.fi / 35);
  const cFrac    = t.c <= 90 && t.c > 0 ? 1 : (t.c === 0 ? 0 : Math.max(0, 1 - (t.c - 90) / 90));
  const suFrac   = t.su <= 40 ? Math.min(1, t.su / 40) : Math.max(0, 1 - (t.su - 40) / 40);
  // Calories: 1 at goal, drops as you go further from 1800 in either direction (10% tolerance band).
  const kcalFrac = t.kcal === 0 ? 0
    : (Math.abs(t.kcal - 1800) <= 180 ? 1
    : Math.max(0, 1 - (Math.abs(t.kcal - 1800) - 180) / 1800));
  const nutFrac = (pFrac + fiFrac + cFrac + suFrac + kcalFrac) / 5;

  const { done, total } = countDone(entry);
  const routineFrac = total > 0 ? done / total : 0;

  // Overall = weighted average
  const overall = Math.round((fastFrac * 0.25 + waterFrac * 0.20 + stepsFrac * 0.15 + nutFrac * 0.20 + routineFrac * 0.20) * 100);

  return {
    overall,
    fast: Math.round(fastFrac * 100),
    water: Math.round(waterFrac * 100),
    steps: Math.round(stepsFrac * 100),
    nutrients: Math.round(nutFrac * 100),
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
  const t = macroTotals();
  const goalH = entry.fastGoalHours ?? DEFAULT_FAST_GOAL_HOURS;
  const isFasting = entry.fastStartedAt && !entry.fastEndedAt;
  const fastMs = entry.fastStartedAt
    ? fastDurationMs(entry.fastStartedAt, entry.fastEndedAt)
    : 0;
  const stage = entry.fastStartedAt ? currentFastStage(fastMs / 3600000) : null;
  const w = entry.waterOz ?? 0;
  const s = entry.steps ?? 0;
  const { done, total } = countDone(entry);

  // === Big score ring ===
  const scoreBlock = document.createElement("div");
  scoreBlock.className = "score-block";
  const r = 95;
  const c = 2 * Math.PI * r;
  const off = c * (1 - scores.overall / 100);
  scoreBlock.innerHTML = `
    <div class="score-ring">
      <svg viewBox="0 0 220 220">
        <circle class="track" cx="110" cy="110" r="${r}" stroke-width="8" />
        <circle class="prog"  cx="110" cy="110" r="${r}" stroke-width="8"
                stroke-dasharray="${c}" stroke-dashoffset="${off}" />
      </svg>
      <div class="center">
        <div class="num">${scores.overall}</div>
        <div class="denom">Today</div>
        <div class="label">Wellness Score</div>
      </div>
    </div>
    <div class="score-tagline">${scoreTagline(scores.overall)}</div>
  `;
  hero.appendChild(scoreBlock);

  // === 5 mini progress rings (read-only, always visible) ===
  const sugarWarn = t.su > 40;

  function miniRing(key, icon, primary, secondary, frac, gradId, isWarn) {
    const r = 26;
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, frac / 100)));
    const cls = isWarn ? "mini-ring warn" : (frac >= 100 ? "mini-ring complete" : "mini-ring");
    return `
      <div class="${cls}" data-key="${key}">
        <div class="mini-wrap">
          <svg viewBox="0 0 64 64">
            <circle class="track" cx="32" cy="32" r="${r}" stroke-width="6" />
            <circle class="prog"  cx="32" cy="32" r="${r}" stroke-width="6"
                    stroke-dasharray="${c}" stroke-dashoffset="${off}"
                    stroke="url(#${gradId})"
                    transform="rotate(-90 32 32)" />
          </svg>
          <div class="mini-center">
            <div class="mini-icon">${icon}</div>
          </div>
        </div>
        <div class="mini-primary">${primary}</div>
        <div class="mini-secondary">${secondary}</div>
      </div>
    `;
  }

  const fastDisplay = isFasting
    ? fmtDuration(fastMs).replace(/^0h /, '')
    : (entry.fastStartedAt ? `${fmtDuration(fastMs).replace(/^0h /, '')} ✓` : "—");
  const fastSecondary = isFasting
    ? (stage ? stage.name : `goal ${goalH}h`)
    : (entry.fastStartedAt ? "complete" : `goal ${goalH}h`);

  const rings = document.createElement("div");
  rings.className = "mini-rings";
  rings.innerHTML = `
    ${miniRing("fast",      "🩸",  fastDisplay,                                    fastSecondary,                  scores.fast,      "grad-score")}
    ${miniRing("water",     "💧",  `${w}<span class='unit'> oz</span>`,            `of 140`,                       scores.water,     "grad-carbs")}
    ${miniRing("steps",     "👟",  s >= 1000 ? `${(s/1000).toFixed(1)}<span class='unit'>k</span>` : `${s}`, `of 10k`,       scores.steps,     "grad-fats")}
    ${miniRing("nutrients", "🍽️", `${t.kcal}<span class='unit'> cal</span>`,        sugarWarn ? "sugar over" : `of 1800`,            scores.nutrients, "grad-fiber", sugarWarn)}
    ${miniRing("routine",   "✓",   `${done}<span class='unit'>/${total}</span>`,    `done`,                         scores.routine,   "grad-protein")}
  `;
  hero.appendChild(rings);

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
      ${ring("kcal","Calories",  t.kcal, 1800, "", "min")}
      ${ring("p",   "Protein",   t.p,    125,  "g", "min")}
      ${ring("fi",  "Fiber",     t.fi,   35,   "g", "min")}
      ${ring("fa",  "Fats",      t.fa,   75,   "g", "max")}
      ${ring("c",   "Net Carbs", t.c,    90,   "g", "max")}
      ${ring("su",  "Sugar",     t.su,   40,   "g", "max")}
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
  startTicker();
}

function renderControlsPanel() {
  const goalH = entry.fastGoalHours ?? DEFAULT_FAST_GOAL_HOURS;
  const goalMs = goalH * 3600 * 1000;
  const w = entry.waterOz ?? 0;
  const wpct = Math.min(100, Math.round((w / 140) * 100));
  const s = entry.steps ?? 0;
  const spct = pct(s, 10000);

  let fastBlock = "";
  if (entry.fastStartedAt && !entry.fastEndedAt) {
    const ms = fastDurationMs(entry.fastStartedAt, null);
    const stage = currentFastStage(ms / 3600000);
    const fpct = Math.min(100, Math.round((ms / goalMs) * 100));
    const remainMs = Math.max(0, goalMs - ms);
    const isComplete = ms >= goalMs;
    fastBlock = `
      <div class="ctrl-row fast">
        <div class="ctrl-icon">🩸</div>
        <div class="ctrl-body">
          <div class="ctrl-line">
            <span class="ctrl-label">Fasting</span>
            <span class="ctrl-stage">${stage.name}</span>
          </div>
          <div class="ctrl-time">${fmtDuration(ms)} <span class="ctrl-sub">${isComplete ? `+${fmtDuration(ms - goalMs)} past goal` : `· ${fmtDuration(remainMs)} remaining`}</span></div>
          <div class="ctrl-bar"><span style="width:${fpct}%"></span></div>
          <div class="ctrl-actions">
            ${fastEditOpen ? `
              <input type="datetime-local" id="fast-start-input" value="${toLocalDatetimeInput(new Date(entry.fastStartedAt))}" />
              <button class="primary" id="fast-start-save">Save start</button>
              <button class="ghost" id="fast-edit-cancel">Cancel</button>
            ` : `
              <button id="end-fast">End Fasting</button>
              <button class="ghost" id="fast-edit">edit start</button>
            `}
          </div>
        </div>
      </div>
    `;
  } else if (entry.fastStartedAt && entry.fastEndedAt) {
    const ms = fastDurationMs(entry.fastStartedAt, entry.fastEndedAt);
    const stage = currentFastStage(ms / 3600000);
    fastBlock = `
      <div class="ctrl-row fast complete">
        <div class="ctrl-icon">🩸</div>
        <div class="ctrl-body">
          <div class="ctrl-line"><span class="ctrl-label">Fasted</span> <span class="ctrl-stage">${stage.name} ✓</span></div>
          <div class="ctrl-time">${fmtDuration(ms)}</div>
        </div>
      </div>
    `;
  } else {
    fastBlock = `
      <div class="ctrl-row fast idle">
        <div class="ctrl-icon">🩸</div>
        <div class="ctrl-body">
          <div class="ctrl-line"><span class="ctrl-label">Fasting</span> <span class="ctrl-sub">goal ${goalH}h</span></div>
          <div class="ctrl-actions">
            <button class="primary" id="start-fast">Start Fasting</button>
            <select id="fast-goal-select">
              ${FAST_GOAL_OPTIONS.map(o => `<option value="${o}" ${o === goalH ? "selected" : ""}>${o}h</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  return `
    ${fastBlock}
    <div class="ctrl-row water">
      <div class="ctrl-icon">💧</div>
      <div class="ctrl-body">
        <div class="ctrl-line">
          <span class="ctrl-label">Water</span>
          <span class="ctrl-time">${w} <span class="ctrl-sub">/ 140 oz · ${wpct}%${w >= 140 ? ' ✓' : ''}</span></span>
        </div>
        <div class="ctrl-bar"><span style="width:${wpct}%"></span></div>
        <div class="ctrl-actions">
          <button data-water="8">+8 oz</button>
          <button data-water="16">+16 oz</button>
          ${lastWaterDelta > 0 ? `<a class="undo" id="water-undo">undo</a>` : ""}
        </div>
      </div>
    </div>
    <div class="ctrl-row steps">
      <div class="ctrl-icon">👟</div>
      <div class="ctrl-body">
        <div class="ctrl-line">
          <span class="ctrl-label">Steps</span>
          <span class="ctrl-time"><input type="number" min="0" inputmode="numeric" id="steps-input" value="${s || ''}" placeholder="0" /> <span class="ctrl-sub">/ 10,000 · ${spct}%${s >= 10000 ? ' ✓' : ''}</span></span>
        </div>
        <div class="ctrl-bar"><span style="width:${spct}%"></span></div>
      </div>
    </div>
  `;
}

function renderTracking() {
  document.getElementById("title").textContent = "Today's Routine";
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";

  // === Controls panel (fasting + water + steps) ===
  const controls = document.createElement("section");
  controls.className = "controls-panel";
  controls.innerHTML = renderControlsPanel();
  root.appendChild(controls);

  // Nutrient rings — sum of all macros from meals today (above the routine)
  const nutWrap = document.createElement("section");
  nutWrap.className = "nutrients-block";
  nutWrap.id = "macros-block";
  nutWrap.innerHTML = renderNutrientRings(macroTotals());
  root.appendChild(nutWrap);

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
  root.appendChild(sec);

  // Snacks block at the bottom
  const snacksWrap = document.createElement("section");
  snacksWrap.className = "ordered snacks-section";
  const snacksInner = document.createElement("div");
  snacksInner.className = "snacks-block";
  snacksInner.appendChild(renderSnacksBlock());
  snacksWrap.appendChild(snacksInner);
  root.appendChild(snacksWrap);

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
  if (ev.target.id === "fast-edit")  { fastEditOpen = true; rerender(); return; }
  if (ev.target.id === "fast-edit-cancel") { fastEditOpen = false; rerender(); return; }
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

show();
