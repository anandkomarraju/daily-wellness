import { Storage } from "./storage.js";
import { ensureItems } from "./items.js";
import { todayKey, blankEntry, mergeIntoEntry, countDone } from "./entry.js";

const storage = Storage(localStorage);
const items = ensureItems(storage);

const date = todayKey();
const existing = storage.getEntry(date);
const entry = existing ? mergeIntoEntry(existing, items) : blankEntry(date, items);

function fmtTitle(d) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function render() {
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

function persist() { storage.saveEntry(date, { ...entry, savedAt: new Date().toISOString() }); }

document.addEventListener("change", (ev) => {
  if (ev.target.matches('.row input[type="checkbox"]')) {
    const id = ev.target.closest(".row").dataset.id;
    entry.items[id].checked = ev.target.checked;
    persist();
    render();
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

render();
