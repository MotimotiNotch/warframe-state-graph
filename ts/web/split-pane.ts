// Port of web/split-pane.js. Draggable folder/graph/detail panel resize.
// Generalized 2026-08-27 from 2 panes (graph|detail) to 3
// (folder|graph|detail) for the left-sidebar explorer — two independent
// resizers, each only aware of its own adjacent pane pair.

import { el } from "./dom.ts";
import { icon } from "./icons.ts";

const PANEL_WIDTH_KEY = "warframe-state-graph:panelWidths";

interface SavedPanelWidths {
  folderWidth?: number;
  graphWidth?: number;
  panelWidth?: number;
  /** エクスプローラー風の折りたたみ状態（2026-08-28）。#graph-panelは
   * flex:3 1 0なので、折りたたみ時に#folder-panel/#resizer-leftをdisplay:none
   * にするだけで空いた幅を自動的に吸収する——widthの再計算は不要。 */
  folderCollapsed?: boolean;
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

// .layout switches from row to column under this breakpoint (index.html).
// flex-basis is axis-dependent — a pixel width saved from the desktop 3-pane
// row layout (or even just the CSS default) would otherwise apply as a
// *height* once the main axis turns vertical, leaving a tall empty gap under
// a short build list (2026-08-28, real bug hit testing the sidebar-collapse
// toggle at a narrow width: #folder-panel rendered ~220px tall with mostly
// blank space before Chain View even though it only held 2 short rows).
// Clearing the inline flex-basis here lets #folder-panel/#panel fall back to
// the mobile media rule's `flex: 0 0 auto` (content-height, capped via
// #folder-panel's max-height) instead of leaking a desktop width in as
// height. Re-entering desktop width restores the saved/default pixel basis.
const MOBILE_MQ = window.matchMedia("(max-width: 800px)");

function applyLayoutForBreakpoint(): void {
  if (MOBILE_MQ.matches) {
    el("folder-panel").style.flex = "";
    el("panel").style.flex = "";
  } else {
    restorePanelWidths();
  }
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

function applySidebarCollapsed(collapsed: boolean): void {
  const folderPanel = el("folder-panel");
  folderPanel.classList.toggle("collapsed", collapsed);
  el("resizer-left").classList.toggle("collapsed", collapsed);
  if (collapsed) {
    // Same inline-style-always-wins issue as applyLayoutForBreakpoint()
    // above: restorePanelWidths()/a live resizer drag may have left an
    // inline `style.flex` (e.g. a dragged 400px) on #folder-panel, which
    // would silently defeat the .collapsed CSS rule's `flex: 0 0 auto` —
    // the rail rendered at the old dragged width instead of shrinking to
    // just the button (real bug hit right after building this, 2026-08-28).
    folderPanel.style.flex = "";
  } else if (!MOBILE_MQ.matches) {
    restorePanelWidths();
  }
  const btn = el("sidebar-toggle-btn");
  btn.innerHTML = icon(collapsed ? "panel-left-open" : "panel-left-close");
  btn.title = collapsed ? "ビルド一覧を表示" : "ビルド一覧を隠す";
}

function wireSidebarToggle(): void {
  const collapsed = loadSavedWidths().folderCollapsed ?? false;
  applySidebarCollapsed(collapsed);
  el("sidebar-toggle-btn").addEventListener("click", () => {
    const next = !el("folder-panel").classList.contains("collapsed");
    applySidebarCollapsed(next);
    saveWidths({ folderCollapsed: next });
  });
}

export function initResizer(): void {
  applyLayoutForBreakpoint();
  MOBILE_MQ.addEventListener("change", applyLayoutForBreakpoint);
  wireSidebarToggle();

  wireResizer("resizer-left", el("folder-panel"), el("graph-panel"), 160, 300, (folderWidth, graphWidth) => {
    saveWidths({ folderWidth, graphWidth });
  });
  wireResizer("resizer", el("graph-panel"), el("panel"), 300, 220, (graphWidth, panelWidth) => {
    saveWidths({ graphWidth, panelWidth });
  });
}
