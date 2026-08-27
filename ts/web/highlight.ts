// Shared "flash an outline around this element" animation. Originally lived
// only in manual.ts (used to point at a button in its window.opener); moved
// here 2026-08-27 so quest-onboarding.ts can reuse the same effect on the
// current page's own manual-launcher-btn instead of duplicating it.
//
// Calling this again on the same target while a previous flash is still
// running cancels-and-restores the old one first before starting anew — two
// overlapping timers would each capture their own (mutually stale)
// "original" outline to restore to, leaving the outline stuck on whichever
// finished last (real bug hit via locate-btn mashing in manual.ts).
const active = new WeakMap<HTMLElement, { timer: number; prevOutline: string; prevOffset: string }>();

export function flashHighlight(target: HTMLElement): void {
  // target.ownerDocument.defaultView is the window that actually owns the
  // element — the current page for a same-window call, the opener for
  // manual.ts's cross-window call — so both getComputedStyle (reads that
  // window's --accent) and the timer naturally scope to the right window.
  const win = target.ownerDocument.defaultView ?? window;

  const existing = active.get(target);
  if (existing) {
    win.clearInterval(existing.timer);
    target.style.outline = existing.prevOutline;
    target.style.outlineOffset = existing.prevOffset;
    active.delete(target);
  }

  const accent = win.getComputedStyle(win.document.documentElement).getPropertyValue("--accent").trim() || "#f6ddaa";
  const prevOutline = target.style.outline;
  const prevOffset = target.style.outlineOffset;
  target.style.outlineOffset = "2px";
  let on = true;
  let ticks = 0;
  const timer = win.setInterval(() => {
    on = !on;
    target.style.outline = on ? `2px solid ${accent}` : "2px solid transparent";
    ticks++;
    if (ticks >= 6) {
      win.clearInterval(timer);
      target.style.outline = prevOutline;
      target.style.outlineOffset = prevOffset;
      active.delete(target);
    }
  }, 280);
  target.style.outline = `2px solid ${accent}`;
  active.set(target, { timer, prevOutline, prevOffset });
}
