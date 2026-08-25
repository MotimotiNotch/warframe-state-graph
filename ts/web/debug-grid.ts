// Port of web/debug-grid.js. Debug-only chessboard-notation grid overlay
// (A1, C4, ...) for pointing at screen positions during manual verification.
// Unlike theme.ts/booster.ts, state is intentionally NOT persisted — every
// page load starts OFF.
import { getTopRightBar, icon } from "./icons.ts";

const CELL = 100;

let overlay: HTMLElement | null = null;
let on = false;

function colLabel(index: number): string {
  let s = "";
  let i = index + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function buildOverlay(): HTMLElement {
  const el = document.createElement("div");
  el.id = "debug-grid-overlay";
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:9999",
    "pointer-events:none",
    `background-image:linear-gradient(to right, rgba(255,60,60,0.35) 1px, transparent 1px),` +
      `linear-gradient(to bottom, rgba(255,60,60,0.35) 1px, transparent 1px)`,
    `background-size:${CELL}px ${CELL}px`,
  ].join(";");

  const cols = Math.ceil(window.innerWidth / CELL);
  const rows = Math.ceil(window.innerHeight / CELL);
  const labelStyle =
    "position:absolute;font:11px/1 monospace;color:#ff3c3c;background:rgba(0,0,0,0.55);padding:1px 3px;border-radius:2px;";

  let labels = "";
  for (let c = 0; c < cols; c++) {
    labels += `<div style="${labelStyle}left:${c * CELL + 2}px;top:2px;">${colLabel(c)}</div>`;
  }
  for (let r = 0; r < rows; r++) {
    labels += `<div style="${labelStyle}left:2px;top:${r * CELL + 2}px;">${r + 1}</div>`;
  }
  el.innerHTML = labels;
  return el;
}

function setOn(next: boolean): void {
  on = next;
  if (on) {
    overlay = buildOverlay();
    document.body.appendChild(overlay);
  } else if (overlay) {
    overlay.remove();
    overlay = null;
  }
  const btn = document.getElementById("debug-grid-toggle-btn");
  if (btn) btn.style.color = on ? "var(--accent, #f6ddaa)" : "";
}

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
      #debug-grid-toggle-btn {
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a);
        color: var(--muted, #9aa0ab);
        border-radius: 10px;
        padding: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        line-height: 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      }
      #debug-grid-toggle-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
    `;
  document.head.appendChild(style);
}

function init(): void {
  injectStyle();
  const btn = document.createElement("button");
  btn.id = "debug-grid-toggle-btn";
  btn.title = "デバッグ用グリッドオーバーレイ（A1形式の位置確認）";
  btn.innerHTML = icon("layout-grid", { size: 22 });
  btn.addEventListener("click", () => setOn(!on));
  getTopRightBar().appendChild(btn);

  window.addEventListener("resize", () => {
    if (on) setOn(true);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
