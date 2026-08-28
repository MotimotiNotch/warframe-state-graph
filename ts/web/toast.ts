// Shared non-blocking toast notification (ADR05 — 05_ADR_Native_Dialog_Migration.md,
// Proposed 2026-08-26, implemented 2026-08-28 のっち依頼「全部モーダルに」).
// Replaces window.alert() across the app: a native alert() blocks the whole
// page's JS thread — including, notoriously, a browser-automation tab
// entirely (the confirm() incident that triggered the ADR; alert() blocks
// identically) — and its look never respects this app's theme/CSS variables.
//
// Single shared #toast-container (created lazily, reused across calls) so
// multiple toasts stack instead of replacing each other.
let container: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (!container || !document.body.contains(container)) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

/** kind "error" (validation/save-failure messages) auto-dismisses slower
 * than "success" — an error is worth a beat longer to actually read. Click
 * dismisses immediately either way. */
export function showToast(message: string, kind: "error" | "success" = "error"): void {
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  getContainer().appendChild(el);
  // rAF so the .show transition actually animates in (adding the class in
  // the same tick as append would skip the transition — starts "already on").
  requestAnimationFrame(() => el.classList.add("show"));
  const dismiss = (): void => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener("click", dismiss);
  setTimeout(dismiss, kind === "error" ? 4000 : 3000);
}
