import { Storage } from "./storage.js";
import { ensureItems } from "./items.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";
import { renderSettings } from "./settings.js";
import { renderHistory } from "./history.js";
import { downloadExport } from "./export.js";

const storage = Storage(localStorage);
const items = ensureItems(storage);

const date = todayKey();
const existing = storage.getEntry(date);
const entry = existing
  ? { waterOz: 0, fastStartedAt: null, fastEndedAt: null, ...mergeIntoEntry(existing, items) }
  : { ...blankEntry(date, items), waterOz: 0, fastStartedAt: null, fastEndedAt: null };

let lastWaterDelta = 0;
let view = "main";
let tickerHandle = null;

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
function startFast() {
  entry.fastStartedAt = new Date().toISOString();
  entry.fastEndedAt = null;
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

function startTicker() {
  if (tickerHandle) return;
  tickerHandle = setInterval(() => {
    if (view === "main" && entry.fastStartedAt && !entry.fastEndedAt) {
      const pill = document.querySelector("#fasting-pill .left");
      if (pill) pill.textContent = `⏱ Fasting: ${fmtDuration(fastDurationMs(entry.fastStartedAt, null))}`;
    }
  }, 60_000);
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paintTopTools(root) {
  const tools = document.createElement("div");
  tools.className = "top-tools";

  const fast = document.createElement("div");
  fast.className = "tool-row";
  fast.id = "fasting-pill";
  if (entry.fastStartedAt && !entry.fastEndedAt) {
    fast.innerHTML = `
      <span class="left">⏱ Fasting: ${fmtDuration(fastDurationMs(entry.fastStartedAt, null))}</span>
      <button id="end-fast">End fast</button>
    `;
  } else if (entry.fastStartedAt && entry.fastEndedAt) {
    fast.innerHTML = `
      <span class="left">⏱ Fasted: ${fmtDuration(fastDurationMs(entry.fastStartedAt, entry.fastEndedAt))} ✓</span>
    `;
  } else {
    fast.innerHTML = `
      <span class="left">⏱ Not fasting</span>
      <button id="start-fast" class="primary">Start fast</button>
    `;
  }
  tools.appendChild(fast);

  const water = document.createElement("div");
  water.className = "tool-row";
  water.id = "water-row";
  const w = entry.waterOz ?? 0;
  water.innerHTML = `
    <span class="left">💧 Water: ${w} / 140 oz${w >= 140 ? " ✓" : ""}</span>
    <button data-water="8">+8 oz</button>
    <button data-water="16">+16 oz</button>
    ${lastWaterDelta > 0 ? `<a class="undo" id="water-undo">undo</a>` : ""}
  `;
  tools.appendChild(water);

  const tally = document.createElement("div");
  tally.className = "log-tally";
  const t = macroTotals();
  tally.textContent = `Today's log: P ${t.p}/125g · Fi ${t.fi}/35g · Fa ${t.fa}g · C ${t.c}/130g`;
  tools.appendChild(tally);

  root.appendChild(tools);
}

function renderToday() {
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  paintTopTools(root);

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
    row.innerHTML = `
      <input type="checkbox" ${cell.checked ? "checked" : ""} />
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
  if (ev.target.matches('[data-water]')) {
    const oz = Number(ev.target.dataset.water);
    if (oz > 0) addWater(oz);
    return;
  }
  if (ev.target.id === "water-undo") { undoWater(); return; }
});

const typingTimers = {};
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
      const tally = document.querySelector(".log-tally");
      if (tally) {
        const t = macroTotals();
        tally.textContent = `Today's log: P ${t.p}/125g · Fi ${t.fi}/35g · Fa ${t.fa}g · C ${t.c}/130g`;
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
    document.getElementById("title").textContent = "Tracking";
    document.getElementById("stat").textContent = "";
    root.innerHTML = `<div class="empty-page">Tracking view coming soon.</div>`;
  } else {
    renderToday();
  }
}

document.getElementById("link-settings").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "settings" ? "main" : "settings";
  show();
});
document.getElementById("link-timeline").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "timeline" ? "main" : "timeline";
  show();
});
document.getElementById("link-tracking").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "tracking" ? "main" : "tracking";
  show();
});
document.getElementById("link-export").addEventListener("click", (ev) => {
  ev.preventDefault();
  downloadExport(storage);
});

show();
