// クイックメモ（Chain View/Loadouts/Collections/Standing/Statsのどのエンティティにも
// 紐づかない、全ページ共通のスクラッチ領域）。「アイテムのカウントアップ、簡易チェック
// リスト、その他一時的に残しておきたいもの」置き場として2026-08-21に新設。
// booster.jsと同じ「ヘッダー右上の共有バーにボタン→クリックでドラッグ可能なパネルを開閉」
// パターンを踏襲する（見た目・操作感の一貫性のため）。データはサーバー側data/scratch.json
// に永続化するので、booster.js（localStorageのみ）と違い開くたびにGET /api/scratchで
// 最新を取り直す（他ページで編集した内容を反映するため）。
(function () {
  const POS_KEY = "warframe-state-graph:scratch-panel-pos";
  const OPEN_KEY = "warframe-state-graph:scratch-panel-open";
  const DEFAULT_POS = { top: 10, left: 10 };

  function genId(prefix) {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function loadPanelPos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.top === "number" && typeof p.left === "number") return p;
      }
    } catch (e) { /* 無視してデフォルトへ */ }
    return { ...DEFAULT_POS };
  }
  function savePanelPos(pos) {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (e) { /* 無視 */ }
  }
  function loadOpen() {
    try { return localStorage.getItem(OPEN_KEY) === "1"; } catch (e) { return false; }
  }
  function saveOpen(open) {
    try { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch (e) { /* 無視 */ }
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = `
      #scratch-toggle-btn {
        display: inline-flex; align-items: center; gap: 5px;
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a); color: var(--muted, #9aa0ab);
        border-radius: 10px; padding: 6px 10px; font-size: 0.8rem; cursor: pointer;
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      }
      #scratch-toggle-btn:hover, #scratch-toggle-btn.active { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }

      #scratch-panel {
        position: fixed;
        z-index: 150;
        /* パネル本体は文字を読む場所なので、半透明の--panelでなく
           ほぼ不透明の--popover-bgを使う（popover-opacityルールと同じ理由）。 */
        background: var(--popover-bg, rgba(20, 22, 28, 0.94));
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a);
        border-radius: 14px;
        font-size: 0.78rem;
        color: var(--text, #e4e6ec);
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        width: 300px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
      }
      #scratch-panel.hidden { display: none; }
      #scratch-panel .s-head {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; border-bottom: 1px solid var(--border, #2a2e3a);
        cursor: grab; user-select: none; touch-action: none; flex: 0 0 auto;
      }
      #scratch-panel .s-head.dragging { cursor: grabbing; }
      #scratch-panel .s-head .s-title { font-weight: 600; color: var(--text, #e4e6ec); flex: 1; }
      #scratch-panel .s-head button {
        background: transparent; border: none; color: var(--muted, #9aa0ab); cursor: pointer; line-height: 0; padding: 2px;
      }
      #scratch-panel .s-head button:hover { color: var(--danger, #e88c93); }
      #scratch-panel .s-body { padding: 8px; overflow-y: auto; }

      #scratch-panel .s-section-title { color: var(--muted, #9aa0ab); font-size: 0.68rem; margin: 6px 0 4px; text-transform: uppercase; letter-spacing: .02em; }
      #scratch-panel .s-section-title:first-child { margin-top: 0; }

      /* ページごとに.popoverのleft/right基準がバラバラ（index.htmlはleft:0、他はright:0）なため、
         このパネル自身の右寄り位置に合わせてID差でここだけ明示的に上書きする（2026-08-22、
         index.html上ではみ出す不具合の修正）。 */
      #scratch-panel .popover-wrap { position: relative; display: inline-flex; }
      #scratch-panel .popover {
        position: absolute; top: calc(100% + 6px); right: 0; left: auto; z-index: 200;
        background: var(--popover-bg, rgba(20, 22, 28, 0.94)); backdrop-filter: blur(var(--panel-blur)); -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a); border-radius: 10px; padding: 8px 10px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4); width: 220px; font-size: 0.72rem; line-height: 1.7;
        color: var(--text, #e4e6ec);
      }
      #scratch-panel .popover code { background: var(--bg, #12141a); padding: 0 3px; border-radius: 3px; }

      #scratch-panel .note-live-editor {
        width: 100%; box-sizing: border-box; min-height: 60px; max-height: 220px; overflow-y: auto;
        background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 6px; font-size: 0.78rem; padding: 6px; font-family: inherit; cursor: text;
      }
      #scratch-panel .note-live-editor .note-line { min-height: 1.3em; word-break: break-word; }
      #scratch-panel .note-live-editor .note-line-active { background: rgba(255, 255, 255, 0.06); border-radius: 3px; }
      #scratch-panel .note-live-editor .note-placeholder { color: var(--muted, #9aa0ab); }
      #scratch-panel .note-live-editor .note-md-check { padding: 1px 0; }
      #scratch-panel .note-live-editor .note-md-check label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
      #scratch-panel .note-live-editor .note-md-check input[type="checkbox"] { cursor: pointer; }
      #scratch-panel .note-live-editor .note-md-bullet { display: flex; gap: 6px; }
      #scratch-panel .note-live-editor .note-md-bullet-dot { color: var(--muted, #9aa0ab); }

      .scratch-counter-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
      .scratch-counter-row .sc-label-input {
        flex: 1; min-width: 0;
        background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 4px; font-size: 0.75rem; padding: 3px 5px; font-family: inherit;
      }
      .scratch-counter-row .sc-value {
        color: var(--actionable, #7ee3a9); font-variant-numeric: tabular-nums;
        width: 3.6em; text-align: right; background: var(--bg, #12141a);
        border: 1px solid var(--border, #2a2e3a); border-radius: 4px; padding: 2px 4px;
        font-family: inherit; font-size: inherit; -moz-appearance: textfield;
      }
      .scratch-counter-row .sc-value::-webkit-inner-spin-button,
      .scratch-counter-row .sc-value::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      .scratch-counter-row button {
        background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 4px; font-size: 0.68rem; padding: 2px 4px; cursor: pointer; line-height: 0;
      }
      .scratch-counter-row button:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      .scratch-counter-row button.sc-del:hover { border-color: var(--danger, #e88c93); color: var(--danger, #e88c93); }
      #scratch-add-counter-btn {
        display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;
        background: transparent; color: var(--muted, #9aa0ab); border: 1px dashed var(--border, #2a2e3a);
        border-radius: 6px; font-size: 0.75rem; padding: 4px 8px; cursor: pointer; width: 100%; justify-content: center;
      }
      #scratch-add-counter-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #scratch-counters-empty { color: var(--muted, #9aa0ab); font-size: 0.72rem; padding: 2px 0; }
    `;
    document.head.appendChild(style);
  }

  let cache = null; // 直近取得したscratchData（section間の再描画で使い回す）

  async function fetchData() {
    const res = await fetch("/api/scratch");
    cache = res.ok ? await res.json() : { note: "", counters: [] };
    return cache;
  }

  let noteEditor = null;

  function renderNote() {
    if (noteEditor) noteEditor.setText(cache.note || "");
  }

  async function saveNote(newNote) {
    const res = await fetch("/api/scratch/note", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: newNote }) });
    if (res.ok) cache.note = newNote;
  }

  function renderCounters() {
    const body = document.getElementById("scratch-counters-body");
    if (!body) return;
    const counters = cache.counters || [];
    if (!counters.length) {
      body.innerHTML = `<div id="scratch-counters-empty">まだありません</div>`;
      return;
    }
    body.innerHTML = counters.map((c) => `
      <div class="scratch-counter-row" data-counter-id="${c.id}">
        <input type="text" class="sc-label-input" placeholder="メモ" value="${escapeHtmlLocal(c.label)}">
        <button class="sc-dec" title="-1">${window.icon ? window.icon("minus", { size: 12 }) : "-"}</button>
        <input type="number" class="sc-value" value="${c.value}">
        <button class="sc-inc" title="+1">${window.icon ? window.icon("plus", { size: 12 }) : "+"}</button>
        <button class="sc-del" title="削除">${window.icon ? window.icon("x", { size: 12 }) : "×"}</button>
      </div>
    `).join("");

    body.querySelectorAll(".sc-label-input").forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.closest(".scratch-counter-row").dataset.counterId;
        await fetch(`/api/scratch/counters/${encodeURIComponent(id)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: input.value }),
        });
        const c = cache.counters.find((x) => x.id === id);
        if (c) c.label = input.value;
      });
    });
    body.querySelectorAll(".sc-inc").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest(".scratch-counter-row").dataset.counterId;
        const res = await fetch(`/api/scratch/counters/${encodeURIComponent(id)}/increment`, { method: "POST" });
        if (res.ok) {
          const updated = await res.json();
          const c = cache.counters.find((x) => x.id === id);
          if (c) c.value = updated.value;
          renderCounters();
        }
      });
    });
    body.querySelectorAll(".sc-dec").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest(".scratch-counter-row").dataset.counterId;
        const res = await fetch(`/api/scratch/counters/${encodeURIComponent(id)}/decrement`, { method: "POST" });
        if (res.ok) {
          const updated = await res.json();
          const c = cache.counters.find((x) => x.id === id);
          if (c) c.value = updated.value;
          renderCounters();
        }
      });
    });
    body.querySelectorAll(".sc-value").forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.closest(".scratch-counter-row").dataset.counterId;
        const value = parseInt(input.value, 10) || 0;
        const res = await fetch(`/api/scratch/counters/${encodeURIComponent(id)}/value`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }),
        });
        if (res.ok) {
          const updated = await res.json();
          const c = cache.counters.find((x) => x.id === id);
          if (c) c.value = updated.value;
          renderCounters();
        }
      });
    });
    body.querySelectorAll(".sc-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest(".scratch-counter-row").dataset.counterId;
        await fetch(`/api/scratch/counters/${encodeURIComponent(id)}`, { method: "DELETE" });
        cache.counters = cache.counters.filter((x) => x.id !== id);
        renderCounters();
      });
    });
  }

  function escapeHtmlLocal(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function render() {
    await fetchData();
    renderNote();
    renderCounters();
  }

  function applyPanelPos(panel, pos) {
    panel.style.top = `${pos.top}px`;
    panel.style.left = `${pos.left}px`;
  }

  function positionNextToButton(panel, btn) {
    const btnRect = btn.getBoundingClientRect();
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    let left = btnRect.right + 8;
    if (left + w > window.innerWidth) left = btnRect.left - w - 8;
    left = Math.min(Math.max(0, left), Math.max(0, window.innerWidth - w));
    let top = btnRect.top;
    top = Math.min(Math.max(0, top), Math.max(0, window.innerHeight - h));
    applyPanelPos(panel, { top, left });
  }

  function setupDrag(panel, handle) {
    let dragging = false;
    let start = { x: 0, y: 0 };
    let origin = { top: 0, left: 0 };

    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      handle.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY };
      const rect = panel.getBoundingClientRect();
      origin = { top: rect.top, left: rect.left };
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const maxLeft = window.innerWidth - panel.offsetWidth;
      const maxTop = window.innerHeight - panel.offsetHeight;
      const pos = {
        left: Math.min(Math.max(0, origin.left + dx), Math.max(0, maxLeft)),
        top: Math.min(Math.max(0, origin.top + dy), Math.max(0, maxTop)),
      };
      applyPanelPos(panel, pos);
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("dragging");
      if (e && handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) {
        handle.releasePointerCapture(e.pointerId);
      }
      const rect = panel.getBoundingClientRect();
      savePanelPos({ top: rect.top, left: rect.left });
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function togglePanel(btn, panel) {
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !opening);
    btn.classList.toggle("active", opening);
    saveOpen(opening);
    if (opening) {
      positionNextToButton(panel, btn);
      render();
    }
  }

  function init() {
    injectStyle();

    const btn = document.createElement("button");
    btn.id = "scratch-toggle-btn";
    btn.innerHTML = (window.icon ? window.icon("pencil") : "") + "クイックメモ";
    getTopRightBar().appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "scratch-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div class="s-head" id="scratch-drag-handle">
        <span class="s-title">${window.icon ? window.icon("pencil", { size: 14 }) : ""}クイックメモ</span>
        <div class="popover-wrap">
          <button class="icon-btn" id="scratch-help-toggle" title="記法チートシート">${window.icon ? window.icon("circle-alert", { size: 14 }) : "!"}</button>
          <div class="popover hidden" id="scratch-help-popover">
            <code>**太字**</code> で太字<br>
            <code>- </code> で箇条書き<br>
            <code>- [ ]</code> / <code>- [x]</code> でチェックリスト（クリックで切替）<br>
            編集中の行だけ生のMarkdown表示、他の行は整形表示になります。
          </div>
        </div>
        <button id="scratch-close" title="閉じる">${window.icon ? window.icon("x", { size: 14 }) : "×"}</button>
      </div>
      <div class="s-body">
        <div id="scratch-note-editor"></div>
        <div class="s-section-title">カウントアップ</div>
        <div id="scratch-counters-body"></div>
        <button id="scratch-add-counter-btn">${window.icon ? window.icon("plus", { size: 12 }) : "+"}カウントアップを追加</button>
      </div>
    `;
    document.body.appendChild(panel);
    applyPanelPos(panel, loadPanelPos());

    btn.addEventListener("click", () => togglePanel(btn, panel));
    panel.querySelector("#scratch-close").addEventListener("click", () => togglePanel(btn, panel));
    setupDrag(panel, panel.querySelector("#scratch-drag-handle"));

    panel.querySelector("#scratch-help-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      panel.querySelector("#scratch-help-popover").classList.toggle("hidden");
    });
    panel.querySelector("#scratch-help-popover").addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      panel.querySelector("#scratch-help-popover").classList.add("hidden");
    });

    noteEditor = window.createLiveEditor(panel.querySelector("#scratch-note-editor"), "", saveNote);

    panel.querySelector("#scratch-add-counter-btn").addEventListener("click", async () => {
      const c = { id: genId("counter"), label: "", value: 0 };
      const res = await fetch("/api/scratch/counters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
      if (res.ok) {
        cache = await res.json();
        renderCounters();
      }
    });

    if (loadOpen()) {
      panel.classList.remove("hidden");
      btn.classList.add("active");
      render();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
