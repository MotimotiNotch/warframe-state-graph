// Port of web/graph-nav.js. Focus+history navigation, hover flyout shortcuts,
// breadcrumb rendering.

import { el as domEl } from "./dom.ts";
import { state, loadReport } from "./graph-state.ts";
import { containsCompletion } from "./graph-layout.ts";

interface FlyoutItem {
  id: string;
  name: string;
  depth?: number;
  satisfied?: boolean;
  clickable?: boolean;
}

// Single-chain auto-flattening was tried and dropped (confirmed via testing
// that clicking/backing out one level at a time per step is the expected
// behavior). Clicking a node moves focus straight to it.
// Finds the intermediate nodes on the `contains` path between the current
// focus and nodeId (so a flyout shortcut jump that skips multiple levels
// still leaves the actually-traversed intermediates in the breadcrumb). A
// normal one-level click returns an empty array.
function ancestorsBetweenFocusAnd(nodeId: string): string[] {
  const parentOf: Record<string, string> = {};
  const seen = new Set<string>();
  (function walk(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    const node = state.report!.nodes[id];
    if (!node) return;
    for (const childId of node.contains ?? []) {
      if (!(childId in parentOf)) parentOf[childId] = id;
      walk(childId);
    }
  })(state.focus!);

  const path: string[] = [];
  let cur: string | undefined = nodeId;
  while (cur !== state.focus && cur !== undefined && parentOf[cur] !== undefined) {
    path.unshift(cur);
    cur = parentOf[cur];
  }
  return path.slice(0, -1); // exclude nodeId itself, keep only the intermediates
}

export function focusOn(nodeId: string): void {
  const intermediates = ancestorsBetweenFocusAnd(nodeId);
  state.history.push(state.focus!, ...intermediates);
  state.focus = nodeId;
  state.selected = nodeId; // keep the destination node's info visible in Inspector
  void loadReport();
}

// Jumps straight back to a point mid-trail (used by the history hover list).
export function jumpToHistory(index: number): void {
  state.focus = state.history[index] ?? null;
  state.history = state.history.slice(0, index);
  state.selected = state.focus;
  void loadReport();
}

// Recursively walks `contains` descendants and collects branch points.
// state.report.nodes already contains every descendant of the current focus
// (rendering just caps display at one level), so this needs no extra API
// call. Lists every descendant (leaves included, so the flyout can double as
// a completion checklist), but only nodes that are themselves nested
// (have `contains`) are clickable jump targets. The completion dot reflects
// "are all of this node's contents done" rather than its own `satisfied`
// (which is an independent flag, so using it directly would miss "body
// satisfied but contents incomplete").
export function collectDescendants(nodeId: string, depth = 0, seen: Set<string> = new Set()): FlyoutItem[] {
  if (seen.has(nodeId)) return [];
  seen.add(nodeId);
  const node = state.report!.nodes[nodeId];
  if (!node) return [];
  let results: FlyoutItem[] = [];
  for (const childId of node.contains ?? []) {
    const child = state.report!.nodes[childId];
    if (!child) continue;
    if ((child.contains?.length ?? 0) > 0) {
      const c = containsCompletion(state.report!, childId);
      const satisfied = c.total > 0 && c.done === c.total;
      results.push({ id: childId, name: child.name, depth, satisfied, clickable: true });
    }
    results = results.concat(collectDescendants(childId, depth + 1, seen));
  }
  return results;
}

let flyoutHideTimer: ReturnType<typeof setTimeout> | undefined;

export function showFlyout(
  anchorEl: Element,
  label: string,
  items: FlyoutItem[],
  onPick: (item: FlyoutItem) => void,
): void {
  clearTimeout(flyoutHideTimer);
  const flyout = domEl("flyout");
  if (!items.length) {
    flyout.classList.add("hidden");
    return;
  }

  flyout.innerHTML =
    `<div class="flyout-label">${label}</div>` +
    items
      .map((it, i) => {
        // Same dot language as the legend/graph (blue = Satisfied), not a
        // separate check/box glyph.
        const dot =
          it.satisfied === undefined
            ? ""
            : `<i class="dot" style="background:${it.satisfied ? "var(--satisfied)" : "var(--border)"}"></i> `;
        const clickable = it.clickable !== false; // callers with no field set default to fully clickable
        const cls = `item${clickable ? "" : " not-clickable"}`;
        // Cap the visual indent so deep nesting can't blow out horizontally
        // (the real depth isn't lost, just the indent width) — past the cap,
        // show the numeric depth instead since the indent alone stops being
        // legible.
        const depth = it.depth ?? 0;
        const capped = 6;
        const indent = "　".repeat(Math.min(depth, capped));
        const depthTag = depth >= capped ? `<span class="depth-tag">D${depth}</span> ` : "";
        return `<div class="${cls}" data-i="${i}" title="${it.name}">${indent}${depthTag}${dot}${it.name}</div>`;
      })
      .join("");

  const panelRect = domEl("graph-panel").getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();
  flyout.classList.remove("hidden");

  // Keep it inside the parent panel even when many nested items make the
  // list grow tall/wide.
  const flyoutW = flyout.offsetWidth;
  const flyoutH = flyout.offsetHeight;
  let left = anchorRect.left - panelRect.left + anchorRect.width / 2;
  let top = anchorRect.bottom - panelRect.top + 6;
  left = Math.min(left, panelRect.width - flyoutW - 4);
  left = Math.max(left, 4);
  if (top + flyoutH > panelRect.height) {
    top = anchorRect.top - panelRect.top - flyoutH - 6; // flip above the node if it doesn't fit below
  }
  flyout.style.left = `${left}px`;
  flyout.style.top = `${top}px`;

  flyout.querySelectorAll(".item:not(.not-clickable)").forEach((itemEl) => {
    itemEl.addEventListener("click", () => {
      const idx = Number((itemEl as HTMLElement).dataset.i);
      const item = items[idx];
      if (item) onPick(item);
      hideFlyout();
    });
  });
  flyout.onmouseenter = () => clearTimeout(flyoutHideTimer);
  flyout.onmouseleave = scheduleHideFlyout;
}

export function scheduleHideFlyout(): void {
  flyoutHideTimer = setTimeout(hideFlyout, 150);
}

export function hideFlyout(): void {
  domEl("flyout").classList.add("hidden");
}

// The breadcrumb isn't a path display, just "where am I" + "back". The
// internal model (focus + history) doesn't change, only the display is
// always-breadcrumb. state.history is already the visited-order trail from
// the Build root to the current position; middle crumbs jump directly on
// click.
export function renderBreadcrumb(): void {
  const breadcrumbEl = domEl("breadcrumb");
  const trail = [...state.history, state.focus];
  breadcrumbEl.innerHTML = trail
    .map((id, i) => {
      const isLast = i === trail.length - 1;
      const name = (id ? state.graph!.nodes[id]?.name : undefined) ?? id ?? "";
      const cls = isLast ? "crumb current" : "crumb";
      return `<span class="${cls}" data-idx="${i}">${name}</span>`;
    })
    .join(`<span class="sep">▸</span>`);

  breadcrumbEl.querySelectorAll(".crumb:not(.current)").forEach((elm) => {
    elm.addEventListener("click", () => jumpToHistory(Number((elm as HTMLElement).dataset.idx)));
  });
}
