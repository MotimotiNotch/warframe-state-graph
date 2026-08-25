// Port of web/scroll-top.js. Floating "back to top" button, shown only past
// a scroll threshold.
import { icon } from "./icons.ts";

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
      #scroll-top-btn {
        position: fixed; right: 16px; bottom: 16px; z-index: 140;
        display: none; align-items: center; justify-content: center;
        width: 40px; height: 40px; border-radius: 50%;
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur, 5px)); -webkit-backdrop-filter: blur(var(--panel-blur, 5px));
        border: 1px solid var(--border, #2a2e3a); color: var(--muted, #9aa0ab);
        cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        transition: border-color 0.15s, color 0.15s;
      }
      #scroll-top-btn.visible { display: flex; }
      #scroll-top-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
    `;
  document.head.appendChild(style);
}

const SHOW_AFTER_PX = 150;

function init(): void {
  injectStyle();

  const btn = document.createElement("button");
  btn.id = "scroll-top-btn";
  btn.title = "一番上に戻る";
  btn.innerHTML = icon("chevron-up", { size: 20 });
  document.body.appendChild(btn);

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  function onScroll(): void {
    btn.classList.toggle("visible", window.scrollY > SHOW_AFTER_PX);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
