// ===== ノード新規作成・編集（data/graph.json直接編集だった状態の解消） =====
// Build種別は廃止しGoalへ統合（2026-08-25、構造的な種別はプルダウンから辿れるルートかどうかの
// 1軸のみで、Build/Goalはコード上どこにも区別が無かったため）。既存データに残る旧Build種別の
// ノードは編集時のみ選択肢に一時的に出す（openNodeModal参照）、新規作成では選べない。
const NODE_TYPES = ["Goal", "Weapon", "Frame", "Mod", "Riven", "Syndicate", "Quest", "Resource", "Relic"];
const NODE_TYPE_LABEL_JA = {
  Goal: "ゴール", Weapon: "武器", Frame: "フレーム", Mod: "MOD", Riven: "Riven",
  Syndicate: "シンジケート", Quest: "クエスト", Resource: "リソース", Relic: "レリック",
  Build: "Build（旧形式）",
};
let nodeModalMode = "create";
let nodeEditingId = null;
// ヘッダー「新規ゴール」（裸のGoal作成、context無し）と、Inspectorの「前提を追加」/「中身を追加」
// （context有り、保存時に選択中ノード側のrequires/containsへ新規ノードのIDを自動で繋ぐ）を区別する。
let nodeModalContext = null;

// Requires/Containsの下書き（ノードIDの配列）。編集中の自分自身は候補から除外する
// （自己参照を防ぐため）。2026-08-23、「プルダウンに出てこない」（IDを手打ちする必要が
// あったUXの粗さ）を受けて、コンマ区切りのID直接入力からタグ+検索コンボボックスへ変更。
let draftRequires = [];
let draftContains = [];

function renderNodeTagList(kind) {
  const list = kind === "requires" ? draftRequires : draftContains;
  const el = document.getElementById(`node-${kind}-tags`);
  el.innerHTML = list.map((id, i) => {
    const label = state.graph.nodes[id]?.name || id;
    return `<span class="mod-tag">${label}<span class="x" data-remove-idx="${i}">${icon("x", { size: 12 })}</span></span>`;
  }).join("") || `<span class="empty">なし</span>`;
  el.querySelectorAll("[data-remove-idx]").forEach(x => x.addEventListener("click", () => {
    list.splice(Number(x.dataset.removeIdx), 1);
    renderNodeTagList(kind);
  }));
}

function hideNodeSuggest(kind) { document.getElementById(`node-${kind}-suggest`).classList.add("hidden"); }
function updateNodeSuggest(kind) {
  const input = document.getElementById(`node-${kind}-input`);
  const suggestEl = document.getElementById(`node-${kind}-suggest`);
  const list = kind === "requires" ? draftRequires : draftContains;
  const q = input.value.trim().toLowerCase();
  if (!q) { hideNodeSuggest(kind); return; }

  const matches = Object.values(state.graph.nodes)
    .filter(n => n.id !== nodeEditingId && !list.includes(n.id) && n.name.toLowerCase().includes(q))
    .slice(0, 30);
  if (!matches.length) {
    suggestEl.innerHTML = `<div class="suggest-empty">一致するノードなし</div>`;
  } else {
    suggestEl.innerHTML = matches.map(n => `<div class="suggest-item" data-id="${n.id}">${n.name}<span style="color:var(--muted);font-size:0.75em;"> （${NODE_TYPE_LABEL_JA[n.type] || n.type}）</span></div>`).join("");
    suggestEl.querySelectorAll(".suggest-item").forEach(el => {
      el.addEventListener("mousedown", (e) => { // blurより先に発火させるためmousedown
        e.preventDefault();
        list.push(el.dataset.id);
        renderNodeTagList(kind);
        input.value = "";
        hideNodeSuggest(kind);
      });
    });
  }
  suggestEl.classList.remove("hidden");
}
["requires", "contains"].forEach(kind => {
  const input = document.getElementById(`node-${kind}-input`);
  input.addEventListener("input", () => updateNodeSuggest(kind));
  input.addEventListener("focus", () => updateNodeSuggest(kind));
  input.addEventListener("blur", () => setTimeout(() => hideNodeSuggest(kind), 150));
});

// 種別選択肢は入口によって変える: ヘッダー「新規ゴール」（裸作成・context無し）はGoal固定、
// Inspectorの前提/中身追加（context有り）はカテゴリ種別のみ（Goalは独立ルート用なので出さない）、
// 編集時は全種別＋（対象が旧Build種別なら）Buildを一時的に追加する（2026-08-25、項目30）。
function typeOptionsFor(mode, context, node) {
  if (mode === "create" && !context) return ["Goal"];
  if (mode === "create" && context) return NODE_TYPES.filter(t => t !== "Goal");
  const types = [...NODE_TYPES];
  if (node?.type === "Build") types.splice(1, 0, "Build");
  return types;
}

function openNodeModal(mode, node, context) {
  nodeModalMode = mode;
  nodeEditingId = node?.id || null;
  nodeModalContext = context || null;
  const bareGoal = mode === "create" && !context;
  document.getElementById("node-modal-title").textContent =
    mode === "edit" ? "ノード編集" :
    context ? (context.relation === "requires" ? "前提ノードを追加" : "中身ノードを追加") :
    "新規ゴール";

  const typeSel = document.getElementById("node-type");
  const types = typeOptionsFor(mode, context, node);
  typeSel.innerHTML = types.map(t => `<option value="${t}">${NODE_TYPE_LABEL_JA[t] || t}</option>`).join("");
  typeSel.disabled = bareGoal;

  document.getElementById("node-id").value = node?.id || "";
  document.getElementById("node-id").disabled = mode === "edit";
  document.getElementById("node-name").value = node?.name || "";
  typeSel.value = node?.type || types[0];
  draftRequires = [...(node?.requires || [])];
  draftContains = [...(node?.contains || [])];
  document.getElementById("node-requires-input").value = "";
  document.getElementById("node-contains-input").value = "";
  hideNodeSuggest("requires");
  hideNodeSuggest("contains");
  renderNodeTagList("requires");
  renderNodeTagList("contains");
  // 新規作成時（裸のGoal・Inspector経由どちらも）はRequires/Contains検索UI自体を出さない
  // （「どこに繋ぐか」のID/名前検索という同じ操作なので排除対象、2026-08-25項目28確定）。
  // 編集時のみ、既存の接続を直接いじる手段として表示する。
  document.getElementById("node-requires-section").classList.toggle("hidden", mode !== "edit");
  document.getElementById("node-contains-section").classList.toggle("hidden", mode !== "edit");
  document.getElementById("node-evaluation").value = node?.evaluation || "";
  document.getElementById("node-note").value = node?.note || "";
  document.getElementById("node-mastery-track").checked = !!node?.masteryTrack;
  document.getElementById("node-modal-delete").style.display = mode === "edit" ? "" : "none";

  document.getElementById("node-modal-backdrop").classList.remove("hidden");
}
function closeNodeModal() { document.getElementById("node-modal-backdrop").classList.add("hidden"); }

document.getElementById("new-node-btn").addEventListener("click", () => openNodeModal("create", null));
document.getElementById("node-modal-cancel").addEventListener("click", closeNodeModal);

document.getElementById("node-modal-save").addEventListener("click", async () => {
  const id = document.getElementById("node-id").value.trim();
  const name = document.getElementById("node-name").value.trim();
  if (!id || !name) { alert("IDと名前は必須"); return; }
  const node = {
    id, name,
    type: document.getElementById("node-type").value,
    requires: [...draftRequires],
    contains: [...draftContains],
    evaluation: document.getElementById("node-evaluation").value.trim(),
    note: document.getElementById("node-note").value.trim(),
    masteryTrack: document.getElementById("node-mastery-track").checked,
  };
  // 編集時は既存のsatisfied/gilded/uniqueName（フォームに出していない状態）を引き継ぐ。
  const existing = state.graph.nodes[id];
  if (nodeModalMode === "edit" && existing) {
    node.satisfied = existing.satisfied;
    node.gilded = existing.gilded;
    node.uniqueName = existing.uniqueName;
  }
  await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(node) });

  // Inspectorの「前提を追加」/「中身を追加」経由の場合、選択中ノード側のrequires/containsへ
  // 新規ノードのIDを自動で繋ぐ（ユーザーはどこにも接続先をID/名前検索しない、2026-08-25項目28）。
  if (nodeModalMode === "create" && nodeModalContext) {
    const parent = state.graph.nodes[nodeModalContext.parentId];
    if (parent) {
      const key = nodeModalContext.relation; // "requires" | "contains"
      const updatedParent = { ...parent, [key]: [...(parent[key] || []), id] };
      await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedParent) });
    }
  }

  closeNodeModal();
  await loadGraph();
  if (state.focus) await loadReport();
});

document.getElementById("node-modal-delete").addEventListener("click", async () => {
  const id = document.getElementById("node-id").value.trim();
  if (!confirm(`「${id}」を削除する？（他ノードからの参照も外れます）`)) return;
  await fetch(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
  closeNodeModal();
  state.selected = null;
  await loadGraph();
  if (state.focus) await loadReport();
});
