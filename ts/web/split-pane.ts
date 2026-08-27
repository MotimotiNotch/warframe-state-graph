// Port of web/split-pane.js. Draggable folder/graph/detail panel resize.
// Generalized 2026-08-27 from 2 panes (graph|detail) to 3
// (folder|graph|detail) for the left-sidebar explorer — two independent
// resizers, each only aware of its own adjacent pane pair.

import { el } from "./dom.ts";

const PANEL_WIDTH_KEY = "warframe-state-graph:panelWidths";

interface SavedPanelWidths {
  folderWidth?: number;
  graphWidth?: number;
  panelWidth?: number;
}

// Saved to localStorage so the ratios survive a reload. This is a
// UI-preference-only memory with nothing to send server-side, so plain
// localStorage is more natural than a cookie.
function loadSavedWidths(): SavedPanelWidths {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    return raw ? (JSON.parse(raw) as SavedPanelWidths) : {};
  } catch {
    return {};
  }
}

// Merges into whatever's already stored so one resizer's drag doesn't clobber
// the width the *other* resizer last saved for the pane it doesn't touch.
function saveWidths(next: SavedPanelWidths): void {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, JSON.stringify({ ...loadSavedWidths(), ...next }));
  } catch {
    /* not fatal even if localStorage is unavailable */
  }
}

function restorePanelWidths(): void {
  const saved = loadSavedWidths();
  if (typeof saved.folderWidth === "number") el("folder-panel").style.flex = `0 0 ${saved.folderWidth}px`;
  if (typeof saved.graphWidth === "number") el("graph-panel").style.flex = `0 0 ${saved.graphWidth}px`;
  if (typeof saved.panelWidth === "number") el("panel").style.flex = `0 0 ${saved.panelWidth}px`;
}

/** Wires one resizer that trades width between its two adjacent panes only
 * (not the whole layout — with 3 panes now, `graph-panel` isn't necessarily
 * flush against the layout's left edge, so each drag must measure from its
 * own `leftEl`'s bounding rect rather than the old 2-pane version's
 * `.layout` rect). `onCommit` persists the two final pixel widths once the
 * drag ends. */
function wireResizer(
  resizerId: string,
  leftEl: HTMLElement,
  rightEl: HTMLElement,
  minLeft: number,
  minRight: number,
  onCommit: (leftWidth: number, rightWidth: number) => void,
): void {
  const resizer = el(resizerId);

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizer.classList.add("dragging");
    const leftRect = leftEl.getBoundingClientRect();
    const available = leftRect.width + rightEl.getBoundingClientRect().width;
    let lastLeftWidth: number | undefined;
    let lastRightWidth: number | undefined;

    function onMove(moveEvt: MouseEvent): void {
      let leftWidth = moveEvt.clientX - leftRect.left;
      leftWidth = Math.max(minLeft, Math.min(leftWidth, available - minRight));
      const rightWidth = available - leftWidth;

      leftEl.style.flex = `0 0 ${leftWidth}px`;
      rightEl.style.flex = `0 0 ${rightWidth}px`;
      lastLeftWidth = leftWidth;
      lastRightWidth = rightWidth;
    }
    function onUp(): void {
      resizer.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (lastLeftWidth !== undefined && lastRightWidth !== undefined) {
        onCommit(lastLeftWidth, lastRightWidth);
      }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

export function initResizer(): void {
  restorePanelWidths();

  wireResizer("resizer-left", el("folder-panel"), el("graph-panel"), 160, 300, (folderWidth, graphWidth) => {
    saveWidths({ folderWidth, graphWidth });
  });
  wireResizer("resizer", el("graph-panel"), el("panel"), 300, 220, (graphWidth, panelWidth) => {
    saveWidths({ graphWidth, panelWidth });
  });
}
