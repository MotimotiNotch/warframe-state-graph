// Port of web/theme.js. Light/dark toggle button, sharing the top-right bar
// with booster.ts. Flash-prevention (applying <html data-theme> before CSS
// paints) happens in each page's inline head script, synchronously — this
// module only owns the toggle button UI and click handling.
import { getTopRightBar, icon } from "./icons.ts";

const KEY = "warframe-state-graph:theme";

type Theme = "light" | "dark";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function effective(): Theme {
  const s = stored();
  if (s) return s;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

function persist(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private-mode etc: page still switches visually, just doesn't persist */
  }
}

const LABEL: Record<Theme, string> = { light: "ライト", dark: "ダーク" };
const ICON_NAME: Record<Theme, string> = { light: "sun", dark: "moon" };
const ICON_SIZE = 22;

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
      #theme-toggle-btn {
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
      #theme-toggle-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
    `;
  document.head.appendChild(style);
}

function updateButton(): void {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  const t = effective();
  btn.innerHTML = icon(ICON_NAME[t], { size: ICON_SIZE });
  btn.title = `テーマ: ${LABEL[t]}（クリックで切替）`;
}

function toggle(): void {
  const next: Theme = effective() === "dark" ? "light" : "dark";
  persist(next);
  apply(next);
  updateButton();
}

function init(): void {
  injectStyle();
  const btn = document.createElement("button");
  btn.id = "theme-toggle-btn";
  getTopRightBar().appendChild(btn);
  btn.addEventListener("click", toggle);
  updateButton();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
