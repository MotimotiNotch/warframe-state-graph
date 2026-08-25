// Port of web/split-pane.js. Draggable left/right panel resize.

import { el } from "./dom.ts";

const PANEL_WIDTH_KEY = "warframe-state-graph:panelWidths";

interface SavedPanelWidths {
  graphWidth: number;
  panelWidth: number;
}

// Saved to localStorage so the ratio survives a reload. This is a
// UI-preference-only memory with nothing to send server-side, so plain
// localStorage is more natural than a cookie.
function savePanelWidths(graphWidth: number, panelWidth: number): void {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, JSON.stringify({ graphWidth, panelWidth }));
  } catch {
    /* not fatal even if localStorage is unavailable */
  }
}

function restorePanelWidths(): void {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as SavedPanelWidths;
    if (!saved) return;
    el("graph-panel").style.flex = `0 0 ${saved.graphWidth}px`;
    el("panel").style.flex = `0 0 ${saved.panelWidth}px`;
  } catch {
    /* ignore a corrupt saved value and keep the default */
  }
}

export function initResizer(): void {
  const layout = document.querySelector<HTMLElement>(".layout")!;
  const graphPanel = el("graph-panel");
  const panel = el("panel");
  const resizer = el("resizer");

  restorePanelWidths();

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizer.classList.add("dragging");
    const layoutRect = layout.getBoundingClientRect();
    const resizerWidth = resizer.getBoundingClientRect().width;
    let lastGraphWidth: number | undefined;
    let lastPanelWidth: number | undefined;

    function onMove(moveEvt: MouseEvent) {
      const minGraph = 300;
      const minPanel = 220;
      const available = layoutRect.width - resizerWidth;
      let graphWidth = moveEvt.clientX - layoutRect.left;
      graphWidth = Math.max(minGraph, Math.min(graphWidth, available - minPanel));
      const panelWidth = available - graphWidth;

      graphPanel.style.flex = `0 0 ${graphWidth}px`;
      panel.style.flex = `0 0 ${panelWidth}px`;
      lastGraphWidth = graphWidth;
      lastPanelWidth = panelWidth;
    }
    function onUp() {
      resizer.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (lastGraphWidth !== undefined && lastPanelWidth !== undefined) {
        savePanelWidths(lastGraphWidth, lastPanelWidth);
      }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
