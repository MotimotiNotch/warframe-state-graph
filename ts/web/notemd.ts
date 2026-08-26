// Port of web/notemd.js — the note-field lightweight Markdown subset
// (checkbox/bullet/bold/newline only) plus the contenteditable live editor.
//
// XSS stance: escapeHtml runs over the *entire* text before any markup
// substitution, and only fixed tag strings are ever spliced in — raw HTML
// tags are never permitted through, so whatever a user types into a note
// renders as inert text.
//
// Not yet wired into the bundled-JS routing (`/notemd.js` still serves the
// original, unported web/notemd.js via the server's legacy static
// passthrough) because loadouts.html/collections.html — Phase 9/10, not
// ported yet — still load it as a plain classic `<script src>`, and an ESM
// bundle's `export` syntax would be a SyntaxError there. This module exists
// now so already-ported code (scratch.ts) can `import` it directly; the
// `/notemd.js` route itself cuts over once Phase 9/10 replace those pages'
// script tags with `type="module"`.

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
      container.innerHTML = `<div class="note-line note-placeholder" data-line="0">ここにメモを書く（Markdown対応、- [ ] でチェックリスト）</div>`;
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
    syncActiveLineText();
    activeLine = -1;
    render();
    emitChange();
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
    syncActiveLineText();
    emitChange();
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
