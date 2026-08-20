// note欄向けの軽量Markdownサブセット（チェックボックス/箇条書き/太字/改行のみ）。
// CommonMark準拠のフルパーサーは入れず、Obsidianのライブプレビューっぽい体験に必要な
// 記法だけをサポートする（既存のGo単体・npm非依存方針とも整合、2026-08-20設計）。
//
// XSSに対する方針: generic なMarkdownパーサー（marked.js等）は既定でインラインHTMLを
// そのまま素通りさせるため、note内に <img onerror=...> のようなペイロードを書かれると
// 実行されてしまう。ここでは必ず escapeHtml で全文を無害化してから、記法パターンだけを
// 固定のタグ文字列に置き換える（生HTMLタグの許可は一切しない）ことで、note内にどんな
// 文字列が書かれても表示テキストとして無害化されることを保証する。
(function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // escapeHtml済みの文字列に対してのみ呼ぶ。**text** → <strong>text</strong>。
  function applyInline(escaped) {
    return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function noteMdToHtml(text) {
    const lines = String(text || "").split("\n");
    let html = "";
    let inList = false;
    lines.forEach((raw, i) => {
      const checkMatch = raw.match(/^- \[([ xX])\] (.*)$/);
      const bulletMatch = raw.match(/^- (.*)$/);
      if (checkMatch) {
        if (!inList) { html += '<ul class="note-md-list">'; inList = true; }
        const checked = checkMatch[1].toLowerCase() === "x";
        const label = applyInline(escapeHtml(checkMatch[2]));
        html += `<li class="note-md-check"><label><input type="checkbox" data-note-line="${i}" ${checked ? "checked" : ""}><span>${label}</span></label></li>`;
      } else if (bulletMatch) {
        if (!inList) { html += '<ul class="note-md-list">'; inList = true; }
        html += `<li>${applyInline(escapeHtml(bulletMatch[1]))}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += raw ? `<div>${applyInline(escapeHtml(raw))}</div>` : "<br>";
      }
    });
    if (inList) html += "</ul>";
    return html;
  }

  // container: 描画先DOM要素 / text: 生note文字列 / onToggle(newText): チェック変更時の保存コールバック
  function renderNoteMd(container, text, onToggle) {
    if (!text) { container.innerHTML = ""; return; }
    container.innerHTML = noteMdToHtml(text);
    container.querySelectorAll("[data-note-line]").forEach((cb) => {
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        const lineIdx = Number(cb.dataset.noteLine);
        const lines = String(text).split("\n");
        const m = lines[lineIdx].match(/^- \[([ xX])\] (.*)$/);
        if (!m) return;
        const newChecked = m[1].toLowerCase() !== "x";
        lines[lineIdx] = `- [${newChecked ? "x" : " "}] ${m[2]}`;
        onToggle(lines.join("\n"));
      });
    });
  }

  window.noteMdToHtml = noteMdToHtml;
  window.renderNoteMd = renderNoteMd;
})();
