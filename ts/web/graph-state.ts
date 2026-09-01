// Port of web/graph-state.js. Shared state, API calls, toolbar/legend init.
// Types reused directly from the server side (Graph/NextActionReport) —
// this is the concrete payoff of the migration: the shape the frontend
// renders from and the shape the backend serializes are now the same
// declaration, not independently hand-typed copies that can drift.

import type { Graph } from "../server/model.ts";
import type { NextActionReport } from "../server/engine.ts";
import { el } from "./dom.ts";
import { icon, iconLabel } from "./icons.ts";
import { initSidebar, refreshSidebar } from "./build-sidebar.ts";
import { renderBreadcrumb } from "./graph-nav.ts";
import { renderGraph } from "./graph-render.ts";
import { renderPanel } from "./inspector.ts";
import { initWfcdRefresh } from "./wfcd-refresh.ts";
import { applyI18nText, effective, onLocaleChange } from "./locale.ts";

// graph-state.ts <-> graph-nav.ts/graph-render.ts/inspector.ts/build-sidebar.ts
// is a genuine circular import (those modules import `state` back from
// here). ES modules
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
const STATE_LABELS: Record<"ja" | "en", Record<string, string>> = {
  ja: { SATISFIED: "達成済み", ACTIONABLE: "実行可能", BLOCKED: "前提待ち" },
  en: { SATISFIED: "Satisfied", ACTIONABLE: "Actionable", BLOCKED: "Blocked" },
};
/** State label in the current display language (was a plain JA-only constant
 * before the i18n rollout, hence the callers' `?? node.state` fallback). */
export function stateLabel(state: string): string {
  return STATE_LABELS[effective()][state] ?? state;
}

interface ToolbarStrings {
  [key: string]: string;
  newGoal: string;
  wfcdImport: string;
  dslImport: string;
  dslImportTitle: string;
  refreshUpdating: string;
  refreshDone: string;
  refreshTitle: string;
  compactToggleTitle: string;
  legendTitle: string;
  legendBuild: string;
  legendActionable: string;
  legendBlocked: string;
  legendSatisfied: string;
  legendEdges: string;
  legendDrillable: string;
  legendSpoilerWarning: string;
  goalListTitle: string;
  newFolderTitle: string;
  dragToResize: string;
  detailsTitle: string;
  selectNodePrompt: string;
  progressDone: string;
  modalTypeLabel: string;
  modalIdLabel: string;
  modalNameLabel: string;
  modalRequiresLabel: string;
  modalContainsLabel: string;
  modalSearchPlaceholder: string;
  modalMemoLabel: string;
  modalMasteryTrack: string;
  modalDelete: string;
  modalCancel: string;
  modalSave: string;
  wfcdModalTitle: string;
  wfcdNameLabel: string;
  wfcdNamePlaceholder: string;
  wfcdFetchBtn: string;
  wfcdClose: string;
  wfcdImportConfirm: string;
  dslModalTitle: string;
  dslSyntaxHint: string;
  dslAiHint: string;
  dslAiCopyBtn: string;
  dslInputPlaceholder: string;
  dslPreviewBtn: string;
  folderNameLabel: string;
}

export const TOOLBAR_STRINGS: Record<"ja" | "en", ToolbarStrings> = {
  ja: {
    newGoal: "新規ゴール",
    wfcdImport: "WFCDから自動生成",
    dslImport: "テキストから一括生成",
    dslImportTitle: "テキストから一括生成（上級者モード）",
    refreshUpdating: "更新中…",
    refreshDone: "更新完了",
    refreshTitle: "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください",
    compactToggleTitle: "コンパクト表示（狭いウィンドウ幅では自動でも切り替わります）",
    legendTitle: "凡例",
    legendBuild: "Build（目標）",
    legendActionable: "Actionable（実行可能）",
    legendBlocked: "Blocked（前提待ち）",
    legendSatisfied: "Satisfied（達成済み）",
    legendEdges: "― 中身（contains） / ┄ 前提（requires）",
    legendDrillable: "中身アリ（クリックでドリルダウン）",
    legendSpoilerWarning: "⚠️ クエスト名・リッチ系武器名など未プレイのコンテンツ名が表示されることがあります",
    goalListTitle: "目標一覧",
    newFolderTitle: "新規フォルダ",
    dragToResize: "ドラッグして比率を変更",
    detailsTitle: "詳細",
    selectNodePrompt: "ノードを選択してください",
    progressDone: "完了",
    modalTypeLabel: "種別",
    modalIdLabel: "ID（英数字・ハイフン、既存IDを指定すると上書き）",
    modalNameLabel: "名前",
    modalRequiresLabel: "前提（Requires、名前で検索して追加）",
    modalContainsLabel: "中身（Contains、名前で検索して追加）",
    modalSearchPlaceholder: "ノード名で検索してEnter",
    modalMemoLabel: "メモ",
    modalMasteryTrack: "マスタリー担当パーツ（Zaw Strike/Kitgun Chamber/Amp Prism等、メッキ加工必須）",
    modalDelete: "削除",
    modalCancel: "キャンセル",
    modalSave: "保存",
    wfcdModalTitle: "WFCDから自動生成",
    wfcdNameLabel: "名前（キーワードで絞り込み）",
    wfcdNamePlaceholder: "例: Braton Prime",
    wfcdFetchBtn: "候補を取得",
    wfcdClose: "閉じる",
    wfcdImportConfirm: "この内容でグラフに追加",
    dslModalTitle: "テキストから一括生成（上級者モード）",
    dslSyntaxHint:
      "<code>A -&gt; B</code>＝「AはBが前提」、<code>A -&gt; [B -&gt; C]</code>＝「Aの中身にB、BはCが前提」、<code>,</code>区切りで複数のチェーンをまとめて書けます。同じ名前は同一ノードとして扱われます。チェーンの先頭（他のどこからも参照されない名前）だけが左上プルダウンから辿れる探索起点になります。",
    dslAiHint: "複雑な内容はChatGPT等のAIに下書きしてもらえます。ボタンでAI用の説明をコピーし、チャットに貼り付けて「〜を表すDSLを書いて」と頼んでください。",
    dslAiCopyBtn: "AI用の説明をコピー",
    dslInputPlaceholder: "例: フレーム入手 -> [パーツA -> パーツA用レリック開封], フレーム入手 -> パーツB",
    dslPreviewBtn: "プレビュー",
    folderNameLabel: "フォルダ名",
  },
  en: {
    newGoal: "New goal",
    wfcdImport: "Generate from WFCD",
    dslImport: "Bulk-create from text",
    dslImportTitle: "Bulk-create from text (advanced)",
    refreshUpdating: "Updating…",
    refreshDone: "Done",
    refreshTitle: "Press this when new frames/weapons added by a game update aren't showing up as candidates",
    compactToggleTitle: "Compact view (also switches automatically at narrow window widths)",
    legendTitle: "Legend",
    legendBuild: "Build (goal)",
    legendActionable: "Actionable",
    legendBlocked: "Blocked (waiting on prerequisites)",
    legendSatisfied: "Satisfied",
    legendEdges: "― contains / ┄ requires",
    legendDrillable: "Has contents (click to drill down)",
    legendSpoilerWarning: "⚠️ Names of content you haven't played yet (quests, Lich-type weapons, etc.) may be shown",
    goalListTitle: "Goals",
    newFolderTitle: "New folder",
    dragToResize: "Drag to resize",
    detailsTitle: "Details",
    selectNodePrompt: "Select a node",
    progressDone: "done",
    modalTypeLabel: "Type",
    modalIdLabel: "ID (alphanumerics and hyphens; an existing ID overwrites that node)",
    modalNameLabel: "Name",
    modalRequiresLabel: "Requires (search by name to add)",
    modalContainsLabel: "Contains (search by name to add)",
    modalSearchPlaceholder: "Search by node name, then Enter",
    modalMemoLabel: "Memo",
    modalMasteryTrack: "Mastery-bearing part (Zaw Strike / Kitgun Chamber / Amp Prism etc. — gilding required)",
    modalDelete: "Delete",
    modalCancel: "Cancel",
    modalSave: "Save",
    wfcdModalTitle: "Generate from WFCD",
    wfcdNameLabel: "Name (type to filter)",
    wfcdNamePlaceholder: "e.g. Braton Prime",
    wfcdFetchBtn: "Fetch candidates",
    wfcdClose: "Close",
    wfcdImportConfirm: "Add this to the graph",
    dslModalTitle: "Bulk-create from text (advanced)",
    dslSyntaxHint:
      "<code>A -&gt; B</code> = \"A requires B\"; <code>A -&gt; [B -&gt; C]</code> = \"A contains B, and B requires C\"; separate multiple chains with <code>,</code>. Identical names are treated as the same node. Only the head of a chain (a name never referenced from anywhere else) becomes an entry point reachable from the list at the top left.",
    dslAiHint: "For anything complex, have an AI like ChatGPT draft it. Use the button to copy an explanation for the AI, paste it into the chat, and ask it to \"write the DSL for ...\".",
    dslAiCopyBtn: "Copy the explanation for an AI",
    dslInputPlaceholder: "e.g. Get the frame -> [Part A -> Crack Part A's relic], Get the frame -> Part B",
    dslPreviewBtn: "Preview",
    folderNameLabel: "Folder name",
  },
};

function tb(): ToolbarStrings {
  return TOOLBAR_STRINGS[effective()];
}

// "ノード追加" -> "新規ゴール" (2026-08-25, items 28/30): this button now only
// creates a bare Goal node with no Requires/Contains search UI (connections
// go through Inspector's add-prerequisite/add-contents buttons instead), so
// the label was renamed to match.
function applyToolbarLabels(): void {
  el("new-node-btn").innerHTML = iconLabel("plus", tb().newGoal);
  el("new-node-btn").title = tb().newGoal;
  el("wfcd-import-btn").innerHTML = iconLabel("refresh-cw", tb().wfcdImport);
  el("wfcd-import-btn").title = tb().wfcdImport;
  el("dsl-import-btn").innerHTML = iconLabel("code", tb().dslImport);
  el("dsl-import-btn").title = tb().dslImportTitle;
}
applyToolbarLabels();
onLocaleChange(() => {
  applyToolbarLabels();
  applyI18nText(TOOLBAR_STRINGS);
  if (state.report) {
    renderBreadcrumb();
    renderProgress();
    renderGraph();
    renderPanel();
  }
  refreshSidebar();
});
applyI18nText(TOOLBAR_STRINGS);

initWfcdRefresh({
  labels: () => ({ updating: tb().refreshUpdating, done: tb().refreshDone, title: tb().refreshTitle }),
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
  await initSidebar();
}

// Used right after a toggle etc., when we want to refetch graph data only
// and keep focus/history intact.
export async function refreshGraph(): Promise<void> {
  const res = await fetch("/api/graph");
  state.graph = (await res.json()) as Graph;
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
  el("progress-label").textContent = `${done} / ${total} ${tb().progressDone}（${pct}%）`;
}
