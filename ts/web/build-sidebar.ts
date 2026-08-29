// Left-sidebar "explorer" panel (2026-08-27) — replaces the old
// #build-select dropdown. As the number of Builds/Goals grows, picking one
// out of a single flat <select> gets harder; this groups them into flat
// (single-level, no nesting — 2026-08-27 owner-specified) folders shown as a
// tree on the left, matching a file-explorer mental model. Folders
// themselves live in their own tiny server-side store (folder.ts) rather
// than as graph.json Node fields — a folder has no satisfied/requires-chain
// semantics and never appears in a Build's own requires/contains traversal,
// so it doesn't belong in the flat node graph (same reasoning that pulled
// Riven/Kuva individuals into collections.json rather than Node fields,
// 2026-08-17). Node only holds a loose `folderId` reference, assigned here
// via a "move" popover (not drag-and-drop — 2026-08-27 owner-specified,
// simpler and lower-risk given this codebase's repeated pointer-drag bugs
// elsewhere: wallpaper position drag, card-tilt.js's rAF/background-tab
// issues, scratch panel drag).

import { confirmInline } from "./confirm-inline.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import type { Folder } from "../server/folder.ts";
import type { Node } from "../server/model.ts";
import { refreshGraph, selectBuild, state } from "./graph-state.ts";
import { nodeDisplayName } from "./quest-i18n.ts";

let folders: Record<string, Folder> = {};

function genFolderId(): string {
  return `folder-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function loadFolders(): Promise<void> {
  try {
    const res = await fetch("/api/folders");
    const data = res.ok ? ((await res.json()) as { folders: Record<string, Folder> }) : null;
    folders = data?.folders ?? {};
  } catch {
    folders = {};
  }
}

// Build was folded into Goal (2026-08-25 item 30) but existing data can
// still have Build-typed nodes; archived ones (2026-08-27) are excluded here
// the same way the old #build-select dropdown excluded them.
function selectableBuilds(): Node[] {
  return Object.values(state.graph!.nodes).filter((n) => (n.type === "Build" || n.type === "Goal") && !n.archived);
}

function byNameJa(a: Node, b: Node): number {
  return a.name.localeCompare(b.name, "ja");
}

const COLLAPSE_KEY_PREFIX = "warframe-state-graph:sidebar:collapsed:";
// "__unfiled__" is not a real folder id (folder ids come from genFolderId()'s
// "folder-" prefix), just this bucket's own collapse-state key.
const UNFILED_KEY = "__unfiled__";
function getStoredCollapsed(folderKey: string): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY_PREFIX + folderKey) === "1";
  } catch {
    return false;
  }
}
function setStoredCollapsed(folderKey: string, collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY_PREFIX + folderKey, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function moveTargetsHtml(node: Node): string {
  const targets = [{ id: "", name: "未分類" }, ...Object.values(folders).sort((a, b) => a.name.localeCompare(b.name, "ja"))];
  return targets
    .map(
      (f) =>
        `<div class="sb-move-target${(node.folderId ?? "") === f.id ? " current" : ""}" data-move-target="${f.id}" data-move-build="${node.id}">${escapeHtml(f.name)}</div>`,
    )
    .join("");
}

function buildRowHtml(n: Node): string {
  const current = n.id === state.buildId;
  return `
    <div class="sb-build-row${current ? " current" : ""}" data-build-id="${n.id}">
      <span class="sb-build-name">${escapeHtml(nodeDisplayName(n))}</span>
      <button class="icon-btn sb-move-btn" data-move-toggle="${n.id}" title="フォルダへ移動">${icon("folder", { size: 13 })}</button>
      <button class="icon-btn sb-delete-btn" data-build-delete="${n.id}" title="削除">${icon("trash-2", { size: 13 })}</button>
    </div>`;
}

function folderSectionHtml(folderKey: string, name: string, builds: Node[], deletable: boolean): string {
  const collapsed = getStoredCollapsed(folderKey);
  return `
    <div class="sb-folder" data-folder-key="${folderKey}">
      <div class="sb-folder-head">
        <button class="icon-btn sb-folder-chevron${collapsed ? "" : " expanded"}" data-folder-toggle="${folderKey}">${icon("chevron-down", { size: 13 })}</button>
        <span class="sb-folder-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="sb-folder-count">${builds.length}</span>
        ${
          deletable
            ? `<button class="icon-btn sb-folder-rename" data-folder-rename="${folderKey}" title="名前変更">${icon("pencil", { size: 12 })}</button>
               <button class="icon-btn sb-folder-delete" data-folder-delete="${folderKey}" title="削除">${icon("x", { size: 12 })}</button>`
            : ""
        }
      </div>
      <div class="sb-folder-body${collapsed ? " hidden" : ""}" data-folder-body="${folderKey}">
        ${builds.length ? builds.map(buildRowHtml).join("") : `<div class="sb-empty">なし</div>`}
      </div>
    </div>`;
}

function render(): void {
  const container = el("sidebar-body");
  const builds = selectableBuilds();
  const byFolder = new Map<string, Node[]>();
  const unfiled: Node[] = [];
  for (const n of builds) {
    if (n.folderId && folders[n.folderId]) {
      const bucket = byFolder.get(n.folderId);
      if (bucket) bucket.push(n);
      else byFolder.set(n.folderId, [n]);
    } else {
      unfiled.push(n);
    }
  }
  const folderList = Object.values(folders).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const sections = folderList
    .map((f) => folderSectionHtml(f.id, f.name, (byFolder.get(f.id) ?? []).sort(byNameJa), true))
    .concat(folderSectionHtml(UNFILED_KEY, "未分類", unfiled.sort(byNameJa), false));
  container.innerHTML = builds.length ? sections.join("") : `<div class="sb-empty">目標ノードがまだありません</div>`;
  wireInteractions(container);
}

// Single shared "move to folder" popover living at the top level of <body>
// (index.html), not nested inside #folder-panel — see the CSS comment on
// #sb-move-popover for why a per-row instance there gets clipped. Tracks
// which build it's currently open for so a second click on the same button
// toggles it closed instead of just re-opening in place.
let openForBuildId: string | null = null;

function getMovePopover(): HTMLElement {
  return el("sb-move-popover");
}

function closeMovePopover(): void {
  openForBuildId = null;
  getMovePopover().classList.add("hidden");
}

function openMovePopover(btn: HTMLElement, node: Node): void {
  const pop = getMovePopover();
  pop.innerHTML = moveTargetsHtml(node);
  const rect = btn.getBoundingClientRect();
  const minWidth = 160; // matches #sb-move-popover's CSS min-width
  pop.style.top = `${rect.bottom + 6}px`;
  if (rect.left + minWidth > window.innerWidth) {
    pop.style.left = "auto";
    pop.style.right = `${window.innerWidth - rect.right}px`;
  } else {
    pop.style.left = `${rect.left}px`;
    pop.style.right = "auto";
  }
  pop.classList.remove("hidden");
  openForBuildId = node.id;
}

async function moveBuildToFolder(buildId: string, target: string): Promise<void> {
  await fetch(`/api/nodes/${encodeURIComponent(buildId)}/folder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId: target || null }),
  });
  closeMovePopover();
  await refreshGraph();
  render();
}

/** One-time wiring for the shared move popover — content clicks (delegated,
 * since innerHTML is replaced on every open) and outside-click/scroll close.
 * Call once from initSidebar(), not from wireInteractions() (which reruns on
 * every render() and would stack duplicate listeners). */
function wireMovePopoverOnce(): void {
  const pop = getMovePopover();
  pop.addEventListener("click", (e) => {
    e.stopPropagation();
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-move-target]");
    if (!target) return;
    void moveBuildToFolder(target.dataset.moveBuild!, target.dataset.moveTarget!);
  });
  document.addEventListener("click", () => closeMovePopover());
  // #folder-panel scrolling would otherwise leave the popover visually
  // stranded away from the button it was opened from (position is computed
  // once at open time, not re-tracked).
  el("folder-panel").addEventListener("scroll", () => closeMovePopover());
}

function wireInteractions(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>("[data-folder-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.folderToggle!;
      const body = container.querySelector<HTMLElement>(`[data-folder-body="${CSS.escape(key)}"]`)!;
      const nowHidden = body.classList.toggle("hidden");
      btn.classList.toggle("expanded", !nowHidden);
      setStoredCollapsed(key, nowHidden);
    });
  });

  container.querySelectorAll<HTMLElement>(".sb-build-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".sb-move-btn, .sb-delete-btn")) return;
      selectBuild(row.dataset.buildId!);
      render();
    });
  });

  container.querySelectorAll<HTMLButtonElement>(".sb-move-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.moveToggle!;
      if (openForBuildId === id) {
        closeMovePopover();
        return;
      }
      const node = state.graph!.nodes[id];
      if (node) openMovePopover(btn, node);
    });
  });

  // ビルド一覧から直接削除できるように（のっち依頼、2026-08-28）。それまでは
  // 選択→詳細パネル→編集モーダル→削除、という遠回りしか手段がなかった。
  // node-modal.tsの削除確認と同じ文言・同じconfirmInlineパターンを踏襲。
  container.querySelectorAll<HTMLButtonElement>(".sb-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.buildDelete!;
      const node = state.graph!.nodes[id];
      if (!node) return;
      if (!(await confirmInline(btn, `「${nodeDisplayName(node)}」を削除する？（他ノードからの参照も外れます）`))) return;
      await fetch(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshGraph();
      refreshSidebar();
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-folder-rename]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFolderModal("rename", btn.dataset.folderRename!);
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-folder-delete]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.folderDelete!;
      const name = folders[id]?.name ?? "";
      if (!(await confirmInline(btn, `「${name}」を削除する？（中の目標は未分類に戻ります）`))) return;
      await fetch(`/api/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
      delete folders[id];
      // The server also clears folderId off every affected node
      // (store.ts's clearFolderFromNodes) — refetch so those builds show
      // back up under 未分類 instead of vanishing from the list.
      await refreshGraph();
      render();
    });
  });
}

// Folder create/rename modal (2026-08-28) — replaces window.prompt() (のっち
// 指摘: ブラウザ標準アラートでなくモーダルにしたい), same shape as ADR05's
// planned native-dialog migration. Both actions are "enter one folder name",
// so they share one modal; folderModalTargetId distinguishes which API call
// saveFolderModal() makes.
let folderModalMode: "create" | "rename" = "create";
let folderModalTargetId: string | null = null;

function openFolderModal(mode: "create" | "rename", targetId?: string): void {
  folderModalMode = mode;
  folderModalTargetId = targetId ?? null;
  el("folder-modal-title").textContent = mode === "create" ? "新規フォルダ" : "フォルダ名を変更";
  const input = el<HTMLInputElement>("folder-modal-name");
  input.value = mode === "rename" && targetId ? (folders[targetId]?.name ?? "") : "";
  el("folder-modal-backdrop").classList.remove("hidden");
  input.focus();
}

function closeFolderModal(): void {
  el("folder-modal-backdrop").classList.add("hidden");
}

async function saveFolderModal(): Promise<void> {
  const name = el<HTMLInputElement>("folder-modal-name").value.trim();
  if (!name) return;
  if (folderModalMode === "create") {
    const f: Folder = { id: genFolderId(), name };
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    if (!res.ok) return;
    folders[f.id] = (await res.json()) as Folder;
  } else {
    if (!folderModalTargetId) return;
    const res = await fetch(`/api/folders/${encodeURIComponent(folderModalTargetId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    folders[folderModalTargetId] = (await res.json()) as Folder;
  }
  closeFolderModal();
  render();
}

/** One-time wiring for the folder modal's own buttons/input — mirrors
 * wireMovePopoverOnce(): call once from initSidebar(), not from
 * wireInteractions() (reruns every render(), would stack listeners). */
function wireFolderModalOnce(): void {
  el("folder-modal-cancel").addEventListener("click", closeFolderModal);
  el("folder-modal-save").addEventListener("click", () => void saveFolderModal());
  el<HTMLInputElement>("folder-modal-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") void saveFolderModal();
  });
}

/** Full initial load: fetches folders, resolves the deep-link `?focus=` /
 * default-first-build selection (same logic the old populateBuildSelect()
 * did for #build-select's initial option), then renders. Call once from
 * loadGraph() at page bootstrap. */
export async function initSidebar(): Promise<void> {
  await loadFolders();
  wireMovePopoverOnce();
  wireFolderModalOnce();
  el("new-folder-btn").innerHTML = icon("folder-plus");
  el("new-folder-btn").onclick = () => openFolderModal("create");

  const builds = selectableBuilds();
  // A deep link from Loadouts/Collections' minigraph (?focus=<nodeId>,
  // 2026-08-26) always points at a Goal/Build node directly — every item's
  // chainViewNodeId/chainViewBuildId is the node representing the item
  // itself. Falls back to the first available build when absent/stale.
  const requested = new URLSearchParams(location.search).get("focus");
  const matched = !!requested && builds.some((n) => n.id === requested);
  const initial = (matched ? requested : builds[0]?.id) ?? null;
  if (initial) {
    selectBuild(initial);
    // selectBuild() itself clears state.selected (the normal "just switched
    // build, nothing picked yet" default) — a deep link should land with the
    // target already selected/shown in the Inspector, same as clicking its
    // node directly would.
    if (matched) state.selected = initial;
  }
  if (requested) {
    const url = new URL(location.href);
    url.searchParams.delete("focus");
    history.replaceState(null, "", url);
  }
  render();
}

/** Re-syncs the sidebar after a node's `archived` flag changes, keeping the
 * current selection if it's still listed and falling back to the first
 * remaining build only if the currently-viewed one just got archived out
 * from under it. Unlike initSidebar(), this never re-consumes the one-time
 * `?focus=` URL param or resets an unrelated selection. */
export function refreshSidebar(): void {
  const builds = selectableBuilds();
  const stillValid = !!state.buildId && builds.some((n) => n.id === state.buildId);
  const target = stillValid ? state.buildId! : (builds[0]?.id ?? null);
  if (target && target !== state.buildId) selectBuild(target);
  render();
}
