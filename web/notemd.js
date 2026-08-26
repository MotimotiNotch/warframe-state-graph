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
      const checkMatch = raw.match(/^- \[([ xX])\](?: (.*))?$/);
      const bulletMatch = raw.match(/^- (.*)$/);
      if (checkMatch) {
        if (!inList) { html += '<ul class="note-md-list">'; inList = true; }
        const checked = checkMatch[1].toLowerCase() === "x";
        const label = applyInline(escapeHtml(checkMatch[2] || ""));
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
        const m = lines[lineIdx].match(/^- \[([ xX])\](?: (.*))?$/);
        if (!m) return;
        const newChecked = m[1].toLowerCase() !== "x";
        lines[lineIdx] = `- [${newChecked ? "x" : " "}]${m[2] ? " " + m[2] : ""}`;
        onToggle(lines.join("\n"));
      });
    });
  }

  window.noteMdToHtml = noteMdToHtml;
  window.renderNoteMd = renderNoteMd;

  // ライブプレビュー版エディタ（Obsidian風、2026-08-22）。renderNoteMdは「常時raw textarea＋
  // 別枠プレビュー」の2面構成だったが、こちらは1つのcontenteditableに統合する。方式:
  // カーソルがある行だけ生のMarkdown文字列を表示し、それ以外の行は整形済み表示にする
  // （行単位のON/OFFなので、**text**の内側にカーソルがある間だけ`**`が見える、という
  // トークン単位の隠蔽はしない簡易版）。
  function lineToRawDiv(line, idx) {
    return `<div class="note-line note-line-active" data-line="${idx}">${line ? escapeHtml(line) : "<br>"}</div>`;
  }
  function lineToRenderedDiv(line, idx) {
    const checkMatch = line.match(/^- \[([ xX])\](?: (.*))?$/);
    const bulletMatch = line.match(/^- (.*)$/);
    if (checkMatch) {
      const checked = checkMatch[1].toLowerCase() === "x";
      const label = applyInline(escapeHtml(checkMatch[2] || ""));
      return `<div class="note-line note-md-check" data-line="${idx}"><label><input type="checkbox" data-line-checkbox ${checked ? "checked" : ""}><span>${label}</span></label></div>`;
    }
    if (bulletMatch) {
      return `<div class="note-line note-md-bullet" data-line="${idx}"><span class="note-md-bullet-dot">•</span>${applyInline(escapeHtml(bulletMatch[1]))}</div>`;
    }
    return `<div class="note-line" data-line="${idx}">${line ? applyInline(escapeHtml(line)) : "<br>"}</div>`;
  }

  // container: 空のdiv（contenteditableにする） / initialText: 初期の生Markdown文字列 /
  // onChange(newText): 変更が確定するたびに呼ばれる保存コールバック
  function createLiveEditor(container, initialText, onChange) {
    let lines = String(initialText || "").split("\n");
    if (lines.length === 0) lines = [""];
    let activeLine = -1;

    container.contentEditable = "true";
    container.classList.add("note-live-editor");

    function isEmpty() {
      return lines.length === 1 && lines[0] === "";
    }

    function render() {
      if (activeLine === -1 && isEmpty()) {
        container.innerHTML = `<div class="note-line note-placeholder" data-line="0">ここにメモを書く（Markdown対応、- [ ] でチェックリスト）</div>`;
        return;
      }
      container.innerHTML = lines.map((line, i) => (i === activeLine ? lineToRawDiv(line, i) : lineToRenderedDiv(line, i))).join("");
    }

    function getLineEl(idx) {
      return container.querySelector(`[data-line="${idx}"]`);
    }

    function placeCaret(lineIdx, col) {
      const el = getLineEl(lineIdx);
      if (!el) return;
      const sel = window.getSelection();
      const range = document.createRange();
      const textNode = el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE ? el.firstChild : null;
      if (textNode) {
        range.setStart(textNode, Math.min(col, textNode.length));
      } else {
        range.selectNodeContents(el);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function currentLineAndCol() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return null;
      const anchor = sel.anchorNode;
      const el = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
      if (!el) return null;
      const lineEl = el.closest("[data-line]");
      if (!lineEl || !container.contains(lineEl)) return null;
      const idx = Number(lineEl.dataset.line);
      const range = sel.getRangeAt(0).cloneRange();
      range.selectNodeContents(lineEl);
      range.setEnd(sel.anchorNode, sel.anchorOffset);
      return { idx, col: range.toString().length };
    }

    function syncActiveLineText() {
      if (activeLine < 0) return;
      const el = getLineEl(activeLine);
      if (el) lines[activeLine] = el.textContent.replace(/\n/g, "");
    }

    function emitChange() {
      onChange(lines.join("\n"));
    }

    function setActiveLine(idx, col) {
      if (idx === activeLine) return;
      syncActiveLineText();
      activeLine = idx;
      render();
      if (idx >= 0) placeCaret(idx, col || 0);
    }

    // 未フォーカスのコンテナへの1回のクリックは、同じ物理クリックに対して
    // 「focusin」と「click」の両方が発火する。focusinが先に走ってブラウザ自身の
    // （既に正しい）キャレット位置を読み取り、行をアクティブ化する——この過程で
    // innerHTMLが丸ごと差し替わり、placeCaret()で新しいキャレットも設定される。
    // その後にclickのハンドラが選択範囲を「もう一度」読み直すと、ブラウザが元の
    // クリック座標を新しいDOMに対して再解決した結果（実際にクリックしたのは
    // プレースホルダーだったのに）を拾ってしまうことがある——実際に確認済み
    // （2026-08-26）：[data-line]の外にはみ出して無反応になるだけの場合もあれば、
    // setActiveLineが古い行/列で再発火し、直後のキー入力の行分割計算を壊す場合も
    // あった。justFocusedで、focusinを発火させたそのクリック1回分だけclickを
    // 無効化する（focusinが既に正しく配置済みのため）。既にフォーカス済みの状態で
    // 別の行をクリックする場合は、focusinが再発火しないのでclick側の処理が働く。
    let justFocused = false;
    container.addEventListener("focusin", () => {
      const pos = currentLineAndCol();
      // focusinが位置を解決できた時だけclick側の再処理を抑制する。posがnull
      // （例えばプログラムからのfocus()等で解決可能な選択範囲が無い場合）なら、
      // clickの通常のフォールバック処理をそのまま働かせる。
      if (pos) {
        justFocused = true;
        setActiveLine(pos.idx, pos.col);
      }
    });

    container.addEventListener("focusout", () => {
      syncActiveLineText();
      activeLine = -1;
      render();
      emitChange();
    });

    container.addEventListener("click", (e) => {
      const cb = e.target.closest("input[data-line-checkbox]");
      if (cb) {
        const lineEl = e.target.closest("[data-line]");
        const idx = Number(lineEl.dataset.line);
        const m = lines[idx].match(/^- \[([ xX])\](?: (.*))?$/);
        if (m) {
          lines[idx] = `- [${m[1].toLowerCase() === "x" ? " " : "x"}]${m[2] ? " " + m[2] : ""}`;
          render();
          emitChange();
        }
        return;
      }
      if (justFocused) {
        justFocused = false;
        return;
      }
      const pos = currentLineAndCol();
      if (pos && pos.idx !== activeLine) setActiveLine(pos.idx, pos.col);
    });

    container.addEventListener("keyup", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        const pos = currentLineAndCol();
        if (pos && pos.idx !== activeLine) setActiveLine(pos.idx, pos.col);
      }
    });

    container.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        syncActiveLineText();
        const pos = currentLineAndCol();
        if (!pos) return;
        const line = lines[pos.idx] || "";
        lines.splice(pos.idx, 1, line.slice(0, pos.col), line.slice(pos.col));
        activeLine = pos.idx + 1;
        render();
        placeCaret(activeLine, 0);
        emitChange();
        return;
      }
      if (e.key === "Backspace") {
        const pos = currentLineAndCol();
        if (pos && pos.col === 0 && pos.idx > 0) {
          e.preventDefault();
          syncActiveLineText();
          const mergedCol = lines[pos.idx - 1].length;
          lines.splice(pos.idx - 1, 2, lines[pos.idx - 1] + lines[pos.idx]);
          activeLine = pos.idx - 1;
          render();
          placeCaret(activeLine, mergedCol);
          emitChange();
        }
      }
    });

    container.addEventListener("compositionend", () => {
      syncActiveLineText();
      emitChange();
    });

    render();

    return {
      setText(newText) {
        // scratch.jsはこのエディタを空文字列""で即座に作成し、パネルを開いてから
        // 実際のfetchをバックグラウンドで走らせる——完了後にsetTextが呼ばれる。
        // fetchが解決する前にユーザーがクリックして入力を始めた場合（パネルを開いて
        // すぐ打ち始める、まさに「最初に入力する」場面で起きやすい）、遅れて届いた
        // setTextが編集中の内容を握りつぶしてはいけない。activeLine !== -1は
        // ユーザーが既に編集中であることを意味し、ここでlines/activeLineを無条件に
        // 上書きすると、直前まで打っていた内容が最後にfetchした内容（通常は空）に
        // 巻き戻る——「改行すらできない」ように見える。2026-08-26、この競合を
        // 実際に再現して確認済み。
        if (activeLine !== -1) return;
        syncActiveLineText();
        lines = String(newText || "").split("\n");
        if (lines.length === 0) lines = [""];
        activeLine = -1;
        render();
      },
    };
  }

  window.createLiveEditor = createLiveEditor;
})();
