// Port of web/node-modal.js. Node create/edit modal (replaces the old
// "edit data/graph.json by hand" workflow).
// Build was retired in favor of Goal (2026-08-25) — the structural type axis
// is really just "is this reachable from the root dropdown", and Build/Goal
// were never distinguished anywhere in the code. Existing data can still
// have Build-typed nodes; openNodeModal offers it as a choice only when
// editing one (see typeOptionsFor), never for new nodes.

import type { Node, NodeType } from "../server/model.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { loadGraph, loadReport, state } from "./graph-state.ts";

export const NODE_TYPES: NodeType[] = ["Goal", "Weapon", "Frame", "Mod", "Riven", "Syndicate", "Quest", "Resource", "Relic"];
export const NODE_TYPE_LABEL_JA: Record<string, string> = {
  Goal: "ゴール",
  Weapon: "武器",
  Frame: "フレーム",
  Mod: "MOD",
  Riven: "Riven",
  Syndicate: "シンジケート",
  Quest: "クエスト",
  Resource: "リソース",
  Relic: "レリック",
  Build: "Build（旧形式）",
};

// Matches server/wfcdgen.ts's Slug() (kept as its own copy rather than a
// cross-import — client bundles don't pull in server-only modules, and
// wfcd-wizard.ts already re-implements the same small regex inline).
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// のっち's call (2026-08-26): users shouldn't have to think about IDs at
// all when creating a node, only the name. Auto-generates a readable id
// from the name, matching the existing data/graph.json slug convention,
// with a numeric suffix only if that slug is already taken.
function generateNodeId(name: string): string {
  const base = slug(name) || "node";
  if (!state.graph!.nodes[base]) return base;
  let n = 2;
  while (state.graph!.nodes[`${base}-${n}`]) n++;
  return `${base}-${n}`;
}

export type NodeModalMode = "create" | "edit";
export interface NodeModalContext {
  relation: "requires" | "contains";
  parentId: string;
}

let nodeModalMode: NodeModalMode = "create";
let nodeEditingId: string | null = null;
// Distinguishes the header "新規ゴール" (bare Goal creation, no context) from
// Inspector's "前提を追加"/"中身を追加" (has context — on save, the new
// node's id is wired into the selected node's requires/contains automatically).
let nodeModalContext: NodeModalContext | null = null;

// Requires/Contains draft (array of node ids). The node currently being
// edited is excluded from its own candidate list (no self-reference).
// 2026-08-23: switched from comma-separated id text entry to a tag + search
// combobox ("doesn't show up in the dropdown" UX complaint).
let draftRequires: string[] = [];
let draftContains: string[] = [];

function renderNodeTagList(kind: "requires" | "contains"): void {
  const list = kind === "requires" ? draftRequires : draftContains;
  const tagsEl = el(`node-${kind}-tags`);
  tagsEl.innerHTML =
    list
      .map((id, i) => {
        const label = state.graph!.nodes[id]?.name ?? id;
        return `<span class="mod-tag">${label}<span class="x" data-remove-idx="${i}">${icon("x", { size: 12 })}</span></span>`;
      })
      .join("") || `<span class="empty">なし</span>`;
  tagsEl.querySelectorAll("[data-remove-idx]").forEach((x) => {
    x.addEventListener("click", () => {
      list.splice(Number((x as HTMLElement).dataset.removeIdx), 1);
      renderNodeTagList(kind);
    });
  });
}

function hideNodeSuggest(kind: "requires" | "contains"): void {
  el(`node-${kind}-suggest`).classList.add("hidden");
}
function updateNodeSuggest(kind: "requires" | "contains"): void {
  const input = el<HTMLInputElement>(`node-${kind}-input`);
  const suggestEl = el(`node-${kind}-suggest`);
  const list = kind === "requires" ? draftRequires : draftContains;
  const q = input.value.trim().toLowerCase();
  if (!q) {
    hideNodeSuggest(kind);
    return;
  }

  const matches = Object.values(state.graph!.nodes)
    .filter((n) => n.id !== nodeEditingId && !list.includes(n.id) && n.name.toLowerCase().includes(q))
    .slice(0, 30);
  if (!matches.length) {
    suggestEl.innerHTML = `<div class="suggest-empty">一致するノードなし</div>`;
  } else {
    suggestEl.innerHTML = matches
      .map(
        (n) =>
          `<div class="suggest-item" data-id="${n.id}">${n.name}<span style="color:var(--muted);font-size:0.75em;"> （${NODE_TYPE_LABEL_JA[n.type] ?? n.type}）</span></div>`,
      )
      .join("");
    suggestEl.querySelectorAll(".suggest-item").forEach((itemEl) => {
      itemEl.addEventListener("mousedown", (e) => {
        // fires before blur
        e.preventDefault();
        list.push((itemEl as HTMLElement).dataset.id!);
        renderNodeTagList(kind);
        input.value = "";
        hideNodeSuggest(kind);
      });
    });
  }
  suggestEl.classList.remove("hidden");
}
(["requires", "contains"] as const).forEach((kind) => {
  const input = el<HTMLInputElement>(`node-${kind}-input`);
  input.addEventListener("input", () => updateNodeSuggest(kind));
  input.addEventListener("focus", () => updateNodeSuggest(kind));
  input.addEventListener("blur", () => setTimeout(() => hideNodeSuggest(kind), 150));
});

// Type options depend on the entry point: header "新規ゴール" (bare create, no
// context) is Goal-only; Inspector's add-prerequisite/add-contents (has
// context) offers category types only (no Goal — that's for independent
// roots); editing offers every type, plus Build temporarily if the node
// being edited already has it (2026-08-25 item 30).
function typeOptionsFor(mode: NodeModalMode, context: NodeModalContext | null, node: Node | null): string[] {
  if (mode === "create" && !context) return ["Goal"];
  if (mode === "create" && context) return NODE_TYPES.filter((t) => t !== "Goal");
  const types: string[] = [...NODE_TYPES];
  if (node?.type === "Build") types.splice(1, 0, "Build");
  return types;
}

export function openNodeModal(mode: NodeModalMode, node: Node | null, context?: NodeModalContext | null): void {
  nodeModalMode = mode;
  nodeEditingId = node?.id ?? null;
  nodeModalContext = context ?? null;
  const bareGoal = mode === "create" && !context;
  el("node-modal-title").textContent =
    mode === "edit" ? "ノード編集" : context ? (context.relation === "requires" ? "前提ノードを追加" : "中身ノードを追加") : "新規ゴール";

  const typeSel = el<HTMLSelectElement>("node-type");
  const types = typeOptionsFor(mode, context ?? null, node);
  typeSel.innerHTML = types.map((t) => `<option value="${t}">${NODE_TYPE_LABEL_JA[t] ?? t}</option>`).join("");
  typeSel.disabled = bareGoal;

  el<HTMLInputElement>("node-id").value = node?.id ?? "";
  el<HTMLInputElement>("node-id").disabled = mode === "edit";
  el("node-id-row").classList.toggle("hidden", mode === "create");
  el<HTMLInputElement>("node-name").value = node?.name ?? "";
  typeSel.value = node?.type ?? types[0] ?? "Goal";
  draftRequires = [...(node?.requires ?? [])];
  draftContains = [...(node?.contains ?? [])];
  el<HTMLInputElement>("node-requires-input").value = "";
  el<HTMLInputElement>("node-contains-input").value = "";
  hideNodeSuggest("requires");
  hideNodeSuggest("contains");
  renderNodeTagList("requires");
  renderNodeTagList("contains");
  // New-node creation (bare Goal or via Inspector) doesn't show the
  // Requires/Contains search UI at all — it's the same "search by id/name for
  // a connection target" operation that's deliberately eliminated elsewhere
  // (2026-08-25 item 28). Only editing shows it, as the one remaining way to
  // directly touch existing connections.
  el("node-requires-section").classList.toggle("hidden", mode !== "edit");
  el("node-contains-section").classList.toggle("hidden", mode !== "edit");
  el<HTMLTextAreaElement>("node-evaluation").value = node?.evaluation ?? "";
  el<HTMLTextAreaElement>("node-note").value = node?.note ?? "";
  el<HTMLInputElement>("node-mastery-track").checked = !!node?.masteryTrack;
  el("node-modal-delete").style.display = mode === "edit" ? "" : "none";

  el("node-modal-backdrop").classList.remove("hidden");
}
function closeNodeModal(): void {
  el("node-modal-backdrop").classList.add("hidden");
}

el("new-node-btn").addEventListener("click", () => openNodeModal("create", null));
el("node-modal-cancel").addEventListener("click", closeNodeModal);

el("node-modal-save").addEventListener("click", async () => {
  const name = el<HTMLInputElement>("node-name").value.trim();
  if (!name) {
    alert("名前を入力して");
    return;
  }
  const id = nodeModalMode === "create" ? generateNodeId(name) : el<HTMLInputElement>("node-id").value.trim();
  const node: Record<string, unknown> = {
    id,
    name,
    type: el<HTMLSelectElement>("node-type").value,
    requires: [...draftRequires],
    contains: [...draftContains],
    evaluation: el<HTMLTextAreaElement>("node-evaluation").value.trim(),
    note: el<HTMLTextAreaElement>("node-note").value.trim(),
    masteryTrack: el<HTMLInputElement>("node-mastery-track").checked,
  };
  // Editing carries over the existing satisfied/gilded/uniqueName (state not
  // shown in the form).
  const existing = state.graph!.nodes[id];
  if (nodeModalMode === "edit" && existing) {
    node.satisfied = existing.satisfied;
    node.gilded = existing.gilded;
    node.uniqueName = existing.uniqueName;
  }
  await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(node) });

  // Via Inspector's add-prerequisite/add-contents: wire the new node's id
  // into the selected node's requires/contains automatically (the user never
  // searches for a connection target by id/name anywhere, 2026-08-25 item 28).
  if (nodeModalMode === "create" && nodeModalContext) {
    const parent = state.graph!.nodes[nodeModalContext.parentId];
    if (parent) {
      const key = nodeModalContext.relation; // "requires" | "contains"
      const updatedParent = { ...parent, [key]: [...(parent[key] ?? []), id] };
      await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedParent),
      });
    }
  }

  closeNodeModal();
  await loadGraph();
  if (state.focus) await loadReport();
});

el("node-modal-delete").addEventListener("click", async () => {
  const id = el<HTMLInputElement>("node-id").value.trim();
  if (!confirm(`「${id}」を削除する？（他ノードからの参照も外れます）`)) return;
  await fetch(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
  closeNodeModal();
  state.selected = null;
  await loadGraph();
  if (state.focus) await loadReport();
});
