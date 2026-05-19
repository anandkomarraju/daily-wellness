// Timeline page — chronological list of past saved days, each showing 5 mini score rings.
// Renders via window.computeScoresForEntry / macroTotalsForEntry exposed by app.js.

function ringSvg(p) {
  const r = 22, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, p / 100)));
  return `
    <svg viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="#e8e3d8" stroke-width="5" />
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="#8a9b8a" stroke-width="5"
              stroke-linecap="round"
              stroke-dasharray="${c}" stroke-dashoffset="${off}"
              transform="rotate(-90 28 28)" />
    </svg>
  `;
}

function ringMini(label, displayValue, progress, status) {
  return `
    <div class="tl-ring" data-status="${status}">
      <div class="tl-ring-wrap">
        ${ringSvg(progress)}
        <div class="tl-ring-num" data-status="${status}">${displayValue}</div>
      </div>
      <div class="tl-ring-label">${label}</div>
    </div>
  `;
}

function fmtDateHeader(yyyy_mm_dd) {
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${days[dt.getDay()]} ${months[dt.getMonth()]} ${dt.getDate()}`;
}

export function renderHistory(root, storage) {
  const all = storage.exportAll().entries;
  const dates = Object.keys(all).sort().reverse();
  root.innerHTML = `<div class="timeline-feed"></div>`;
  const wrap = root.querySelector(".timeline-feed");
  if (dates.length === 0) {
    wrap.innerHTML = `<div class="empty-page">No saved days yet. Tap items on Tracking to start logging.</div>`;
    return;
  }

  const compute = window.__wellness_computeScores;
  const macroT = window.__wellness_macroTotals;
  const totalFastedForEntry = window.__wellness_totalFastedHoursForEntry;
  const g = window.__wellness_goals ? window.__wellness_goals() : { water_oz: 140, protein_g: 125, fiber_g: 35 };
  const waterGoal = g.water_oz;
  const proteinGoal = g.protein_g;
  const fiberGoal = g.fiber_g;

  for (const date of dates) {
    const e = all[date];
    if (!compute) {
      // Fallback: just show the date and routine count
      const ids = Object.keys(e.items ?? {});
      const done = ids.filter(id => e.items[id].checked).length;
      const div = document.createElement("div");
      div.className = "tl-day";
      div.innerHTML = `<div class="tl-date">${fmtDateHeader(date)}</div><div class="tl-fallback">${done} of ${ids.length} routine done</div>`;
      wrap.appendChild(div);
      continue;
    }
    const scores = compute(e, date);
    const t = macroT(e);
    const fastedH = totalFastedForEntry ? totalFastedForEntry(e, date) : 0;
    const goalH = e.fastGoalHours ?? 14;

    const water = e.waterOz ?? 0;
    const steps = e.steps ?? 0;
    const recoveryDone = e.items?.recovery_routine?.checked ? 100 : 0;

    const div = document.createElement("div");
    div.className = "tl-day";
    const fastDisp = `${fastedH.toFixed(1)}h`;
    const waterDisp = `${water}oz`;
    const nutDisp = `${scores.nutrients}%`;
    const recoveryDisp = `${recoveryDone}%`;
    const overallStatus = scores.overall >= 75 ? "met" : scores.overall >= 50 ? "ok" : "unmet";

    div.innerHTML = `
      <div class="tl-date">${fmtDateHeader(date)}</div>
      <div class="tl-rings">
        ${ringMini("Score",     scores.overall,    scores.overall, overallStatus)}
        ${ringMini("Fast",      fastDisp,          scores.fast,    fastedH >= goalH ? "met" : "unmet")}
        ${ringMini("Water",     waterDisp,         scores.water,   water >= waterGoal ? "met" : "unmet")}
        ${ringMini("Nutrients", nutDisp,           scores.nutrients, (t.p >= proteinGoal && t.fi >= fiberGoal) ? "met" : "unmet")}
        ${ringMini("Recovery",  recoveryDisp,      recoveryDone,   recoveryDone === 100 ? "met" : "unmet")}
      </div>
    `;
    wrap.appendChild(div);
  }
}
