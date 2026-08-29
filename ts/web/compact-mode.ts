// Compact/mini mode for the Chain View page only (2026-08-29, のっち依頼) —
// lets the tool stay usable in a small window. Two independent triggers
// feed the same `body.compact` class (see index.html's CSS):
//   - auto: window narrower than the existing 480px breakpoint (already
//     validated down to ~300px, see index.html's comment on that query)
//   - manual: this button, which force-pins compact mode ON even in a
//     wide window (for "I want less clutter" without resizing) — it does
//     NOT force compact OFF on a narrow window; auto always wins there,
//     since a genuinely small window needs the compact layout regardless
//     of what the user last clicked.
import { el } from "./dom.ts";
import { icon } from "./icons.ts";

const STORAGE_KEY = "warframe-state-graph:compact-override";
const mq = window.matchMedia("(max-width: 480px)");

let manualOverride = localStorage.getItem(STORAGE_KEY) === "1";

function apply(): void {
  document.body.classList.toggle("compact", manualOverride || mq.matches);
  el<HTMLButtonElement>("compact-toggle").classList.toggle("active", manualOverride);
}

el("compact-toggle").innerHTML = icon("minimize-2");
el("compact-toggle").addEventListener("click", () => {
  manualOverride = !manualOverride;
  try {
    if (manualOverride) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-browsing-style storage denial — the toggle still works for
    // this session, it just won't be remembered next launch.
  }
  apply();
});

mq.addEventListener("change", apply);
apply();
