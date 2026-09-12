// Port of web/notemd.js — the note-field lightweight Markdown subset
// (checkbox/bullet/bold/newline only) plus the contenteditable live editor.
//
// XSS stance: escapeHtml runs over the *entire* text before any markup
// substitution, and only fixed tag strings are ever spliced in — raw HTML
// tags are never permitted through, so whatever a user types into a note
// renders as inert text.

import { effective, onLocaleChange } from "./locale.ts";

const PLACEHOLDER: Record<"ja" | "en", string> = {
  ja: "ここにメモを書く（Markdown対応、- [ ] でチェックリスト）",
  en: "Write your note here (Markdown supported, - [ ] for a checklist)",
};

function escapeHtml(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Call only on an already-escaped string. **text** -> <strong>text</strong>. */
function applyInline(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** applyInline の textContent 版（マークアップを剥いだ表示文字列）。 */
function stripInline(raw: string): string {
  return raw.replace(/\*\*(.+?)\*\*/g, "$1");
}

export function noteMdToHtml(text: string | null | undefined): string {
  const lines = String(text || "").split("\n");
  let html = "";
  let inList = false;
  lines.forEach((raw, i) => {
    const checkMatch = raw.match(/^- \[([ xX])\](?: (.*))?$/);
    const bulletMatch = raw.match(/^- (.*)$/);
    if (checkMatch) {
      if (!inList) {
        html += '<ul class="note-md-list">';
        inList = true;
      }
      const checked = checkMatch[1]!.toLowerCase() === "x";
      const label = applyInline(escapeHtml(checkMatch[2] || ""));
      html += `<li class="note-md-check"><label><input type="checkbox" data-note-line="${i}" ${checked ? "checked" : ""}><span>${label}</span></label></li>`;
    } else if (bulletMatch) {
      if (!inList) {
        html += '<ul class="note-md-list">';
        inList = true;
      }
      html += `<li>${applyInline(escapeHtml(bulletMatch[1]!))}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += raw ? `<div>${applyInline(escapeHtml(raw))}</div>` : "<br>";
    }
  });
  if (inList) html += "</ul>";
  return html;
}

/** container: render target / text: raw note string / onToggle(newText): save callback on checkbox change */
export function renderNoteMd(container: HTMLElement, text: string | null | undefined, onToggle: (newText: string) => void): void {
  if (!text) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = noteMdToHtml(text);
  container.querySelectorAll<HTMLInputElement>("[data-note-line]").forEach((cb) => {
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      const lineIdx = Number(cb.dataset.noteLine);
      const lines = String(text).split("\n");
      const m = lines[lineIdx]!.match(/^- \[([ xX])\](?: (.*))?$/);
      if (!m) return;
      const newChecked = m[1]!.toLowerCase() !== "x";
      lines[lineIdx] = `- [${newChecked ? "x" : " "}]${m[2] ? " " + m[2] : ""}`;
      onToggle(lines.join("\n"));
    });
  });
}

// Live-preview editor (Obsidian-style, 2026-08-22). renderNoteMd is a
// "raw textarea + separate preview" two-pane layout; this consolidates into
// one contenteditable: only the line the caret is on shows raw Markdown,
// every other line shows its rendered form (line-granular, not the
// token-granular hiding of a real editor — e.g. `**` around bold text is
// invisible even mid-token unless that whole line is active).
function lineToRawDiv(line: string, idx: number): string {
  return `<div class="note-line note-line-active" data-line="${idx}">${line ? escapeHtml(line) : "<br>"}</div>`;
}
function lineToRenderedDiv(line: string, idx: number): string {
  const checkMatch = line.match(/^- \[([ xX])\](?: (.*))?$/);
  const bulletMatch = line.match(/^- (.*)$/);
  if (checkMatch) {
    const checked = checkMatch[1]!.toLowerCase() === "x";
    const label = applyInline(escapeHtml(checkMatch[2] || ""));
    return `<div class="note-line note-md-check" data-line="${idx}"><label><input type="checkbox" data-line-checkbox ${checked ? "checked" : ""}><span>${label}</span></label></div>`;
  }
  if (bulletMatch) {
    return `<div class="note-line note-md-bullet" data-line="${idx}"><span class="note-md-bullet-dot">•</span>${applyInline(escapeHtml(bulletMatch[1]!))}</div>`;
  }
  return `<div class="note-line" data-line="${idx}">${line ? applyInline(escapeHtml(line)) : "<br>"}</div>`;
}

/** lineToRenderedDiv が出す div の textContent。生テキストと突き合わせて
 *  「その行のDOMは無傷か」を判定するのに使う（recoverFromDom）。 */
function renderedTextOf(line: string): string {
  const checkMatch = line.match(/^- \[([ xX])\](?: (.*))?$/);
  if (checkMatch) return stripInline(checkMatch[2] || "");
  const bulletMatch = line.match(/^- (.*)$/);
  if (bulletMatch) return "•" + stripInline(bulletMatch[1]!);
  return stripInline(line);
}

export interface LiveEditor {
  setText(newText: string | null | undefined): void;
}

/** container: empty div (becomes contenteditable) / initialText: starting raw Markdown /
 * onChange(newText): fires on every committed change */
export function createLiveEditor(
  container: HTMLElement,
  initialText: string | null | undefined,
  onChange: (newText: string) => void,
): LiveEditor {
  let lines = String(initialText || "").split("\n");
  if (lines.length === 0) lines = [""];
  let activeLine = -1;

  container.contentEditable = "true";
  container.classList.add("note-live-editor");

  function isEmpty(): boolean {
    return lines.length === 1 && lines[0] === "";
  }

  function render(): void {
    if (activeLine === -1 && isEmpty()) {
      container.innerHTML = `<div class="note-line note-placeholder" data-line="0">${PLACEHOLDER[effective()]}</div>`;
      return;
    }
    container.innerHTML = lines.map((line, i) => (i === activeLine ? lineToRawDiv(line, i) : lineToRenderedDiv(line, i))).join("");
  }

  function getLineEl(idx: number): HTMLElement | null {
    return container.querySelector(`[data-line="${idx}"]`);
  }

  function placeCaret(lineIdx: number, col: number): void {
    const el = getLineEl(lineIdx);
    if (!el) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const textNode = el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE ? el.firstChild : null;
    if (textNode) {
      range.setStart(textNode, Math.min(col, (textNode as Text).length));
    } else {
      range.selectNodeContents(el);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function currentLineAndCol(): { idx: number; col: number } | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.anchorNode) return null;
    const anchor = sel.anchorNode;
    const el = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
    if (!el) return null;
    const lineEl = el.closest("[data-line]");
    if (!lineEl || !container.contains(lineEl)) return null;
    const idx = Number((lineEl as HTMLElement).dataset.line);
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(lineEl);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return { idx, col: range.toString().length };
  }

  function syncActiveLineText(): void {
    if (activeLine < 0) return;
    const el = getLineEl(activeLine);
    if (el) lines[activeLine] = (el.textContent ?? "").replace(/\n/g, "");
  }

  // ---- DOM構造が壊れたときの復旧 -------------------------------------------
  // このエディタはDOMをrender()でしか書かず、読み戻すのはsyncActiveLineTextが
  // 見る1要素（[data-line=activeLine]）だけ。つまりブラウザ任せの編集のうち
  // *構造*を変えるもの——全選択削除・複数行にまたがる削除・貼り付け・ドラッグ
  // ——を通ると、linesは既に存在しないDOMを指したままになる。全消しが最悪で、
  // Chromeは[data-line]のラッパごと消し（2回目のBackspaceでcontainerが空に
  // なる）、次に打った文字はcontainer直下の裸のテキストノードになる。すると
  // currentLineAndCol()が[data-line]祖先を見つけられずnullを返し、既に
  // preventDefault()済みのEnterがそのままreturnして**何も起きない**。カーソルを
  // 外すと直るのは、focusoutのrender()がラッパを作り直すからで、同時に古いlines
  // から消したはずの本文が復活していた（2026-09-12にChromeで再現・確認）。
  function structureIsStale(): boolean {
    if (container.querySelectorAll("[data-line]").length !== lines.length) return true;
    return activeLine >= 0 && !getLineEl(activeLine);
  }

  /** 中身を削られた「表示だけの行」の生テキストを組み直す。残っているクラスで
   *  元が何だったかは分かるので、記法の頭を付け直す——そのまま表示文字列を採ると
   *  箇条書きの "•" が本文に混ざって保存されてしまう。中身が空になった行は
   *  ユーザーがその行ごと消したということなので、空行として返す（"- [ ]"だけの
   *  行を勝手に生やさない）。 */
  function rawFromDamaged(lineEl: HTMLElement, shown: string): string {
    if (!shown) return "";
    if (lineEl.classList.contains("note-md-bullet")) return "- " + shown.replace(/^•/, "");
    if (lineEl.classList.contains("note-md-check")) {
      const box = lineEl.querySelector<HTMLInputElement>("input[data-line-checkbox]");
      return `- [${box?.checked ? "x" : " "}] ${shown}`;
    }
    return shown;
  }

  /** 現在のDOMからlines/activeLine/キャレットを組み直し、描き直す。 */
  function recoverFromDom(): void {
    const sel = window.getSelection();
    const anchorNode = sel && sel.rangeCount ? sel.anchorNode : null;
    const anchorOffset = sel ? sel.anchorOffset : 0;

    // 要素の子は1行、裸のテキストノードの連なりも1行。空のcontainerに
    // ブラウザが置く詰め物の<br>は行として数えない。
    const parts: { text: string; nodes: Node[] }[] = [];
    let run: { text: string; nodes: Node[] } | null = null;
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== "BR") {
        const lineEl = node as HTMLElement;
        const shown = (lineEl.textContent ?? "").replace(/\n/g, "");
        const idx = lineEl.dataset.line === undefined ? -1 : Number(lineEl.dataset.line);
        const old = idx >= 0 ? lines[idx] : undefined;
        // 無傷で残っている行だけはlines側の生テキストを採る。表示文字列から
        // 逆算すると "- [x] foo" が "foo" に、"**a**" が "a" に潰れるため。
        const intact = old !== undefined && (idx === activeLine ? old === shown : renderedTextOf(old) === shown);
        parts.push({ text: intact ? old! : rawFromDamaged(lineEl, shown), nodes: [lineEl] });
        run = null;
      } else if (node.nodeType === Node.TEXT_NODE) {
        if (!run) {
          run = { text: "", nodes: [] };
          parts.push(run);
        }
        run.text += (node.textContent ?? "").replace(/\n/g, "");
        run.nodes.push(node);
      }
    }
    if (!parts.length) parts.push({ text: "", nodes: [] });

    let caretIdx = 0;
    let caretCol = 0;
    if (anchorNode === container) {
      caretIdx = Math.min(anchorOffset, parts.length - 1);
    } else if (anchorNode) {
      const i = parts.findIndex((p) => p.nodes.some((n) => n === anchorNode || n.contains(anchorNode)));
      if (i >= 0) {
        caretIdx = i;
        const range = document.createRange();
        range.setStart(parts[i]!.nodes[0]!, 0);
        range.setEnd(anchorNode, anchorOffset);
        caretCol = range.toString().length;
      }
    }

    lines = parts.map((p) => p.text);
    activeLine = Math.min(caretIdx, lines.length - 1);
    render();
    placeCaret(activeLine, caretCol);
  }

  function emitChange(): void {
    onChange(lines.join("\n"));
  }

  function setActiveLine(idx: number, col?: number): void {
    if (idx === activeLine) return;
    syncActiveLineText();
    activeLine = idx;
    render();
    if (idx >= 0) placeCaret(idx, col || 0);
  }

  // A click into a not-yet-focused container fires both "focusin" and
  // "click" for the same physical click. focusin runs first and reads the
  // browser's own (already-correct) caret placement, then activates the
  // line — which re-renders the container (innerHTML replaced) and sets its
  // own caret via placeCaret(). If click's handler *also* re-reads the
  // selection afterward, it's reading a selection the browser may have just
  // re-resolved against that brand-new DOM at the original click's pixel
  // coordinates, not against the placeholder that was actually clicked —
  // observed empirically (2026-08-26) to sometimes land outside any
  // [data-line] element (silently no-ops, but the keystroke that follows
  // still targets a line the user never actually entered) or to re-fire
  // setActiveLine with a stale line/col, corrupting the very next
  // keystroke's line-split math. justFocused makes click a no-op for the
  // one click that just triggered focusin, since focusin already placed the
  // caret correctly; click still runs its own placement for a later click
  // on a different line while the editor is already focused.
  let justFocused = false;
  // A checkbox is its own focusable element, distinct from the container.
  // Clicking one moves focus away from whatever line was being edited,
  // firing this container's own focusout first — which unconditionally
  // reset activeLine to -1. The next Enter/Backspace would then find no
  // valid line to act on (currentLineAndCol's container.contains(lineEl)
  // check fails against the now-detached old DOM) and silently no-op.
  // Confirmed 2026-08-26 as the actual cause of "occasionally can't make a
  // newline" reported after editing a multi-line note with checklists for a
  // while (not the earlier open-panel fetch race). If focus is landing on
  // something still inside this container (the checkbox) rather than
  // leaving entirely, stash the line/col so the checkbox's own click
  // handler can restore editing right after toggling it.
  let pendingRestore: { idx: number; col: number } | null = null;
  container.addEventListener("focusin", () => {
    const pos = currentLineAndCol();
    // Only suppress click's own fallback pass if focusin actually resolved
    // a line and activated it. If pos is null (e.g. focus arrived without a
    // resolvable selection), click must still get its normal chance to try.
    if (pos) {
      justFocused = true;
      setActiveLine(pos.idx, pos.col);
    }
  });

  container.addEventListener("focusout", () => {
    // Must check before render() rebuilds the DOM — afterward, a focused
    // checkbox that render() just replaced is detached and focus has
    // already snapped back to <body>, so this check would always be false.
    const shouldRestore = activeLine >= 0 && container.contains(document.activeElement);
    const pos = shouldRestore ? currentLineAndCol() : null;
    syncActiveLineText();
    activeLine = -1;
    render();
    emitChange();
    if (shouldRestore && pos) pendingRestore = pos;
  });

  container.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const cb = target.closest("input[data-line-checkbox]");
    if (cb) {
      const lineEl = target.closest("[data-line]") as HTMLElement;
      const idx = Number(lineEl.dataset.line);
      const m = lines[idx]!.match(/^- \[([ xX])\](?: (.*))?$/);
      if (m) {
        lines[idx] = `- [${m[1]!.toLowerCase() === "x" ? " " : "x"}]${m[2] ? " " + m[2] : ""}`;
      }
      if (pendingRestore) {
        const restore = pendingRestore;
        pendingRestore = null;
        activeLine = restore.idx;
        render();
        // The checkbox itself still holds real browser focus at this point.
        // container.focus() moves focus back, but the browser applies its
        // own default selection (collapsed to the very start of the
        // contenteditable) as part of that same focus change, and it can
        // silently override a Range set synchronously (or on the very next
        // task) right after focus() — observed empirically 2026-08-26 to be
        // timing-sensitive enough that even a setTimeout(fn, 0) sometimes
        // lost the race. Two nested requestAnimationFrame calls defer until
        // after the browser has painted the post-focus state at least once,
        // which is the standard, more reliable way to wait out this class of
        // browser-internal focus/selection settling.
        container.focus();
        requestAnimationFrame(() => requestAnimationFrame(() => placeCaret(restore.idx, restore.col)));
      } else {
        render();
      }
      emitChange();
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

  // 構造を壊す編集（全消し・複数行削除・貼り付け・ドラッグ）はここで拾って
  // linesをDOMに合わせ直す。1行の中で打っているだけの通常の入力では
  // structureIsStale()が偽なので、従来通り再描画は起きない（IMEやキャレットに
  // 触らない）。
  container.addEventListener("input", (e) => {
    if ((e as InputEvent).isComposing) return;
    if (!structureIsStale()) return;
    recoverFromDom();
    emitChange();
  });

  container.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      // preventDefault済みなので、ここでcurrentLineAndColがnullを返すと
      // 「Enterを押しても何も起きない」になる。先に構造を直しておく。
      if (structureIsStale()) recoverFromDom();
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
        const mergedCol = lines[pos.idx - 1]!.length;
        lines.splice(pos.idx - 1, 2, lines[pos.idx - 1]! + lines[pos.idx]!);
        activeLine = pos.idx - 1;
        render();
        placeCaret(activeLine, mergedCol);
        emitChange();
      }
    }
  });

  container.addEventListener("compositionend", () => {
    // input側はisComposing中の構造破壊を素通りさせている（変換中に描き直すと
    // 未確定文字列が飛ぶ）ので、確定したここで拾う。選択範囲ごと変換で
    // 置き換えた場合がこれに当たる。
    if (structureIsStale()) recoverFromDom();
    else syncActiveLineText();
    emitChange();
  });

  // Only the empty-state placeholder text is locale-dependent; re-render on
  // a locale flip so it doesn't sit stale until the next real edit.
  onLocaleChange(() => {
    if (isEmpty() && activeLine === -1) render();
  });

  render();

  return {
    setText(newText) {
      // scratch.ts creates this editor synchronously with "" text, opens the
      // panel, and only *afterward* fires the real fetch in the background —
      // its resolution calls setText once the note arrives. If the user
      // clicks in and starts typing before that fetch resolves (the common
      // case for a fast typist right after opening the panel — exactly the
      // "first thing I type" scenario), a late setText must not clobber
      // in-progress edits: activeLine !== -1 means the user is already
      // editing, and blindly overwriting lines/activeLine here reverts
      // everything they just typed back to whatever was last fetched
      // (typically empty), which reads as "I can't even make a newline."
      // Verified empirically (2026-08-26) against this exact race.
      if (activeLine !== -1) return;
      syncActiveLineText();
      lines = String(newText || "").split("\n");
      if (lines.length === 0) lines = [""];
      activeLine = -1;
      render();
    },
  };
}
