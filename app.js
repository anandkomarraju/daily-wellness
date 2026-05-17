import { Storage } from "./storage.js";
import { ensureItems } from "./items.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";
import { renderSettings } from "./settings.js";
import { renderHistory } from "./history.js";
import { downloadExport } from "./export.js";
import { renderTimeline } from "./timeline.js";

const storage = Storage(localStorage);
const items = ensureItems(storage);
let layout = storage.getLayout();

const date = todayKey();
const existing = storage.getEntry(date);
const entry = existing ? mergeIntoEntry(existing, items) : blankEntry(date, items);

function fmtTitle(d) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function renderToggle() {
  const host = document.querySelector("main header");
  let bar = document.getElementById("layout-toggle");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "layout-toggle";
    bar.className = "layout-toggle";
    bar.innerHTML = `
      <button data-layout="category">By category</button>
      <button data-layout="order">By order</button>
    `;
    host.appendChild(bar);
    bar.addEventListener("click", (ev) => {
      const v = ev.target?.dataset?.layout;
      if (v !== "category" && v !== "order") return;
      if (layout === v) return;
      layout = v;
      storage.saveLayout(layout);
      renderToggle();
      renderMain();
    });
  }
  for (const btn of bar.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.layout === layout);
  }
}

function renderCategory() {
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  for (const sec of items.sections) {
    const el = document.createElement("section");
    el.className = "section";
    el.dataset.key = sec.key;
    el.innerHTML = `<h2>${sec.title}</h2>`;
    for (const it of sec.items) {
      const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.id = it.id;
      row.dataset.checked = String(cell.checked);
      row.innerHTML = `
        <input type="checkbox" ${cell.checked ? "checked" : ""} />
        <div class="label">
          ${it.label}
          ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
          ${(!cell.checked && cell.comment) ? `<textarea>${cell.comment}</textarea>` : ""}
        </div>
      `;
      el.appendChild(row);
    }
    root.appendChild(el);
  }
}

function renderOrdered() {
  document.getElementById("title").textContent = fmtTitle(new Date());
  const { done, total } = countDone(entry);
  document.getElementById("stat").textContent = `${done} of ${total} done`;

  const root = document.getElementById("app");
  root.innerHTML = "";
  const sec = document.createElement("section");
  sec.className = "ordered";
  const flat = items.sections.flatMap(s => s.items)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  flat.forEach((it, idx) => {
    const cell = entry.items[it.id] ?? { checked: false, comment: "", label: it.label };
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = it.id;
    row.dataset.checked = String(cell.checked);
    row.innerHTML = `
      <input type="checkbox" ${cell.checked ? "checked" : ""} />
      <div class="num">${idx + 1}.</div>
      <div class="label">
        ${it.label}
        ${!cell.checked ? `<span class="note-toggle">+ note</span>` : ""}
        ${(!cell.checked && cell.comment) ? `<textarea>${cell.comment}</textarea>` : ""}
      </div>
    `;
    sec.appendChild(row);
  });
  root.appendChild(sec);
}

function renderMain() {
  if (layout === "order") renderOrdered();
  else renderCategory();
  renderToggle();
}

function persist() { storage.saveEntry(date, { ...entry, savedAt: new Date().toISOString() }); }

document.addEventListener("change", (ev) => {
  if (ev.target.matches('.row input[type="checkbox"]')) {
    const id = ev.target.closest(".row").dataset.id;
    entry.items[id].checked = ev.target.checked;
    persist();
    renderMain();
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
  }
});

const typingTimers = {};
document.addEventListener("input", (ev) => {
  if (ev.target.matches(".row textarea")) {
    const id = ev.target.closest(".row").dataset.id;
    const value = ev.target.value;
    clearTimeout(typingTimers[id]);
    typingTimers[id] = setTimeout(() => {
      entry.items[id].comment = value;
      persist();
    }, 250);
  }
});

document.getElementById("save-btn").addEventListener("click", () => {
  persist();
  document.getElementById("save-btn").textContent = "Saved ✓";
  setTimeout(() => { document.getElementById("save-btn").textContent = "Save today"; }, 1200);
});

let view = "main";
function show() {
  const root = document.getElementById("app");
  const existingToggle = document.getElementById("layout-toggle");
  if (view !== "main" && existingToggle) existingToggle.remove();

  if (view === "settings") {
    document.getElementById("title").textContent = "Edit checklist";
    document.getElementById("stat").textContent = "Changes save automatically";
    renderSettings(root, storage, items, (newItems, action) => {
      if (action === "back") { view = "main"; show(); return; }
      const merged = mergeIntoEntry(entry, items);
      Object.assign(entry, merged);
      persist();
    });
  } else if (view === "history") {
    document.getElementById("title").textContent = "History";
    document.getElementById("stat").textContent = "";
    renderHistory(root, storage);
  } else if (view === "timeline") {
    document.getElementById("title").textContent = "Timeline";
    document.getElementById("stat").textContent = "";
    renderTimeline(root, storage, items);
  } else {
    renderMain();
  }
}

document.getElementById("link-settings").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "settings" ? "main" : "settings";
  show();
});

document.getElementById("link-history").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "history" ? "main" : "history";
  show();
});
document.getElementById("link-timeline").addEventListener("click", (ev) => {
  ev.preventDefault();
  view = view === "timeline" ? "main" : "timeline";
  show();
});
document.getElementById("link-export").addEventListener("click", (ev) => {
  ev.preventDefault();
  downloadExport(storage);
});

show();
