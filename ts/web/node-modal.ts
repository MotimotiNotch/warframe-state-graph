// Port of web/node-modal.js. Node create/edit modal (replaces the old
// "edit data/graph.json by hand" workflow).
// Build was retired in favor of Goal (2026-08-25) — the structural type axis
// is really just "is this reachable from the root dropdown", and Build/Goal
// were never distinguished anywhere in the code. Existing data can still
// have Build-typed nodes; openNodeModal offers it as a choice only when
// editing one (see typeOptionsFor), never for new nodes.

import type { Node, NodeType } from "../server/model.ts";
import { confirmInline } from "./confirm-inline.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { loadGraph, loadReport, state } from "./graph-state.ts";
import { nodeDisplayName, questJa } from "./quest-i18n.ts";
import { showToast } from "./toast.ts";
import { effective } from "./locale.ts";

export const NODE_TYPES: NodeType[] = ["Goal", "Weapon", "Frame", "Mod", "Riven", "Syndicate", "Quest", "Resource", "Relic", "Other"];
const NODE_TYPE_LABELS: Record<"ja" | "en", Record<string, string>> = {
  ja: {
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
    // どのカテゴリにも当てはまらないアイテム用（のっち依頼、2026-08-28: 当初「-」表示だったが「Otherが良いかも」で変更）。
    Other: "Other",
  },
  // The type keys are already the canonical English names, so English mode
  // just needs the two that aren't bare identifiers spelled out.
  en: {
    Goal: "Goal",
    Weapon: "Weapon",
    Frame: "Frame",
    Mod: "Mod",
    Riven: "Riven",
    Syndicate: "Syndicate",
    Quest: "Quest",
    Resource: "Resource",
    Relic: "Relic",
    Build: "Build (legacy)",
    Other: "Other",
  },
};

/** Node type label in the current display language (callers previously read
 * the JA-only NODE_TYPE_LABEL_JA map directly, hence the `?? type` fallback
 * for a type not in the table). */
export function nodeTypeLabel(type: string): string {
  return NODE_TYPE_LABELS[effective()][type] ?? type;
}

interface NodeModalStrings {
  none: string;
  noMatchingNode: string;
  noCandidatesFreeform: string;
  noMatchFreeform: string;
  editTitle: string;
  addRequiresTitle: string;
  addContainsTitle: string;
  newGoalTitle: string;
  enterName: string;
  deleteConfirm: (id: string) => string;
}

const STRINGS: Record<"ja" | "en", NodeModalStrings> = {
  ja: {
    none: "なし",
    noMatchingNode: "一致するノードなし",
    noCandidatesFreeform: "候補なし（自由入力のみ対応の種別です）",
    noMatchFreeform: "一致なし（このまま自由入力できます）",
    editTitle: "ノード編集",
    addRequiresTitle: "前提ノードを追加",
    addContainsTitle: "中身ノードを追加",
    newGoalTitle: "新規ゴール",
    enterName: "名前を入力して",
    deleteConfirm: (id) => `「${id}」を削除する？（他ノードからの参照も外れます）`,
  },
  en: {
    none: "None",
    noMatchingNode: "No matching node",
    noCandidatesFreeform: "No candidates (this type is free-entry only)",
    noMatchFreeform: "No match (you can still type it freely)",
    editTitle: "Edit node",
    addRequiresTitle: "Add a prerequisite node",
    addContainsTitle: "Add a contents node",
    newGoalTitle: "New goal",
    enterName: "Enter a name",
    deleteConfirm: (id) => `Delete "${id}"? (references from other nodes are dropped too)`,
  },
};

function t(): NodeModalStrings {
  return STRINGS[effective()];
}

// のっち's call (2026-08-26): users shouldn't have to think about IDs at
// all when creating a node, only the name. A UUID needs no slugification
// (no ASCII-only/empty-name edge cases a name-derived id would have) — the
// while loop is a defensive duplicate check per のっち's request, not
// something expected to ever actually loop (a real crypto.randomUUID()
// collision is not a realistic occurrence).
// 8-char lowercase-alphanumeric, matching server/model.ts's generateRandomId
// (2026-08-29 spec change — node ids are opaque random strings now, not
// name-derived). This client-side generator is only for the node-modal's
// own single-node create flow (POST /api/nodes) — DSL/WFCD batch imports go
// through the server-side resolveNodeIds() instead, since those need
// same-name dedup against the existing graph, which this simple generator
// doesn't do.
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function generateNodeId(): string {
  let id = "";
  do {
    id = Array.from({ length: 8 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join("");
  } while (state.graph!.nodes[id]);
  return id;
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
        const n = state.graph!.nodes[id];
        const label = n ? nodeDisplayName(n) : id;
        return `<span class="mod-tag">${label}<span class="x" data-remove-idx="${i}">${icon("x", { size: 12 })}</span></span>`;
      })
      .join("") || `<span class="empty">${t().none}</span>`;
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
    .filter(
      (n) =>
        n.id !== nodeEditingId &&
        !list.includes(n.id) &&
        (n.name.toLowerCase().includes(q) || nodeDisplayName(n).toLowerCase().includes(q)),
    )
    .slice(0, 30);
  if (!matches.length) {
    suggestEl.innerHTML = `<div class="suggest-empty">${t().noMatchingNode}</div>`;
  } else {
    suggestEl.innerHTML = matches
      .map(
        (n) =>
          `<div class="suggest-item" data-id="${n.id}">${nodeDisplayName(n)}<span style="color:var(--muted);font-size:0.75em;"> （${nodeTypeLabel(n.type)}）</span></div>`,
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

// 名前欄の予測変換（のっち依頼、2026-08-28）: 種別を選んだらWFCDの実データ
// から候補を出す——wfcd-wizard.tsの名前欄と同じパターン・同じ参照エンド
// ポイントを流用。Rivenだけはディスポジション個体差が強くカタログ化でき
// ないので候補なし——ただし黙って何も出さないのではなく「自由入力のみ」
// と明示する（updateNodeNameSuggest側で処理）。カタログのある種別は候補
// が0件でも自由入力はそのまま通る（wfcd-wizard.tsと同じ「一致なし（この
// まま自由入力できます）」表示）。
const NODE_NAME_REF_ENDPOINTS: Partial<Record<NodeType, string>> = {
  Frame: "/api/reference/frames",
  Weapon: "/api/reference/weapons",
  Mod: "/api/reference/mods",
  Quest: "/api/reference/quests",
  Syndicate: "/api/reference/syndicates",
  Resource: "/api/reference/resources",
  Relic: "/api/reference/relics",
};
const nodeNameRefData: Partial<Record<NodeType, string[]>> = {};
async function loadNodeNameRefData(): Promise<void> {
  await Promise.all(
    (Object.entries(NODE_NAME_REF_ENDPOINTS) as [NodeType, string][]).map(async ([type, url]) => {
      try {
        nodeNameRefData[type] = (await fetch(url).then((r) => r.json())) as string[];
      } catch {
        // 取得失敗してもその種別は候補なしになるだけ、自由入力は引き続き可能
      }
    }),
  );
}
void loadNodeNameRefData();

const nodeNameInput = el<HTMLInputElement>("node-name");
const nodeNameSuggest = el("node-name-suggest");
function hideNodeNameSuggest(): void {
  nodeNameSuggest.classList.add("hidden");
}
function updateNodeNameSuggest(): void {
  const type = el<HTMLSelectElement>("node-type").value as NodeType;
  // Rivenのようにカタログを持たない種別は、候補ゼロで黙って何も出さない
  // のではなく「自由入力のみ」と明示する（のっち依頼、2026-08-28）。
  if (!Object.prototype.hasOwnProperty.call(NODE_NAME_REF_ENDPOINTS, type)) {
    nodeNameSuggest.innerHTML = `<div class="suggest-empty">${t().noCandidatesFreeform}</div>`;
    nodeNameSuggest.classList.remove("hidden");
    return;
  }
  const pool = nodeNameRefData[type] ?? [];
  const q = nodeNameInput.value.trim().toLowerCase();
  if (!q || !pool.length) {
    hideNodeNameSuggest();
    return;
  }
  // Questのみ日本語名でもマッチ（questJa）。実際に送る値はWFCDの英語名の
  // まま——wfcd-wizard.tsの同じ扱いに合わせる。
  const matches = pool
    .filter((n) => n.toLowerCase().includes(q) || (type === "Quest" && questJa(n) !== n && questJa(n).toLowerCase().includes(q)))
    .slice(0, 30);
  if (!matches.length) {
    nodeNameSuggest.innerHTML = `<div class="suggest-empty">${t().noMatchFreeform}</div>`;
  } else {
    nodeNameSuggest.innerHTML = matches
      .map((n) => {
        const label = type === "Quest" && questJa(n) !== n ? `${questJa(n)}（${n}）` : n;
        return `<div class="suggest-item" data-value="${n.replace(/"/g, "&quot;")}">${label}</div>`;
      })
      .join("");
    nodeNameSuggest.querySelectorAll(".suggest-item").forEach((itemEl) => {
      itemEl.addEventListener("mousedown", (e) => {
        // fires before blur
        e.preventDefault();
        nodeNameInput.value = (itemEl as HTMLElement).dataset.value ?? "";
        hideNodeNameSuggest();
      });
    });
  }
  nodeNameSuggest.classList.remove("hidden");
}
nodeNameInput.addEventListener("input", updateNodeNameSuggest);
nodeNameInput.addEventListener("focus", updateNodeNameSuggest);
nodeNameInput.addEventListener("blur", () => setTimeout(hideNodeNameSuggest, 150));
// 種別を切り替えたら参照プールが変わるため、古い種別の候補が出しっぱなしに
// ならないよう畳む（名前欄の中身自体はクリアしない——自由入力した名前を
// 種別変更だけで消してしまうのは不親切なため、wfcd-wizard.tsの挙動とは
// あえて変えている）。
el("node-type").addEventListener("change", hideNodeNameSuggest);

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
    mode === "edit" ? t().editTitle : context ? (context.relation === "requires" ? t().addRequiresTitle : t().addContainsTitle) : t().newGoalTitle;

  const typeSel = el<HTMLSelectElement>("node-type");
  const types = typeOptionsFor(mode, context ?? null, node);
  typeSel.innerHTML = types.map((type) => `<option value="${type}">${nodeTypeLabel(type)}</option>`).join("");
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
    showToast(t().enterName);
    return;
  }
  const id = nodeModalMode === "create" ? generateNodeId() : el<HTMLInputElement>("node-id").value.trim();
  const node: Record<string, unknown> = {
    id,
    name,
    type: el<HTMLSelectElement>("node-type").value,
    requires: [...draftRequires],
    contains: [...draftContains],
    note: el<HTMLTextAreaElement>("node-note").value.trim(),
    masteryTrack: el<HTMLInputElement>("node-mastery-track").checked,
  };
  // Editing carries over existing satisfied/gilded/uniqueName/counters/
  // archived/folderId (state not shown in the form) — these fields would
  // otherwise silently reset to their zero value on every edit-modal save,
  // since they're just absent from the fresh `node` object the form builds
  // above.
  const existing = state.graph!.nodes[id];
  if (nodeModalMode === "edit" && existing) {
    node.satisfied = existing.satisfied;
    node.gilded = existing.gilded;
    node.uniqueName = existing.uniqueName;
    node.counters = existing.counters;
    node.archived = existing.archived;
    node.folderId = existing.folderId;
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
  if (!(await confirmInline(el("node-modal-delete"), t().deleteConfirm(id)))) return;
  await fetch(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
  closeNodeModal();
  state.selected = null;
  await loadGraph();
  if (state.focus) await loadReport();
});
