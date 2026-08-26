// Port of web/booster.js — the booster (XP/credit/resource/...) countdown
// timer widget shared across every page, plus any free-named custom timer.
// No official API exposes booster state, so this is a purely local timer
// the player starts by hand.
//
// Cut over 2026-08-26: bundled as a real module into every consuming page's
// entry script instead of the legacy `<script src="/booster.js">` passthrough.
// One consequence: a bundled module script defers to after the document is
// parsed, while the sibling legacy scripts still on classic `<script src>`
// (scratch/theme/debug-grid, also appending to the same top-right bar) run
// synchronously as soon as they're encountered — i.e. *before* this module's
// code runs, regardless of tag order in the HTML. `init()` below appends its
// button with `prepend`, not `appendChild`, specifically so the button's
// left-most position doesn't depend on winning a script-execution-order race
// against those still-classic siblings.

import { getTopRightBar, icon } from "./icons.ts";

const STATE_KEY = "warframe-state-graph:boosters";
const POS_KEY = "warframe-state-graph:booster-panel-pos";
const LIST_KEY = "warframe-state-graph:booster-list";
const CUSTOM_KEY = "warframe-state-graph:booster-custom-list";
const OPEN_KEY = "warframe-state-graph:booster-panel-open";
const DEFAULT_POS = { top: 10, left: 10 };
const DEFAULT_LIST = ["xp", "credit"]; // the original 2 kinds, carried over as the initial list
const DURATIONS_HOURS = [
  { label: "3日", hours: 72 },
  { label: "7日", hours: 168 },
  { label: "30日", hours: 720 },
  { label: "90日", hours: 2160 },
];
// All 5 purchasable boosters per the official wiki (wiki.warframe.com/w/Booster).
const BOOSTERS = [
  { id: "xp", label: "経験値" }, // Affinity Booster
  { id: "credit", label: "クレジット" }, // Credit Booster
  { id: "resource", label: "リソース" }, // Resource Booster (2x pickups)
  { id: "resource_drop", label: "リソースドロップ率" }, // Resource Drop Chance Booster
  { id: "mod_drop", label: "MODドロップ率" }, // Mod Drop Chance Booster
];
const BOOSTER_BY_ID: Record<string, (typeof BOOSTERS)[number]> = Object.fromEntries(BOOSTERS.map((b) => [b.id, b]));
const customOpenIds = new Set<string>(); // booster ids with the "add custom duration" form open (transient, not persisted)

interface PanelPos {
  top: number;
  left: number;
}
interface BoosterEntry {
  expiry: number;
}
type BoosterState = Record<string, BoosterEntry>;
interface CustomBooster {
  id: string;
  label: string;
}

function loadState(): BoosterState {
  try {
    return (JSON.parse(localStorage.getItem(STATE_KEY) || "null") as BoosterState) || {};
  } catch {
    return {};
  }
}
function saveState(state: BoosterState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* not fatal */
  }
}

function loadPanelPos(): PanelPos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PanelPos>;
      if (typeof p.top === "number" && typeof p.left === "number") return p as PanelPos;
    }
  } catch {
    /* fall through to default */
  }
  return { ...DEFAULT_POS };
}
function savePanelPos(pos: PanelPos): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

// Booster ids currently added to the panel, in display order.
function loadList(): string[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) return arr.filter((id): id is string => typeof id === "string" && !!BOOSTER_BY_ID[id]);
    }
  } catch {
    /* fall through to default */
  }
  return [...DEFAULT_LIST];
}
function saveList(list: string[]): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

// 任意の名前で追加したタイマー（公式5種のカタログに無いもの）。
function loadCustomList(): CustomBooster[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return arr.filter(
          (x): x is CustomBooster =>
            !!x && typeof x === "object" && typeof (x as CustomBooster).id === "string" && typeof (x as CustomBooster).label === "string",
        );
      }
    }
  } catch {
    /* fall through to default */
  }
  return [];
}
function saveCustomList(list: CustomBooster[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
function newCustomId(): string {
  return `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
      #booster-toggle-btn {
        display: inline-flex; align-items: center; gap: 5px;
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a); color: var(--muted, #9aa0ab);
        border-radius: 10px; padding: 6px 10px; font-size: 0.8rem; cursor: pointer;
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      }
      #booster-toggle-btn:hover, #booster-toggle-btn.active { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }

      #booster-panel {
        position: fixed;
        z-index: 150;
        /* パネル本体は文字を読む場所なので、半透明の--panelでなく
           ほぼ不透明の--popover-bgを使う（popover-opacityルールと同じ理由）。 */
        background: var(--popover-bg, rgba(20, 22, 28, 0.94));
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a);
        border-radius: 14px;
        font-size: 0.72rem;
        color: var(--text, #e4e6ec);
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        min-width: 250px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
      }
      #booster-panel.hidden { display: none; }
      #booster-panel .b-head {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; border-bottom: 1px solid var(--border, #2a2e3a);
        cursor: grab; user-select: none; touch-action: none;
      }
      #booster-panel .b-head.dragging { cursor: grabbing; }
      #booster-panel .b-head .b-title { font-weight: 600; color: var(--text, #e4e6ec); flex: 1; }
      #booster-panel .b-head button {
        background: transparent; border: none; color: var(--muted, #9aa0ab); cursor: pointer; line-height: 0; padding: 2px;
      }
      #booster-panel .b-head button:hover { color: var(--danger, #e88c93); }
      #booster-panel .b-head .popover-wrap { position: relative; display: inline-flex; }
      #booster-panel .b-head .icon-btn {
        background: transparent; border: 1px solid var(--border, #2a2e3a); color: var(--muted, #9aa0ab);
        border-radius: 6px; padding: 4px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; line-height: 0;
      }
      #booster-panel .b-head .icon-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #booster-panel .popover {
        position: absolute; top: calc(100% + 6px); right: 0; left: auto; z-index: 200;
        background: var(--popover-bg, rgba(20, 22, 28, 0.94)); backdrop-filter: blur(var(--panel-blur)); -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a); border-radius: 10px; padding: 8px 10px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4); width: 240px; font-size: 0.72rem; line-height: 1.7;
        color: var(--text, #e4e6ec);
      }
      #booster-panel .popover code { background: var(--bg, #12141a); padding: 0 3px; border-radius: 3px; }
      #booster-panel .b-body { padding: 6px 8px; }
      #booster-panel .b-add-row { display: flex; align-items: center; gap: 6px; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--border, #2a2e3a); }
      #booster-panel .b-add-row select { flex: 1; }
      #booster-panel .b-custom-add-row { display: flex; align-items: center; gap: 6px; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--border, #2a2e3a); }
      #booster-panel .b-custom-add-row input[type="text"] {
        flex: 1; background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 4px; font-size: 0.68rem; padding: 2px 4px; font-family: inherit;
      }
      #booster-list-body {
        display: grid;
        grid-template-columns: max-content max-content max-content max-content max-content;
        align-items: center;
        column-gap: 8px;
        row-gap: 4px;
      }
      #booster-panel .b-row { display: contents; }
      #booster-panel .b-label { color: var(--muted, #9aa0ab); white-space: nowrap; }
      #booster-panel .b-time { color: var(--actionable, #7ee3a9); font-variant-numeric: tabular-nums; justify-self: start; }
      #booster-panel select, #booster-panel button.b-action {
        background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 4px; font-size: 0.68rem; padding: 2px 4px; cursor: pointer;
      }
      #booster-panel button.b-action:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #booster-panel button.b-action.b-remove:hover { border-color: var(--danger, #e88c93); color: var(--danger, #e88c93); }
      #booster-panel button.b-action.b-custom-toggle.active { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #booster-panel .b-empty { grid-column: 1 / -1; color: var(--muted, #9aa0ab); font-size: 0.72rem; padding: 4px 0; }
      #booster-panel .b-custom-row { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; padding: 2px 0 4px; }
      #booster-panel .b-custom-row input[type="number"] {
        width: 3.8em; background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 4px; font-size: 0.68rem; padding: 2px 4px; font-family: inherit; -moz-appearance: textfield;
      }
      #booster-panel .b-custom-row input[type="number"]::-webkit-inner-spin-button,
      #booster-panel .b-custom-row input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    `;
  document.head.appendChild(style);
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "終了";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days === 0 && hours === 0) {
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  if (days > 0) return `${days}日${hours}時間`;
  return `${hours}時間${mins}分`;
}

function render(): void {
  const list = loadList();
  const remaining = BOOSTERS.filter((b) => !list.includes(b.id));
  renderAddRow(remaining);
  renderList(list);
}

function renderAddRow(remaining: typeof BOOSTERS): void {
  const el = document.getElementById("booster-add-row");
  if (!el) return;
  if (!remaining.length) {
    el.innerHTML = `<div class="b-empty">全種類を追加済み</div>`;
    return;
  }
  el.innerHTML = `
      <select id="booster-add-select">${remaining.map((b) => `<option value="${b.id}">${b.label}</option>`).join("")}</select>
      <button class="b-action" id="booster-add-btn">追加</button>
    `;
  document.getElementById("booster-add-btn")!.addEventListener("click", () => {
    const id = (document.getElementById("booster-add-select") as HTMLSelectElement).value;
    const list = loadList();
    if (!list.includes(id)) {
      list.push(id);
      saveList(list);
    }
    render();
  });
}

function renderList(list: string[]): void {
  const state = loadState();
  const customList = loadCustomList();
  const body = document.getElementById("booster-list-body");
  if (!body) return;
  const entries: { id: string; label: string; custom: boolean }[] = [
    ...list.map((id) => ({ id, label: BOOSTER_BY_ID[id]!.label, custom: false })),
    ...customList.map((c) => ({ id: c.id, label: c.label, custom: true })),
  ];
  if (!entries.length) {
    body.innerHTML = `<div class="b-empty">上のプルダウン、または自由入力から追加して</div>`;
    return;
  }
  body.innerHTML = entries
    .map(({ id, label, custom }) => {
      const entry = state[id];
      const remaining = entry ? entry.expiry - Date.now() : 0;
      const customOpen = customOpenIds.has(id);
      const removeTitle = custom ? "削除（名前ごと消えます）" : "リストから外す";
      const customRow = customOpen
        ? `
        <div class="b-custom-row">
          <input type="number" min="0" max="365" step="1" placeholder="日" data-custom-days="${id}">日
          <input type="number" min="0" max="23" step="1" placeholder="時間" data-custom-hours="${id}">時間
          <button class="b-action" data-custom-confirm="${id}">${remaining > 0 ? "追加" : "開始"}</button>
        </div>`
        : "";
      if (entry && remaining > 0) {
        return `
          <div class="b-row">
            <span class="b-label">${label}</span>
            <span class="b-time" data-expiry="${entry.expiry}" data-id="${id}">${formatRemaining(remaining)}</span>
            <button class="b-action" data-stop="${id}">停止</button>
            <button class="b-action b-custom-toggle${customOpen ? " active" : ""}" data-custom-toggle="${id}" title="任意の時間を追加">${icon("plus", { size: 12 })}</button>
            <button class="b-action b-remove" data-remove="${id}" title="${removeTitle}">${icon("x", { size: 12 })}</button>
          </div>
          ${customRow}`;
      }
      const options = DURATIONS_HOURS.map((d) => `<option value="${d.hours}">${d.label}</option>`).join("");
      return `
        <div class="b-row">
          <span class="b-label">${label}</span>
          <select data-duration="${id}">${options}</select>
          <button class="b-action" data-start="${id}">開始</button>
          <button class="b-action b-custom-toggle${customOpen ? " active" : ""}" data-custom-toggle="${id}" title="任意の日数/時間を指定して開始">${icon("plus", { size: 12 })}</button>
          <button class="b-action b-remove" data-remove="${id}" title="${removeTitle}">${icon("x", { size: 12 })}</button>
        </div>
        ${customRow}`;
    })
    .join("");

  body.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.start!;
      const select = body.querySelector<HTMLSelectElement>(`[data-duration="${id}"]`)!;
      const hours = Number(select.value);
      const s = loadState();
      s[id] = { expiry: Date.now() + hours * 3600 * 1000 };
      saveState(s);
      render();
    });
  });
  body.querySelectorAll<HTMLButtonElement>("[data-stop]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = loadState();
      delete s[btn.dataset.stop!];
      saveState(s);
      render();
    });
  });
  body.querySelectorAll<HTMLButtonElement>("[data-custom-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.customToggle!;
      if (customOpenIds.has(id)) customOpenIds.delete(id);
      else customOpenIds.add(id);
      render();
    });
  });
  body.querySelectorAll<HTMLButtonElement>("[data-custom-confirm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.customConfirm!;
      const rawDays = Number(body.querySelector<HTMLInputElement>(`[data-custom-days="${id}"]`)!.value) || 0;
      const rawHours = Number(body.querySelector<HTMLInputElement>(`[data-custom-hours="${id}"]`)!.value) || 0;
      // min/max attributes don't stop direct keyboard entry, so clamp again on confirm.
      const days = Math.min(Math.max(rawDays, 0), 365);
      const hours = Math.min(Math.max(rawHours, 0), 23);
      const addMs = (days * 24 + hours) * 3600 * 1000;
      if (addMs <= 0) return;
      const s = loadState();
      const current = s[id];
      const base = current && current.expiry > Date.now() ? current.expiry : Date.now();
      s[id] = { expiry: base + addMs };
      saveState(s);
      customOpenIds.delete(id);
      render();
    });
  });
  body.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.remove!;
      if (id.startsWith("custom:")) {
        saveCustomList(loadCustomList().filter((c) => c.id !== id));
      } else {
        saveList(loadList().filter((x) => x !== id));
      }
      // removing from the list means the timer is irrelevant too — drop it alongside
      const s = loadState();
      delete s[id];
      saveState(s);
      customOpenIds.delete(id);
      render();
    });
  });
}

function tick(): void {
  document.querySelectorAll<HTMLElement>("#booster-panel .b-time").forEach((elm) => {
    const remaining = Number(elm.dataset.expiry) - Date.now();
    if (remaining <= 0) {
      render(); // an expired row snaps back to the start-button form
      return;
    }
    elm.textContent = formatRemaining(remaining);
  });
}

function applyPanelPos(panel: HTMLElement, pos: PanelPos): void {
  panel.style.top = `${pos.top}px`;
  panel.style.left = `${pos.left}px`;
}

// Positions the panel just right of the toggle button (or left, if it
// wouldn't fit). The panel must already be visible (not display:none) when
// this runs, since it needs a real measured size.
function positionNextToButton(panel: HTMLElement, btn: HTMLElement): void {
  const btnRect = btn.getBoundingClientRect();
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  let left = btnRect.right + 8;
  if (left + w > window.innerWidth) left = btnRect.left - w - 8;
  left = Math.min(Math.max(0, left), Math.max(0, window.innerWidth - w));
  let top = btnRect.top;
  top = Math.min(Math.max(0, top), Math.max(0, window.innerHeight - h));
  applyPanelPos(panel, { top, left });
}

function setupDrag(panel: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let start = { x: 0, y: 0 };
  let origin = { top: 0, left: 0 };

  handle.addEventListener("pointerdown", (e) => {
    // A pointerdown on a button inside the handle (e.g. close) isn't a drag.
    // Letting the handle capture the pointer would stop that button's click
    // from firing (pointerup hit-testing would land on the handle instead).
    if ((e.target as HTMLElement).closest("button")) return;
    dragging = true;
    handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY };
    const rect = panel.getBoundingClientRect();
    origin = { top: rect.top, left: rect.left };
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    const pos = {
      left: Math.min(Math.max(0, origin.left + dx), Math.max(0, maxLeft)),
      top: Math.min(Math.max(0, origin.top + dy), Math.max(0, maxTop)),
    };
    applyPanelPos(panel, pos);
  });
  const endDrag = (e?: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    if (e && handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) {
      handle.releasePointerCapture(e.pointerId);
    }
    const rect = panel.getBoundingClientRect();
    savePanelPos({ top: rect.top, left: rect.left });
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}

function togglePanel(btn: HTMLElement, panel: HTMLElement): void {
  const opening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !opening);
  btn.classList.toggle("active", opening);
  saveOpen(opening);
  if (opening) {
    // Button-driven open/close always snaps to next-to-button, not the
    // dragged-and-saved position — that saved position is only used to
    // restore on page reload (see init() below).
    positionNextToButton(panel, btn);
    render();
  }
}

function init(): void {
  injectStyle();

  const btn = document.createElement("button");
  btn.id = "booster-toggle-btn";
  btn.innerHTML = icon("zap") + "タイマー";
  // prepend, not appendChild: see the file-header comment for why this can't
  // rely on script-execution order to land left of theme.js/scratch.js/etc.
  getTopRightBar().prepend(btn);

  const panel = document.createElement("div");
  panel.id = "booster-panel";
  panel.className = "hidden";
  panel.innerHTML = `
      <div class="b-head" id="booster-drag-handle">
        <span class="b-title">${icon("zap", { size: 14 })}タイマー</span>
        <div class="popover-wrap">
          <button class="icon-btn" id="booster-help-toggle" title="使い方">${icon("circle-alert", { size: 14 })}</button>
          <div class="popover hidden" id="booster-help-popover">
            プルダウンは購入時の固定期間（3/7/30/90日）専用。<br>
            <code>+</code>ボタンで任意の日数/時間を指定可能（上限365日23時間）。<br>
            稼働中に<code>+</code>を押すと「追加」になり、残り時間に加算されます。<br>
            下の自由入力欄からは、カタログに無い名前でもタイマーを追加できます。
          </div>
        </div>
        <button id="booster-close" title="閉じる">${icon("x", { size: 14 })}</button>
      </div>
      <div class="b-body">
        <div class="b-add-row" id="booster-add-row"></div>
        <div class="b-custom-add-row">
          <input type="text" id="booster-custom-name-input" placeholder="任意の名前(例: サーティエイド)" maxlength="40">
          <button class="b-action" id="booster-custom-name-add-btn">追加</button>
        </div>
        <div id="booster-list-body"></div>
      </div>
    `;
  document.body.appendChild(panel);
  applyPanelPos(panel, loadPanelPos());

  btn.addEventListener("click", () => togglePanel(btn, panel));
  panel.querySelector("#booster-close")!.addEventListener("click", () => togglePanel(btn, panel));
  setupDrag(panel, panel.querySelector("#booster-drag-handle")!);

  panel.querySelector("#booster-help-toggle")!.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.querySelector("#booster-help-popover")!.classList.toggle("hidden");
  });
  panel.querySelector("#booster-help-popover")!.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => {
    panel.querySelector("#booster-help-popover")!.classList.add("hidden");
  });

  const addCustomFromInput = () => {
    const input = panel.querySelector<HTMLInputElement>("#booster-custom-name-input")!;
    const label = input.value.trim();
    if (!label) return;
    const list = loadCustomList();
    list.push({ id: newCustomId(), label });
    saveCustomList(list);
    input.value = "";
    render();
  };
  panel.querySelector("#booster-custom-name-add-btn")!.addEventListener("click", addCustomFromInput);
  panel.querySelector("#booster-custom-name-input")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") addCustomFromInput();
  });

  // If the panel was left open (not closed) on the last reload, keep it open.
  if (loadOpen()) {
    panel.classList.remove("hidden");
    btn.classList.add("active");
  }

  render();
  setInterval(tick, 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
