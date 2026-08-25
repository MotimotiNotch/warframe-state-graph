// Port of web/graph-layout.js. BFS layout computation and the two
// completion-tracking helpers layout/rendering share.

import type { NextActionReport } from "../server/engine.ts";
import { state, STATE_COLOR } from "./graph-state.ts";

export interface LayoutEdge {
  from: string;
  to: string;
  kind: "contains" | "requires";
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface Layout {
  positions: Record<string, LayoutPosition>;
  edges: LayoutEdge[];
  width: number;
  height: number;
}

// BFS-expands from the current view's root (buildId) to compute a tiered
// layout (depth = row). `requires` is always fully expanded (the Next
// Action prerequisite chain must always be visible). `contains` expands only
// one level below the root — deeper nesting (a child that itself has
// `contains`) isn't shown in this view; it only appears after drilling down
// by clicking that child. Without this cap, self-similar nesting
// (A -> B[A' -> B' -> C'] -> C etc.) would expand unboundedly onto one
// screen.
export function computeLayout(report: NextActionReport): Layout {
  const nodes = report.nodes;
  const buildId = report.buildId;
  const depth: Record<string, number> = { [buildId]: 0 };
  const edges: LayoutEdge[] = [];
  const queue: string[] = [buildId];
  const visited = new Set([buildId]);

  while (queue.length) {
    const id = queue.shift();
    if (id === undefined) continue;
    const node = nodes[id];
    if (!node) continue;
    const containsOpen = id === buildId;
    const children: { id: string; kind: "contains" | "requires" }[] = [
      ...(containsOpen ? (node.contains ?? []).map((c) => ({ id: c, kind: "contains" as const })) : []),
      ...(node.requires ?? []).map((c) => ({ id: c, kind: "requires" as const })),
    ];
    for (const { id: childId, kind } of children) {
      edges.push({ from: id, to: childId, kind });
      if (!visited.has(childId)) {
        visited.add(childId);
        depth[childId] = (depth[id] ?? 0) + 1;
        queue.push(childId);
      }
    }
  }

  const byDepth: Record<number, string[]> = {};
  for (const id of Object.keys(depth)) {
    const d = depth[id]!;
    (byDepth[d] ??= []).push(id);
  }

  // Narrow-window support (2026-08-19): tighten node spacing on small
  // screens so the visible area gets closer to "roughly one column" of
  // density. #graph-wrap is already horizontally scrollable
  // (overflow: auto), but tightening spacing too means more rows are
  // visible at the same screen width.
  const compact = window.innerWidth < 480;
  const colWidth = compact ? 110 : 150;
  const rowHeight = compact ? 78 : 100;
  const marginX = compact ? 40 : 80;
  const marginY = compact ? 30 : 50;
  const positions: Record<string, LayoutPosition> = {};
  const depths = Object.keys(byDepth)
    .map(Number)
    .sort((a, b) => a - b);
  let maxCols = 1;
  for (const d of depths) {
    const ids = byDepth[d]!;
    maxCols = Math.max(maxCols, ids.length);
    ids.forEach((id, i) => {
      positions[id] = { x: marginX + i * colWidth, y: marginY + d * rowHeight };
    });
  }

  return {
    positions,
    edges,
    width: marginX * 2 + maxCols * colWidth,
    height: marginY * 2 + depths.length * rowHeight,
  };
}

export interface Completion {
  done: number;
  total: number;
}

// Counts completion of `contains` descendants only (recursive, `requires`
// not included). nodeId's own `satisfied` never tracks its contains
// children's state by design (flat-DAG principle decided in the first
// design pass: `contains` is display grouping only) — this is a secondary
// indicator to avoid the visual misread of "body satisfied but contents
// incomplete".
export function containsCompletion(
  report: NextActionReport,
  nodeId: string,
  seen: Set<string> = new Set(),
): Completion {
  if (seen.has(nodeId)) return { done: 0, total: 0 };
  seen.add(nodeId);
  const node = report.nodes[nodeId];
  if (!node) return { done: 0, total: 0 };
  let done = 0;
  let total = 0;
  for (const childId of node.contains ?? []) {
    const child = report.nodes[childId];
    if (!child) continue;
    total += 1;
    if (child.satisfied) done += 1;
    const sub = containsCompletion(report, childId, seen);
    done += sub.done;
    total += sub.total;
  }
  return { done, total };
}

export function nodeColor(id: string): string {
  if (id === state.report!.buildId) return STATE_COLOR.ROOT!;
  const view = state.report!.nodes[id];
  return (view && STATE_COLOR[view.state]) || "var(--muted)";
}
