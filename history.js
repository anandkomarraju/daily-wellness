// Trends page — 7-day averages with direction arrows, plus daily timeline.

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

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function trendArrow(current, previous) {
  if (previous === 0) return { arrow: "—", cls: "neutral" };
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (Math.abs(pct) < 3) return { arrow: "→", cls: "neutral" };
  if (diff > 0) return { arrow: "↑", cls: "up" };
  return { arrow: "↓", cls: "down" };
}

function renderTrendCard(label, icon, currentAvg, prevAvg, unit, higherIsGood = true) {
  const trend = trendArrow(currentAvg, prevAvg);
  const dirCls = (trend.cls === "up" && higherIsGood) || (trend.cls === "down" && !higherIsGood)
    ? "positive"
    : (trend.cls === "neutral" ? "neutral" : "negative");
  const diff = prevAvg > 0 ? Math.abs(Math.round(((currentAvg - prevAvg) / prevAvg) * 100)) : 0;
  const diffStr = trend.cls === "neutral" ? "steady" : `${diff}%`;
  return `
    <div class="trend-card">
      <div class="trend-icon">${icon}</div>
      <div class="trend-body">
        <div class="trend-label">${label}</div>
        <div class="trend-value">${currentAvg.toFixed(1)}<span class="trend-unit">${unit}</span></div>
      </div>
      <div class="trend-dir ${dirCls}">
        <span class="trend-arrow">${trend.arrow}</span>
        <span class="trend-diff">${diffStr}</span>
      </div>
    </div>
  `;
}

export function renderHistory(root, storage) {
  const all = storage.exportAll().entries;
  const dates = Object.keys(all).sort().reverse();
  root.innerHTML = "";

  if (dates.length === 0) {
    root.innerHTML = `<div class="empty-page">No saved days yet. Tap items on Tracking to start logging.</div>`;
    return;
  }

  const compute = window.__wellness_computeScores;
  const macroT = window.__wellness_macroTotals;
  const totalFastedForEntry = window.__wellness_totalFastedHoursForEntry;
  const g = window.__wellness_goals ? window.__wellness_goals() : { water_oz: 140, protein_g: 125, fiber_g: 35, steps: 10000 };

  // Compute metrics for each day
  const dayMetrics = dates.map(date => {
    const e = all[date];
    const scores = compute ? compute(e, date) : { overall: 0, fast: 0, water: 0, steps: 0, nutrients: 0 };
    const fastedH = totalFastedForEntry ? totalFastedForEntry(e, date) : 0;
    return {
      date,
      score: scores.overall,
      fast: fastedH,
      water: e.waterOz ?? 0,
      steps: e.steps ?? 0,
      sleep: e.sleepHours ?? 0,
      nutrients: scores.nutrients,
    };
  });

  // Split into current 7 days and previous 7 days
  const current7 = dayMetrics.slice(0, Math.min(7, dayMetrics.length));
  const prev7 = dayMetrics.slice(7, Math.min(14, dayMetrics.length));

  const curScores = current7.map(d => d.score);
  const prevScores = prev7.map(d => d.score);
  const curFast = current7.map(d => d.fast);
  const prevFast = prev7.map(d => d.fast);
  const curWater = current7.map(d => d.water);
  const prevWater = prev7.map(d => d.water);
  const curSteps = current7.map(d => d.steps);
  const prevSteps = prev7.map(d => d.steps);
  const curSleep = current7.filter(d => d.sleep > 0).map(d => d.sleep);
  const prevSleep = prev7.filter(d => d.sleep > 0).map(d => d.sleep);

  // Trends section
  const trendsHtml = `
    <div class="trends-section">
      <div class="trends-header">7-Day Averages</div>
      <div class="trends-sub">vs. previous 7 days</div>
      ${renderTrendCard("Score", "⭐", avg(curScores), avg(prevScores), "/100", true)}
      ${renderTrendCard("Fasting", "🩸", avg(curFast), avg(prevFast), "h", true)}
      ${renderTrendCard("Water", "💧", avg(curWater), avg(prevWater), "oz", true)}
      ${renderTrendCard("Steps", "👟", avg(curSteps), avg(prevSteps), "", true)}
      ${curSleep.length > 0 ? renderTrendCard("Sleep", "🌙", avg(curSleep), avg(prevSleep), "h", true) : ""}
    </div>
  `;

  // Mini sparkline bars (last 7 days, newest on right)
  const spark7 = current7.slice().reverse();
  const maxScore = 100;
  const sparkHtml = `
    <div class="spark-section">
      <div class="spark-header">Last 7 Days</div>
      <div class="spark-bars">
        ${spark7.map(d => {
          const h = Math.max(4, Math.round((d.score / maxScore) * 48));
          const cls = d.score >= 75 ? "high" : d.score >= 50 ? "mid" : "low";
          const dayLabel = fmtDateHeader(d.date).split(" ")[0];
          return `<div class="spark-col">
            <div class="spark-bar ${cls}" style="height:${h}px"></div>
            <div class="spark-day">${dayLabel}</div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;

  // Daily timeline (existing rings view)
  let timelineHtml = `<div class="trends-header" style="margin-top:24px;">Daily Log</div>`;
  timelineHtml += `<div class="timeline-feed">`;
  for (const dm of dayMetrics.slice(0, 14)) {
    const e = all[dm.date];
    const scores = compute ? compute(e, dm.date) : { overall: 0 };
    const fastedH = dm.fast;
    const goalH = e.fastGoalHours ?? 14;
    const water = dm.water;
    const overallStatus = scores.overall >= 75 ? "met" : scores.overall >= 50 ? "ok" : "unmet";

    timelineHtml += `
      <div class="tl-day">
        <div class="tl-date">${fmtDateHeader(dm.date)}</div>
        <div class="tl-rings">
          ${ringMini("Score", scores.overall, scores.overall, overallStatus)}
          ${ringMini("Fast", `${fastedH.toFixed(1)}h`, scores.fast ?? 0, fastedH >= goalH ? "met" : "unmet")}
          ${ringMini("Water", `${water}oz`, scores.water ?? 0, water >= g.water_oz ? "met" : "unmet")}
          ${ringMini("Steps", dm.steps >= 1000 ? `${(dm.steps/1000).toFixed(1)}k` : `${dm.steps}`, scores.steps ?? 0, dm.steps >= g.steps ? "met" : "unmet")}
          ${dm.sleep > 0 ? ringMini("Sleep", `${dm.sleep}h`, Math.min(100, Math.round((dm.sleep / 8) * 100)), dm.sleep >= 7 ? "met" : "unmet") : ringMini("Sleep", "—", 0, "unmet")}
        </div>
      </div>
    `;
  }
  timelineHtml += `</div>`;

  root.innerHTML = trendsHtml + sparkHtml + timelineHtml;
}
