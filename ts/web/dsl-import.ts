// Item 29: text-DSL bulk node generation ("advanced mode"). The parser and
// syntax-checking live server-side (server/dsl.ts, POST /api/dsl/parse) —
// this module is UI-only: textarea -> preview (nodes + errors + conflicts
// with existing graph nodes) -> confirm -> import via the same
// /api/wfcd/import endpoint the WFCD wizard uses (see wfcd-wizard.ts).
import type { Node } from "../server/model.ts";
import { el } from "./dom.ts";
import { dslAiPrompt } from "./dsl-help.ts";
import { copyTextToClipboard } from "./export.ts";
import { loadGraph, loadReport, state } from "./graph-state.ts";
import { showToast } from "./toast.ts";
import { effective } from "./locale.ts";

interface DslStrings {
  copied: string;
  copyFailedLog: string;
  copyFailed: string;
  enterSyntax: string;
  parsing: string;
  parseFailed: string;
  syntaxError: (msg: string, pos: number) => string;
  overwriteWarning: (names: string) => string;
  nameSep: string;
  requiresLabel: string;
  containsLabel: string;
  standaloneNode: string;
  rootBadge: string;
  overwriteBadge: string;
  plannedCount: string;
  importedToast: (n: number) => string;
}

const STRINGS: Record<"ja" | "en", DslStrings> = {
  ja: {
    copied: "コピーしました",
    copyFailedLog: "クリップボードへのコピーに失敗",
    copyFailed: "コピーに失敗しました",
    enterSyntax: "記法を入力してください",
    parsing: "解析中…",
    parseFailed: "解析に失敗しました",
    syntaxError: (msg, pos) => `構文エラー: ${msg}（${pos}文字目付近）`,
    overwriteWarning: (names) => `既存の同名ノードを上書きします（前提/中身（requires/contains）は新しい内容で置き換わります）: ${names}`,
    nameSep: "、",
    requiresLabel: "前提",
    containsLabel: "中身",
    standaloneNode: "（単独ノード）",
    rootBadge: "探索起点",
    overwriteBadge: "上書き",
    plannedCount: "生成予定ノード数:",
    importedToast: (n) => `${n}個のノードを追加しました。探索起点は左サイドバーの一覧から辿れます。`,
  },
  en: {
    copied: "Copied",
    copyFailedLog: "Failed to copy to the clipboard",
    copyFailed: "Copy failed",
    enterSyntax: "Enter some syntax first",
    parsing: "Parsing…",
    parseFailed: "Parsing failed",
    syntaxError: (msg, pos) => `Syntax error: ${msg} (around character ${pos})`,
    overwriteWarning: (names) => `Existing nodes with the same name will be overwritten (their requires/contains are replaced with the new content): ${names}`,
    nameSep: ", ",
    requiresLabel: "Requires",
    containsLabel: "Contains",
    standaloneNode: "(standalone node)",
    rootBadge: "entry point",
    overwriteBadge: "overwrite",
    plannedCount: "Nodes to be created:",
    importedToast: (n) => `Added ${n} node(s). Entry points are reachable from the list in the left sidebar.`,
  },
};

function t(): DslStrings {
  return STRINGS[effective()];
}

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

el("dsl-ai-prompt-copy").addEventListener("click", (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const originalText = btn.textContent;
  copyTextToClipboard(dslAiPrompt())
    .then(() => {
      btn.textContent = t().copied;
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1200);
    })
    .catch((err) => {
      console.warn(t().copyFailedLog, err);
      btn.textContent = t().copyFailed;
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
});

el("dsl-preview-btn").addEventListener("click", async () => {
  const text = el<HTMLTextAreaElement>("dsl-input").value;
  const preview = el("dsl-preview");
  el("dsl-modal-import").style.display = "none";
  dslPreviewNodes = [];
  dslConflicts = [];
  if (!text.trim()) {
    preview.innerHTML = `<div class="empty">${t().enterSyntax}</div>`;
    return;
  }
  preview.innerHTML = `<div class="empty">${t().parsing}</div>`;
  const res = await fetch("/api/dsl/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    preview.innerHTML = `<div class="empty">${t().parseFailed}</div>`;
    return;
  }
  const data = (await res.json()) as DslParseResponse;
  if (data.errors.length > 0) {
    preview.innerHTML = data.errors
      .map((e) => `<div class="wfcd-part" style="border-color:var(--blocked);color:var(--blocked);">${t().syntaxError(e.message, e.pos)}</div>`)
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
    ? `<div class="wfcd-part" style="border-color:var(--blocked);color:var(--blocked);">${t().overwriteWarning(dslConflicts.join(t().nameSep))}</div>`
    : "";
  const rows = dslPreviewNodes
    .map((n) => {
      const req = n.requires.length ? `${t().requiresLabel}: ${n.requires.join(", ")}` : "";
      const con = n.contains.length ? `${t().containsLabel}: ${n.contains.join(", ")}` : "";
      const detail = [req, con].filter(Boolean).join(" / ") || t().standaloneNode;
      const rootBadge = n.type === "Goal" ? `<span class="badge-vaulted">${t().rootBadge}</span>` : "";
      const conflictBadge = dslConflicts.includes(n.id) ? `<span class="badge-vaulted">${t().overwriteBadge}</span>` : "";
      return `<div class="wfcd-part"><div class="part-name">${n.name}${rootBadge}${conflictBadge}</div><div class="ph-row">${detail}</div></div>`;
    })
    .join("");
  preview.innerHTML = `${conflictWarning}<div class="ph-row"><b>${t().plannedCount}</b> ${dslPreviewNodes.length}</div>${rows}`;
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
  showToast(t().importedToast(dslPreviewNodes.length), "success");
});
