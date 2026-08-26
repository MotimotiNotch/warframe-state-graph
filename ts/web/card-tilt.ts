// Port of web/card-tilt.js. 3D hover-tilt effect for equipment cards
// (2026-08-21). Targets Loadouts/Collections' card grids (.item-card/
// .buildset-card/.card-v2, plus the "+" add-card). These cards get their
// innerHTML rebuilt wholesale on every render(), so per-element listeners
// would need rewiring on every redraw; this uses document-level event
// delegation instead (closest() finds the hovered card each time, no
// rebinding needed as the DOM regenerates).
//
// Perf note: transform (perspective+rotateX/rotateY) is GPU-composited only,
// no reflow/repaint. mousemove itself is throttled via requestAnimationFrame
// — only the currently-hovered card's transform is ever recomputed, so cost
// doesn't grow with grid size.
const SELECTOR = ".item-card, .buildset-card, .card-v2, .add-card";
const MAX_TILT_DEG = 8;
// Any operation the user is actually performing inside a card — toggling a
// favorite star, switching a MOD config tab, deleting/adding a MOD, typing —
// is hard to do accurately while the card visually rotates under the
// pointer. Rule (2026-08-26, generalized from the .card-memo exemption
// already in place since 2026-08-23): tilt is suppressed over any
// interactive control inside a card, not just the memo field.
const NO_TILT_SELECTOR = ".card-memo, button, input, select, textarea, .tab, .mod-tag";

let rafId: number | null = null;
let pending: { card: HTMLElement; x: number; y: number } | null = null;

function applyTilt(card: HTMLElement, clientX: number, clientY: number): void {
  const rect = card.getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width - 0.5;
  const py = (clientY - rect.top) / rect.height - 0.5;
  const rotateY = px * MAX_TILT_DEG * 2;
  const rotateX = -py * MAX_TILT_DEG * 2;
  card.style.transform = `perspective(600px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
}

function resetTilt(card: HTMLElement): void {
  card.style.transform = "";
}

document.addEventListener("mousemove", (e) => {
  const target = e.target as HTMLElement | null;
  const card = target?.closest<HTMLElement>(SELECTOR);
  if (!card) return;
  if (target?.closest(NO_TILT_SELECTOR)) {
    pending = null;
    resetTilt(card);
    return;
  }
  pending = { card, x: e.clientX, y: e.clientY };
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    if (pending) applyTilt(pending.card, pending.x, pending.y);
    rafId = null;
    pending = null;
  });
});

// mouseleave can't be delegated (doesn't bubble); the bubbling mouseout is
// used instead, checking relatedTarget to tell "actually left the card".
document.addEventListener("mouseout", (e) => {
  const target = e.target as HTMLElement | null;
  const card = target?.closest<HTMLElement>(SELECTOR);
  if (!card) return;
  const related = e.relatedTarget as Node | null;
  if (related && card.contains(related)) return;
  resetTilt(card);
});
