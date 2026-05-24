// Trends page — Heart Rate style cards + Apple Fitness chevron grid.

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

function trendDir(current, previous, higherIsGood) {
  if (previous === 0 && current === 0) return "steady";
  if (previous === 0) return "up";
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 3) return "steady";
  return pct > 0 ? "up" : "down";
}

// Mini bar sparkline SVG (last N values, newest on right)
function sparkBars(values, max, color) {
  const n = values.length;
  if (n === 0) return "";
  const w = 80, h = 32;
  const barW = Math.min(8, (w - (n - 1) * 2) / n);
  const gap = 2;
  const effectiveMax = max || Math.max(...values, 1);
  let bars = "";
  values.forEach((v, i) => {
    const barH = Math.max(2, (v / effectiveMax) * (h - 4));
    const x = i * (barW + gap);
    const y = h - barH;
    const opacity = i === n - 1 ? 1 : 0.5;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${color}" opacity="${opacity}" />`;
  });
  // Dot on last bar
  const lastX = (n - 1) * (barW + gap) + barW / 2;
  bars += `<circle cx="${lastX}" cy="${h - Math.max(2, (values[n-1] / effectiveMax) * (h - 4)) - 4}" r="3" fill="${color}" />`;
  const totalW = n * (barW + gap) - gap;
  return `<svg viewBox="0 0 ${totalW} ${h + 4}" width="${totalW}" height="${h + 4}" style="display:block">${bars}</svg>`;
}

function renderMetricCard(label, icon, values, currentAvg, unit, color, max) {
  const spark = sparkBars(values.slice().reverse(), max, color);
  return `
    <div class="metric-card">
      <div class="mc-top">
        <span class="mc-icon">${icon}</span>
        <span class="mc-label" style="color:${color}">${label}</span>
      </div>
      <div class="mc-body">
        <div class="mc-left">
          <div class="mc-sublabel">7-day avg</div>
          <div class="mc-value" style="color:${color}">${currentAvg}<span class="mc-unit">${unit}</span></div>
        </div>
        <div class="mc-spark">${spark}</div>
      </div>
    </div>
  `;
}

function chevronSvg(direction, color) {
  if (direction === "up") {
    return `<svg width="20" height="20" viewBox="0 0 20 20"><polyline points="4,13 10,7 16,13" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else if (direction === "down") {
    return `<svg width="20" height="20" viewBox="0 0 20 20"><polyline points="4,7 10,13 16,7" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 20 20"><line x1="4" y1="10" x2="16" y2="10" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`;
}

function renderTrendCell(label, value, unit, direction, color) {
  const chevron = chevronSvg(direction, color);
  return `
    <div class="trend-cell">
      <div class="tc-chevron-wrap" style="background:${color}18">
        ${chevron}
      </div>
      <div class="tc-info">
        <div class="tc-label">${label}</div>
        <div class="tc-value" style="color:${color}">${value}<span class="tc-unit">${unit}</span></div>
      </div>
    </div>
  `;
}

export function renderHistory(root, storage) {
  const all = storage.exportAll().entries;
  const dates = Object.keys(all).sort().reverse();
  root.innerHTML = "";

  if (dates.length === 0) {
    root.innerHTML = `<div class="empty-page">No saved days yet. Start logging on the Tracking page.</div>`;
    return;
  }

  const compute = window.__wellness_computeScores;
  const totalFastedForEntry = window.__wellness_totalFastedHoursForEntry;
  const g = window.__wellness_goals ? window.__wellness_goals() : { water_oz: 140, protein_g: 125, fiber_g: 35, steps: 10000 };

  // Compute metrics for each day
  const dayMetrics = dates.map(date => {
    const e = all[date];
    const scores = compute ? compute(e, date) : { overall: 0 };
    const fastedH = totalFastedForEntry ? totalFastedForEntry(e, date) : 0;
    return {
      date,
      score: scores.overall,
      fast: fastedH,
      water: e.waterOz ?? 0,
      steps: e.steps ?? 0,
      sleep: e.sleepHours ?? 0,
    };
  });

  // Split into current 7 days and previous 7 days
  const current7 = dayMetrics.slice(0, Math.min(7, dayMetrics.length));
  const prev7 = dayMetrics.slice(7, Math.min(14, dayMetrics.length));

  const metrics = {
    score:  { cur: current7.map(d => d.score),  prev: prev7.map(d => d.score),  icon: "⭐", label: "Score",   unit: "/100", color: "#4a9b6a", max: 100, good: true },
    fast:   { cur: current7.map(d => d.fast),   prev: prev7.map(d => d.fast),   icon: "🩸", label: "Fasting", unit: "h",    color: "#5a7d5a", max: 24,  good: true },
    water:  { cur: current7.map(d => d.water),  prev: prev7.map(d => d.water),  icon: "💧", label: "Water",   unit: "oz",   color: "#4a6c8c", max: g.water_oz * 1.2, good: true },
    steps:  { cur: current7.map(d => d.steps),  prev: prev7.map(d => d.steps),  icon: "👟", label: "Steps",   unit: "",     color: "#b88142", max: g.steps * 1.2, good: true },
    sleep:  { cur: current7.filter(d => d.sleep > 0).map(d => d.sleep), prev: prev7.filter(d => d.sleep > 0).map(d => d.sleep), icon: "🌙", label: "Sleep", unit: "h", color: "#7c5aaa", max: 10, good: true },
  };

  // Heart Rate-style cards
  let cardsHtml = `<div class="metric-cards">`;
  for (const key of ["score", "fast", "water", "steps", "sleep"]) {
    const m = metrics[key];
    if (m.cur.length === 0) continue;
    const curAvg = avg(m.cur);
    const display = key === "steps" ? Math.round(curAvg).toLocaleString() : curAvg.toFixed(1);
    cardsHtml += renderMetricCard(m.label, m.icon, m.cur, display, m.unit, m.color, m.max);
  }
  cardsHtml += `</div>`;

  // Apple Fitness Trends grid
  let gridHtml = `<div class="trends-grid-header">Trends</div>`;
  gridHtml += `<div class="trends-grid">`;
  for (const key of ["score", "fast", "water", "steps", "sleep"]) {
    const m = metrics[key];
    if (m.cur.length === 0) continue;
    const curAvg = avg(m.cur);
    const prevAvg = avg(m.prev);
    const dir = trendDir(curAvg, prevAvg, m.good);
    const display = key === "steps" ? `${Math.round(curAvg / 1000)}k` : curAvg.toFixed(1);
    gridHtml += renderTrendCell(m.label, display, m.unit, dir, m.color);
  }
  gridHtml += `</div>`;

  root.innerHTML = cardsHtml + gridHtml;
}
