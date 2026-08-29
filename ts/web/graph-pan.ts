// Hand-tool drag-to-pan for the Chain View graph area (2026-08-29, のっち
//依頼) — #graph-wrap is already natively scrollable (overflow:auto in
// index.html), this adds click-and-drag panning on top of that, the way
// image viewers/map apps do. Cursor feedback (grab/grabbing) is pure CSS
// (#graph-wrap / #graph-wrap:active in index.html) — nothing to toggle
// here, just the scroll math.
//
// mousemove/mouseup listen on window, not #graph-wrap, so a drag that
// briefly leaves the wrap's bounds (fast mouse movement) keeps panning
// instead of stopping dead at the edge.
import { el } from "./dom.ts";

const wrap = el<HTMLDivElement>("graph-wrap");

let dragging = false;
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let startScrollTop = 0;

wrap.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // left button only — leave right/middle-click alone
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  startScrollLeft = wrap.scrollLeft;
  startScrollTop = wrap.scrollTop;
  // Suppresses native text-selection/drag-ghost while dragging over node
  // labels — doesn't cancel the click event a plain (non-dragged) click
  // still needs for node selection.
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  wrap.scrollLeft = startScrollLeft - (e.clientX - startX);
  wrap.scrollTop = startScrollTop - (e.clientY - startY);
});

window.addEventListener("mouseup", () => {
  dragging = false;
});
