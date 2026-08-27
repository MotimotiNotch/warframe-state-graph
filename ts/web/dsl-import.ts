// Item 29: text-DSL bulk node generation ("advanced mode"). The parser and
// syntax-checking live server-side (server/dsl.ts, POST /api/dsl/parse) —
// this module is UI-only: textarea -> preview (nodes + errors + conflicts
// with existing graph nodes) -> confirm -> import via the same
// /api/wfcd/import endpoint the WFCD wizard uses (see wfcd-wizard.ts).
import type { Node } from "../server/model.ts";
import { el } from "./dom.ts";
import { loadGraph, loadReport, state } from "./graph-state.ts";

interface DslError {
  message: string;
  pos: number;
}
interface DslParseResponse {
  nodes: Node[];
  errors: DslError[];
  conflicts: string[];
}

let dslPreviewNodes: Node[] = [];
let dslConflicts: string[] = [];

el("dsl-import-btn").addEventListener("click", () => {
  el<HTMLTextAreaElement>("dsl-input").value = "";
  el("dsl-preview").innerHTML = "";
  el("dsl-modal-import").style.display = "none";
  dslPreviewNodes = [];
  dslConflicts = [];
  el("dsl-modal-backdrop").classList.remove("hidden");
});
el("dsl-modal-cancel").addEventListener("click", () => {
  el("dsl-modal-backdrop").classList.add("hidden");
});

el("dsl-preview-btn").addEventListener("click", async () => {
  const text = el<HTMLTextAreaElement>("dsl-input").value;
  const preview = el("dsl-preview");
  el("dsl-modal-import").style.display = "none";
  dslPreviewNodes = [];
  dslConflicts = [];
  if (!text.trim()) {
    preview.innerHTML = `<div class="empty">記法を入力してください</div>`;
    return;
  }
  preview.innerHTML = `<div class="empty">解析中…</div>`;
  const res = await fetch("/api/dsl/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    preview.innerHTML = `<div class="empty">解析に失敗しました</div>`;
    return;
  }
  const data = (await res.json()) as DslParseResponse;
  if (data.errors.length > 0) {
    preview.innerHTML = data.errors
      .map((e) => `<div class="wfcd-part" style="border-color:var(--blocked);color:var(--blocked);">構文エラー: ${e.message}（${e.pos}文字目付近）</div>`)
      .join("");
    return;
  }
  dslPreviewNodes = data.nodes;
  dslConflicts = data.conflicts;
  renderDslPreview();
  el("dsl-modal-import").style.display = "";
});

function renderDslPreview(): void {
  const preview = el("dsl-preview");
  const conflictWarning = dslConflicts.length
    ? `<div class="wfcd-part" style="border-color:var(--blocked);color:var(--blocked);">既存の同名ノードを上書きします（requires/containsは新しい内容で置き換わります）: ${dslConflicts.join("、")}</div>`
    : "";
  const rows = dslPreviewNodes
    .map((n) => {
      const req = n.requires.length ? `前提: ${n.requires.join(", ")}` : "";
      const con = n.contains.length ? `中身: ${n.contains.join(", ")}` : "";
      const detail = [req, con].filter(Boolean).join(" / ") || "（単独ノード）";
      const rootBadge = n.type === "Goal" ? `<span class="badge-vaulted">探索起点</span>` : "";
      const conflictBadge = dslConflicts.includes(n.id) ? `<span class="badge-vaulted">上書き</span>` : "";
      return `<div class="wfcd-part"><div class="part-name">${n.name}${rootBadge}${conflictBadge}</div><div class="ph-row">${detail}</div></div>`;
    })
    .join("");
  preview.innerHTML = `${conflictWarning}<div class="ph-row"><b>生成予定ノード数:</b> ${dslPreviewNodes.length}</div>${rows}`;
}

el("dsl-modal-import").addEventListener("click", async () => {
  if (!dslPreviewNodes.length) return;
  await fetch("/api/wfcd/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes: dslPreviewNodes }),
  });
  el("dsl-modal-backdrop").classList.add("hidden");
  await loadGraph();
  if (state.focus) await loadReport();
  alert(`${dslPreviewNodes.length}個のノードを追加しました。探索起点は左サイドバーの一覧から辿れます。`);
});
