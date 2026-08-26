// Port of web/graph-state.js. Shared state, API calls, toolbar/legend init.
// Types reused directly from the server side (Graph/NextActionReport) —
// this is the concrete payoff of the migration: the shape the frontend
// renders from and the shape the backend serializes are now the same
// declaration, not independently hand-typed copies that can drift.

import type { Graph } from "../server/model.ts";
import type { NextActionReport } from "../server/engine.ts";
import { el } from "./dom.ts";
import { icon, iconLabel } from "./icons.ts";
import { renderBreadcrumb } from "./graph-nav.ts";
import { renderGraph } from "./graph-render.ts";
import { renderPanel } from "./inspector.ts";

// graph-state.ts <-> graph-nav.ts/graph-render.ts/inspector.ts is a genuine
// circular import (those modules import `state` back from here). ES modules
// support this via hoisted, live bindings as long as nothing calls the
// imported function during top-level module evaluation — loadReport() below
// only calls these inside an async function invoked later (from main.ts's
// bootstrap), well after every module has finished initializing, so the
// cycle resolves cleanly. This mirrors the load-order comment structure the
// original script-tag version relied on, just made explicit via imports.

export const STATE_COLOR: Record<string, string> = {
  ROOT: "var(--root)",
  SATISFIED: "var(--satisfied)",
  ACTIONABLE: "var(--actionable)",
  BLOCKED: "var(--blocked)",
};
export const STATE_LABEL_JA: Record<string, string> = {
  SATISFIED: "達成済み",
  ACTIONABLE: "実行可能",
  BLOCKED: "前提待ち",
};

// "ノード追加" -> "新規ゴール" (2026-08-25, items 28/30): this button now only
// creates a bare Goal node with no Requires/Contains search UI (connections
// go through Inspector's add-prerequisite/add-contents buttons instead), so
// the label was renamed to match.
el("new-node-btn").innerHTML = iconLabel("plus", "新規ゴール");
el("new-node-btn").title = "新規ゴール";
el("wfcd-import-btn").innerHTML = iconLabel("refresh-cw", "WFCDから自動生成");
el("wfcd-import-btn").title = "WFCDから自動生成";
el("refresh-wfcd-btn").innerHTML = icon("refresh-cw");
el<HTMLButtonElement>("refresh-wfcd-btn").addEventListener("click", async () => {
  const btn = el<HTMLButtonElement>("refresh-wfcd-btn");
  btn.disabled = true;
  btn.classList.add("spinning");
  btn.title = "更新中…";
  await fetch("/api/wfcd/refresh", { method: "POST" });
  btn.classList.remove("spinning");
  btn.classList.add("success");
  btn.innerHTML = icon("check");
  btn.title = "更新完了";
  setTimeout(() => {
    btn.classList.remove("success");
    btn.innerHTML = icon("refresh-cw");
    btn.disabled = false;
    btn.title = "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください";
  }, 2000);
});

el("legend-toggle").innerHTML = icon("info");
(function setupLegendPopover() {
  const btn = el("legend-toggle");
  const pop = el("legend-popover");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.toggle("hidden");
  });
  pop.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => pop.classList.add("hidden"));
})();

// focus: the node Chain View is currently centered on (not necessarily a
// Build root). history: a "back" trail pushed every time focus moves
// (same model as browser/Obsidian note-to-note navigation). No breadcrumb-
// as-path — a true DAG (e.g. orokin-cell, referenced from multiple parents)
// has no single "correct" path, so a tree-shaped breadcrumb doesn't match
// the real data. Each view expands `contains` only one level (controlled in
// graph-layout.ts); `requires` is always fully expanded.
export interface AppState {
  graph: Graph | null;
  buildId: string | null;
  focus: string | null;
  history: string[];
  report: NextActionReport | null;
  selected: string | null;
}

export const state: AppState = {
  graph: null,
  buildId: null,
  focus: null,
  history: [],
  report: null,
  selected: null,
};

export async function loadGraph(): Promise<void> {
  await refreshGraph();
  populateBuildSelect();
}

// Used right after a toggle etc., when we want to refetch graph data only
// and keep focus/history intact.
export async function refreshGraph(): Promise<void> {
  const res = await fetch("/api/graph");
  state.graph = (await res.json()) as Graph;
}

export function populateBuildSelect(): void {
  const sel = el<HTMLSelectElement>("build-select");
  // Build was folded into Goal (2026-08-25 item 30, no longer creatable),
  // but existing data can still have Build-typed nodes — keep matching both
  // for backward compatibility.
  const builds = Object.values(state.graph!.nodes).filter((n) => n.type === "Build" || n.type === "Goal");
  sel.innerHTML = builds.map((n) => `<option value="${n.id}">${n.name}</option>`).join("");
  sel.onchange = () => {
    selectBuild(sel.value);
  };
  // A deep link from Loadouts/Collections' minigraph (?focus=<nodeId>,
  // 2026-08-26) always points at a Goal/Build node directly — every item's
  // chainViewNodeId/chainViewBuildId is the node representing the item
  // itself, never one of its `contains` sub-parts — so it's always one of
  // these `builds` options; no separate "drill down to a nested node" path
  // is needed. Falls back to the usual builds[0] default when absent/stale.
  const requested = new URLSearchParams(location.search).get("focus");
  const matched = !!requested && builds.some((n) => n.id === requested);
  const initial = (matched ? requested : builds[0]?.id) ?? null;
  if (initial) {
    sel.value = initial;
    selectBuild(initial);
    // selectBuild() itself clears state.selected (the normal "just switched
    // build, nothing picked yet" default) — a deep link should land with
    // the target already selected/shown in the Inspector, same as clicking
    // its node directly would, not just focused as the view root with
    // nothing picked. Set after selectBuild() (which already fired its own
    // async loadReport()) so this value is what's in place once that
    // fetch's renderPanel() call actually runs.
    if (matched) state.selected = initial;
  }
  // Consumed — drop it from the URL so a reload/bookmark doesn't keep
  // forcing this selection over whatever the user picks next.
  if (requested) {
    const url = new URL(location.href);
    url.searchParams.delete("focus");
    history.replaceState(null, "", url);
  }
}

export function selectBuild(buildId: string): void {
  state.buildId = buildId;
  state.focus = buildId;
  state.history = [];
  state.selected = null;
  void loadReport();
}

export async function loadReport(): Promise<void> {
  if (!state.focus) return;
  const res = await fetch(`/api/next-actions?build=${encodeURIComponent(state.focus)}`);
  if (!res.ok) return;
  state.report = (await res.json()) as NextActionReport;
  renderBreadcrumb();
  renderProgress();
  renderGraph();
  renderPanel();
}

function renderProgress(): void {
  const { done, total } = state.report!.progress;
  const pct = total ? Math.round((done / total) * 100) : 0;
  el("progress-fill").style.width = `${pct}%`;
  el("progress-label").textContent = `${done} / ${total} 完了（${pct}%）`;
}
