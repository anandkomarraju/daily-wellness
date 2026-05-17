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
let openDetail = null; // null | "fast" | "water" | "steps" | "nutrients" | "routine"
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
  let p = 0, fi = 0, fa = 0, c = 0, su = 0;
  for (const it of items.items) {
    if (!it.macros) continue;
    const m = entry.items[it.id]?.macros;
    if (!m) continue;
    p  += Number(m.p)  || 0;
    fi += Number(m.fi) || 0;
    fa += Number(m.fa) || 0;
    c  += Number(m.c)  || 0;
    su += Number(m.su) || 0;
  }
  return { p, fi, fa, c, su };
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
  // Nutrient sub-score: avg of P/Fi/C-under-goal (3 metrics that have explicit targets)
  const pFrac  = Math.min(1, t.p / 125);
  const fiFrac = Math.min(1, t.fi / 35);
  const cFrac  = t.c <= 90 && t.c > 0 ? 1 : (t.c === 0 ? 0 : Math.max(0, 1 - (t.c - 90) / 90));
  const suFrac = t.su <= 40 ? Math.min(1, t.su / 40) : Math.max(0, 1 - (t.su - 40) / 40);
  const nutFrac = (pFrac + fiFrac + cFrac + suFrac) / 4;

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

  // === 5 stat pills ===
  const pills = document.createElement("div");
  pills.className = "stat-pills";
  function pillClass(metric, frac, isWarn) {
    let cls = "stat-pill";
    if (isWarn) cls += " warn";
    else if (frac >= 100) cls += " complete";
    if (openDetail === metric) cls += " active";
    return cls;
  }
  // Sugar warning if total > 40g for the day
  const sugarWarn = t.su > 40;
  // Fasting display
  const fastDisplay = isFasting
    ? fmtDuration(fastMs).replace(/^0h /, '')
    : (entry.fastStartedAt ? `${fmtDuration(fastMs).replace(/^0h /, '')} ✓` : `${goalH}h`);

  pills.innerHTML = `
    <div class="${pillClass('fast', scores.fast)}" data-pill="fast">
      <span class="pill-icon">🩸</span>
      <span class="pill-value">${fastDisplay}</span>
      <span class="pill-label">Fast</span>
    </div>
    <div class="${pillClass('water', scores.water)}" data-pill="water">
      <span class="pill-icon">💧</span>
      <span class="pill-value">${w}</span>
      <span class="pill-label">Water oz</span>
    </div>
    <div class="${pillClass('steps', scores.steps)}" data-pill="steps">
      <span class="pill-icon">👟</span>
      <span class="pill-value">${s >= 1000 ? (s/1000).toFixed(1) + 'k' : s}</span>
      <span class="pill-label">Steps</span>
    </div>
    <div class="${pillClass('nutrients', scores.nutrients, sugarWarn)}" data-pill="nutrients">
      <span class="pill-icon">🍽️</span>
      <span class="pill-value">${scores.nutrients}%</span>
      <span class="pill-label">Macros</span>
    </div>
    <div class="${pillClass('routine', scores.routine)}" data-pill="routine">
      <span class="pill-icon">✓</span>
      <span class="pill-value">${done}/${total}</span>
      <span class="pill-label">Routine</span>
    </div>
  `;
  hero.appendChild(pills);

  // === Detail panel for the open metric ===
  if (openDetail) {
    const panel = document.createElement("div");
    panel.className = "detail-panel";
    panel.id = "detail-panel";
    panel.innerHTML = renderDetailPanel(openDetail);
    hero.appendChild(panel);
  }

  root.appendChild(hero);
}

function renderDetailPanel(which) {
  const goalH = entry.fastGoalHours ?? DEFAULT_FAST_GOAL_HOURS;
  const goalMs = goalH * 3600 * 1000;

  if (which === "fast") {
    if (entry.fastStartedAt && !entry.fastEndedAt) {
      const ms = fastDurationMs(entry.fastStartedAt, null);
      const stage = currentFastStage(ms / 3600000);
      const fpct = Math.min(100, Math.round((ms / goalMs) * 100));
      const remainMs = Math.max(0, goalMs - ms);
      const isComplete = ms >= goalMs;
      return `
        <div class="detail-title">⏱ Intermittent Fasting</div>
        <div class="detail-row"><span class="key">Stage</span> <span class="val">${stage.name}</span></div>
        <div class="detail-row"><span class="key">Elapsed</span> <span class="val">${fmtDuration(ms)}</span></div>
        <div class="detail-row"><span class="key">${isComplete ? 'Past goal' : 'Remaining'}</span> <span class="val">${isComplete ? '+' + fmtDuration(ms - goalMs) : fmtDuration(remainMs)}</span></div>
        <div class="detail-row"><span class="key">Progress</span> <span class="mini-bar fast"><span style="width:${fpct}%"></span></span> <span class="val">${fpct}%</span></div>
        <div class="detail-row" style="font-size:12px; color:rgba(232,237,245,0.55); font-style:italic; padding-top:4px;">${stage.desc}</div>
        <div class="detail-row" style="margin-top:8px;">
          ${fastEditOpen ? `
            <input type="datetime-local" id="fast-start-input" value="${toLocalDatetimeInput(new Date(entry.fastStartedAt))}" />
            <button id="fast-start-save">Save</button>
            <button class="ghost" id="fast-edit-cancel">Cancel</button>
          ` : `
            <button id="end-fast">End Fasting</button>
            <button class="ghost" id="fast-edit">edit start</button>
          `}
        </div>
      `;
    } else if (entry.fastStartedAt && entry.fastEndedAt) {
      const ms = fastDurationMs(entry.fastStartedAt, entry.fastEndedAt);
      const stage = currentFastStage(ms / 3600000);
      return `
        <div class="detail-title">⏱ Fast Complete</div>
        <div class="detail-row"><span class="key">Duration</span> <span class="val">${fmtDuration(ms)}</span></div>
        <div class="detail-row"><span class="key">Reached</span> <span class="val">${stage.name}</span></div>
      `;
    } else {
      return `
        <div class="detail-title">⏱ Intermittent Fasting</div>
        <div class="detail-row"><span class="key">Goal</span> <span class="val">${goalH} hours</span></div>
        <div class="detail-row" style="margin-top:4px;">
          <button id="start-fast">Start Fasting</button>
          <select id="fast-goal-select">
            ${FAST_GOAL_OPTIONS.map(o => `<option value="${o}" ${o === goalH ? "selected" : ""}>${o}h goal</option>`).join("")}
          </select>
        </div>
      `;
    }
  }

  if (which === "water") {
    const w = entry.waterOz ?? 0;
    const wpct = Math.min(100, Math.round((w / 140) * 100));
    return `
      <div class="detail-title">💧 Water</div>
      <div class="detail-row"><span class="key">Today</span> <span class="val">${w} oz</span> <span style="color:rgba(232,237,245,0.5); font-size:13px;">/ 140 oz</span></div>
      <div class="detail-row"><span class="key">Progress</span> <span class="mini-bar water"><span style="width:${wpct}%"></span></span> <span class="val">${wpct}%${w >= 140 ? ' ✓' : ''}</span></div>
      <div class="detail-row" style="margin-top:6px;">
        <button data-water="8">+8 oz</button>
        <button data-water="16">+16 oz</button>
        ${lastWaterDelta > 0 ? `<a class="undo" id="water-undo">undo</a>` : ""}
      </div>
    `;
  }

  if (which === "steps") {
    const s = entry.steps ?? 0;
    const spct = pct(s, 10000);
    return `
      <div class="detail-title">👟 Steps</div>
      <div class="detail-row"><span class="key">Today</span>
        <input type="number" min="0" inputmode="numeric" id="steps-input" value="${s || ""}" placeholder="0" />
        <span style="color:rgba(232,237,245,0.5); font-size:13px;">/ 10,000</span></div>
      <div class="detail-row"><span class="key">Progress</span> <span class="mini-bar steps"><span style="width:${spct}%"></span></span> <span class="val">${spct}%${s >= 10000 ? ' ✓' : ''}</span></div>
    `;
  }

  if (which === "nutrients") {
    const t = macroTotals();
    const sugarWarn = t.su > 40;
    function ring(key, label, value, target) {
      const p = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
      const denom = target ? `/ ${target}g` : "g";
      return `
        <div class="detail-ring" data-key="${key}">
          <div class="ring-wrap">
            <svg viewBox="0 0 56 56">
              <circle class="track" cx="28" cy="28" r="22" />
              <circle class="prog"  cx="28" cy="28" r="22"
                      stroke-dasharray="${2 * Math.PI * 22}"
                      stroke-dashoffset="${2 * Math.PI * 22 * (1 - p/100)}"
                      transform="rotate(-90 28 28)" />
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
      <div class="detail-title">🍽️ Macros${sugarWarn ? ' · <span style="color:#e89aba">sugar over goal</span>' : ''}</div>
      <div class="detail-rings">
        ${ring("p",  "Protein",   t.p,  125)}
        ${ring("fi", "Fiber",     t.fi, 35)}
        ${ring("fa", "Fats",      t.fa, 0)}
        ${ring("c",  "Net Carbs", t.c,  90)}
        ${ring("su", "Sugar",     t.su, 40)}
      </div>
      <div class="detail-row" style="font-size:12px; color:rgba(232,237,245,0.55); margin-top:8px;">
        Log meals on <strong style="color:#e8edf5">Tracking</strong>.
      </div>
    `;
  }

  if (which === "routine") {
    const { done, total } = countDone(entry);
    const rpct = total > 0 ? Math.round((done / total) * 100) : 0;
    return `
      <div class="detail-title">✓ Routine</div>
      <div class="detail-row"><span class="key">Done</span> <span class="val">${done} of ${total}</span></div>
      <div class="detail-row"><span class="key">Progress</span> <span class="mini-bar fast"><span style="width:${rpct}%"></span></span> <span class="val">${rpct}%</span></div>
      <div class="detail-row" style="font-size:12px; color:rgba(232,237,245,0.55); margin-top:8px;">
        Check items on <strong style="color:#e8edf5">Tracking</strong>.
      </div>
    `;
  }
  return "";
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
  // Net carbs = total carbs - fiber, but here `c` is already user-entered net carbs
  // (we renamed the input label below). Goal 90g.
  return `
    <div class="nutrients-title">Today's Nutrients</div>
    <div class="nutrient-rings">
      ${ring("p",  "Protein",   t.p,  125)}
      ${ring("fi", "Fiber",     t.fi, 35)}
      ${ring("fa", "Fats",      t.fa, 0)}
      ${ring("c",  "Net Carbs", t.c,  90)}
      ${ring("su", "Sugar",     t.su, 40)}
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
      <span class="chip-mac">P ${Number(m.p)||0} Fi ${Number(m.fi)||0} Fa ${Number(m.fa)||0} NetC ${Number(m.c)||0}${(Number(m.su)||0) > 15 ? ` <span class="sugar-flag">Su ${Number(m.su)||0}⚠</span>` : ` Su ${Number(m.su)||0}`}</span>
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

function renderTracking() {
  document.getElementById("title").textContent = "Today's Routine";
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";

  const sec = document.createElement("section");
  sec.className = "ordered";
  const flat = [...items.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  flat.forEach((it, idx) => {
    const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = it.id;
    row.dataset.checked = String(cell.checked);
    const m = cell.macros ?? { p: "", fi: "", fa: "", c: "", su: "" };
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
  // Stat pill clicks — open / close detail panel
  const pillEl = ev.target.closest('[data-pill]');
  if (pillEl) {
    const which = pillEl.dataset.pill;
    openDetail = (openDetail === which) ? null : which;
    fastEditOpen = false; // reset edit mode when changing detail
    renderToday();
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
      su: Number(document.getElementById("snack-su")?.value) || 0,
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
  // On Today page, re-render the whole hero (score depends on macros).
  if (view === "main") renderToday();
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
      entry.items[id].macros = { ...(entry.items[id].macros ?? { p: 0, fi: 0, fa: 0, c: 0, su: 0 }), [key]: val };
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
