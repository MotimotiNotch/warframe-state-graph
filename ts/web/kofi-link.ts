// Ko-fi support link in the shared top-right-bar (2026-08-29, のっち依頼) —
// this tool is free + Ko-fi tips (see the monetization notes in the project
// MOC). Same simple icon-only pattern as theme.ts, but an
// external <a> link rather than a state-toggling <button>.
import { getTopRightBar, icon } from "./icons.ts";

const KOFI_URL = "https://ko-fi.com/motimotinotch";

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
      #kofi-link-btn {
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
      #kofi-link-btn:hover { border-color: #ff5e5b; color: #ff5e5b; }
    `;
  document.head.appendChild(style);
}

function init(): void {
  injectStyle();
  const link = document.createElement("a");
  link.id = "kofi-link-btn";
  link.href = KOFI_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "Ko-fiで支援する";
  link.innerHTML = icon("heart", { size: 22 });
  getTopRightBar().appendChild(link);
}

init();
