// ブースタータイマー（経験値/クレジット/リソース等）ウィジェット。02_Requirements_and_Roadmap.md 項目15。
// アカウント固有のブースター起動状態を取れる公式APIは無いため、アプリ側で手動起動する
// ローカルタイマーとして実装。Chain View/Loadouts/Collectionsのどのページでも同じ見た目で
// 使えるよう共通スクリプトにして、各ページのbody末尾で読み込むだけで動く自己完結ウィジェットにしてある。
//
// 経緯（2026-08-18）: 画面右上に常時固定表示→nav行への常時インライン埋め込み→
// 「nav行のボタンを押した時だけ出るドラッグ可能なポップアップ」→（5種類全部を常時表示すると
// 認知負荷が高いという指摘を受けて）チェックボックスの表示ON/OFF設定画面→さらに「プルダウンで
// 選んでリストに追加していく」パターンへ最終確定。位置は自由に動かせて、初期位置は左上
// （top:10px; left:10px）。ドラッグした位置・追加済みリスト・開閉状態はlocalStorageに保存し、
// リロード後も同じ見た目に復元する。
(function () {
  const STATE_KEY = "warframe-state-graph:boosters";
  const POS_KEY = "warframe-state-graph:booster-panel-pos";
  const LIST_KEY = "warframe-state-graph:booster-list";
  const OPEN_KEY = "warframe-state-graph:booster-panel-open";
  const DEFAULT_POS = { top: 10, left: 10 };
  const DEFAULT_LIST = ["xp", "credit"]; // 元々あった2種を初期リストとして引き継ぐ
  const DURATIONS_HOURS = [
    { label: "3日", hours: 72 },
    { label: "7日", hours: 168 },
    { label: "30日", hours: 720 },
    { label: "90日", hours: 2160 },
  ];
  // 公式Wiki（wiki.warframe.com/w/Booster）で確認した5種の購入可能ブースター全部
  // （2026-08-18追記、当初は経験値/クレジットの2種のみだった）。パネル自体が「ブースト」の
  // 文脈なので、各項目の名称に重ねて「ブースト」を含めない（2026-08-18指摘）。
  const BOOSTERS = [
    { id: "xp", label: "経験値" }, // Affinity Booster
    { id: "credit", label: "クレジット" }, // Credit Booster
    { id: "resource", label: "リソース" }, // Resource Booster（収集量2倍）
    { id: "resource_drop", label: "リソースドロップ率" }, // Resource Drop Chance Booster
    { id: "mod_drop", label: "MODドロップ率" }, // Mod Drop Chance Booster
  ];
  const BOOSTER_BY_ID = Object.fromEntries(BOOSTERS.map((b) => [b.id, b]));
  const customOpenIds = new Set(); // 「任意の時間を追加」フォームを開いているブースターID（一時状態、保存不要）

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveState(state) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage不可でも致命的ではない */
    }
  }

  function loadPanelPos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.top === "number" && typeof p.left === "number") return p;
      }
    } catch (e) {
      /* 無視してデフォルトへ */
    }
    return { ...DEFAULT_POS };
  }
  function savePanelPos(pos) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch (e) {
      /* 無視 */
    }
  }

  // パネルに追加済みのブースターID一覧（表示順）。
  function loadList() {
    try {
      const raw = localStorage.getItem(LIST_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.filter((id) => BOOSTER_BY_ID[id]);
      }
    } catch (e) {
      /* 無視してデフォルトへ */
    }
    return [...DEFAULT_LIST];
  }
  function saveList(list) {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(list));
    } catch (e) {
      /* 無視 */
    }
  }

  function loadOpen() {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function saveOpen(open) {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch (e) {
      /* 無視 */
    }
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = `
      /* テーマ切替ボタンと同じ共有バー（右上固定）に並ぶため、単独でも見えるガラス調の
         背景を持たせる（2026-08-18、ナビ埋め込みから右上固定へ移動したのに合わせて調整）。 */
      #booster-toggle-btn {
        display: inline-flex; align-items: center; gap: 5px;
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a); color: var(--muted, #7c818f);
        border-radius: 10px; padding: 6px 10px; font-size: 0.8rem; cursor: pointer;
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      }
      #booster-toggle-btn:hover, #booster-toggle-btn.active { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }

      #booster-panel {
        position: fixed;
        z-index: 150;
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a);
        border-radius: 14px;
        font-size: 0.72rem;
        color: var(--text, #e4e6ec);
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        min-width: 250px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
      }
      #booster-panel.hidden { display: none; }
      #booster-panel .b-head {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; border-bottom: 1px solid var(--border, #2a2e3a);
        cursor: grab; user-select: none; touch-action: none;
      }
      #booster-panel .b-head.dragging { cursor: grabbing; }
      #booster-panel .b-head .b-title { font-weight: 600; color: var(--text, #e4e6ec); flex: 1; }
      #booster-panel .b-head button {
        background: transparent; border: none; color: var(--muted, #7c818f); cursor: pointer; line-height: 0; padding: 2px;
      }
      #booster-panel .b-head button:hover { color: var(--danger, #e88c93); }
      /* scratch.jsと同じ理由: .b-head buttonの汎用スタイルがページ側の.icon-btnを上書きしてしまう
         ため明示的に復元。.popoverもページごとにleft/right基準が不統一（index.htmlはleft:0）で
         右上floatingパネル内だとはみ出すため、right:0固定で明示的に上書きする（2026-08-22）。 */
      #booster-panel .b-head .popover-wrap { position: relative; display: inline-flex; }
      #booster-panel .b-head .icon-btn {
        background: transparent; border: 1px solid var(--border, #2a2e3a); color: var(--muted, #7c818f);
        border-radius: 6px; padding: 4px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; line-height: 0;
      }
      #booster-panel .b-head .icon-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #booster-panel .popover {
        position: absolute; top: calc(100% + 6px); right: 0; left: auto; z-index: 200;
        background: var(--popover-bg, rgba(20, 22, 28, 0.94)); backdrop-filter: blur(var(--panel-blur)); -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a); border-radius: 10px; padding: 8px 10px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4); width: 240px; font-size: 0.72rem; line-height: 1.7;
        color: var(--text, #e4e6ec);
      }
      #booster-panel .popover code { background: var(--bg, #12141a); padding: 0 3px; border-radius: 3px; }
      #booster-panel .b-body { padding: 6px 8px; }
      #booster-panel .b-add-row { display: flex; align-items: center; gap: 6px; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--border, #2a2e3a); }
      #booster-panel .b-add-row select { flex: 1; }
      /* 経験値/リソースドロップ率のようにラベル長がバラバラでも、時間表示・開始ボタン等の
         列が縦に揃うようグリッドで組む（各.b-rowはdisplay:contentsで自分自身を消し、
         中身4つを親グリッドの列に直接参加させる）。 */
      #booster-list-body {
        display: grid;
        grid-template-columns: max-content max-content max-content max-content max-content;
        align-items: center;
        column-gap: 8px;
        row-gap: 4px;
      }
      #booster-panel .b-row { display: contents; }
      #booster-panel .b-label { color: var(--muted, #7c818f); white-space: nowrap; }
      #booster-panel .b-time { color: var(--actionable, #7ee3a9); font-variant-numeric: tabular-nums; justify-self: start; }
      #booster-panel select, #booster-panel button.b-action {
        background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 4px; font-size: 0.68rem; padding: 2px 4px; cursor: pointer;
      }
      #booster-panel button.b-action:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #booster-panel button.b-action.b-remove:hover { border-color: var(--danger, #e88c93); color: var(--danger, #e88c93); }
      #booster-panel button.b-action.b-custom-toggle.active { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #booster-panel .b-empty { grid-column: 1 / -1; color: var(--muted, #7c818f); font-size: 0.72rem; padding: 4px 0; }
      /* テンノコンの大量購入（既定90日超）・リレーでの他プレイヤーからの時間単位ギフト、
         どちらもプルダウンの固定期間(3/7/30/90日)に収まらないため、任意の日数/時間を
         「開始 or 稼働中に加算」できる行を追加する（2026-08-22）。 */
      #booster-panel .b-custom-row { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; padding: 2px 0 4px; }
      #booster-panel .b-custom-row input[type="number"] {
        width: 3.8em; background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 4px; font-size: 0.68rem; padding: 2px 4px; font-family: inherit; -moz-appearance: textfield;
      }
      #booster-panel .b-custom-row input[type="number"]::-webkit-inner-spin-button,
      #booster-panel .b-custom-row input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    `;
    document.head.appendChild(style);
  }

  function formatRemaining(ms) {
    if (ms <= 0) return "終了";
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    // 残り1時間を切ったら分刻み(分:秒)表示に切り替える（項目15の仕様）。
    if (days === 0 && hours === 0) {
      return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    if (days > 0) return `${days}日${hours}時間`;
    return `${hours}時間${mins}分`;
  }

  function render() {
    const list = loadList();
    const remaining = BOOSTERS.filter((b) => !list.includes(b.id));
    renderAddRow(remaining);
    renderList(list);
  }

  function renderAddRow(remaining) {
    const el = document.getElementById("booster-add-row");
    if (!el) return;
    if (!remaining.length) {
      el.innerHTML = `<div class="b-empty">全種類を追加済み</div>`;
      return;
    }
    el.innerHTML = `
      <select id="booster-add-select">${remaining.map((b) => `<option value="${b.id}">${b.label}</option>`).join("")}</select>
      <button class="b-action" id="booster-add-btn">追加</button>
    `;
    document.getElementById("booster-add-btn").addEventListener("click", () => {
      const id = document.getElementById("booster-add-select").value;
      const list = loadList();
      if (!list.includes(id)) {
        list.push(id);
        saveList(list);
      }
      render();
    });
  }

  function renderList(list) {
    const state = loadState();
    const body = document.getElementById("booster-list-body");
    if (!body) return;
    if (!list.length) {
      body.innerHTML = `<div class="b-empty">上のプルダウンから追加して</div>`;
      return;
    }
    body.innerHTML = list.map((id) => {
      const b = BOOSTER_BY_ID[id];
      const entry = state[id];
      const remaining = entry ? entry.expiry - Date.now() : 0;
      const customOpen = customOpenIds.has(id);
      const customRow = customOpen ? `
        <div class="b-custom-row">
          <input type="number" min="0" max="365" step="1" placeholder="日" data-custom-days="${id}">日
          <input type="number" min="0" max="23" step="1" placeholder="時間" data-custom-hours="${id}">時間
          <button class="b-action" data-custom-confirm="${id}">${remaining > 0 ? "追加" : "開始"}</button>
        </div>` : "";
      if (entry && remaining > 0) {
        return `
          <div class="b-row">
            <span class="b-label">${b.label}</span>
            <span class="b-time" data-expiry="${entry.expiry}" data-id="${id}">${formatRemaining(remaining)}</span>
            <button class="b-action" data-stop="${id}">停止</button>
            <button class="b-action b-custom-toggle${customOpen ? " active" : ""}" data-custom-toggle="${id}" title="任意の時間を追加（テンノコン大量購入・リレーでの他プレイヤーからのギフト等）">${window.icon ? window.icon("plus", { size: 12 }) : "+"}</button>
            <button class="b-action b-remove" data-remove="${id}" title="リストから外す">${window.icon ? window.icon("x", { size: 12 }) : "×"}</button>
          </div>
          ${customRow}`;
      }
      const options = DURATIONS_HOURS.map((d) => `<option value="${d.hours}">${d.label}</option>`).join("");
      return `
        <div class="b-row">
          <span class="b-label">${b.label}</span>
          <select data-duration="${id}">${options}</select>
          <button class="b-action" data-start="${id}">開始</button>
          <button class="b-action b-custom-toggle${customOpen ? " active" : ""}" data-custom-toggle="${id}" title="任意の日数/時間を指定して開始（テンノコン大量購入・リレーでの他プレイヤーからのギフト等）">${window.icon ? window.icon("plus", { size: 12 }) : "+"}</button>
          <button class="b-action b-remove" data-remove="${id}" title="リストから外す">${window.icon ? window.icon("x", { size: 12 }) : "×"}</button>
        </div>
        ${customRow}`;
    }).join("");

    body.querySelectorAll("[data-start]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.start;
        const select = body.querySelector(`[data-duration="${id}"]`);
        const hours = Number(select.value);
        const s = loadState();
        s[id] = { expiry: Date.now() + hours * 3600 * 1000 };
        saveState(s);
        render();
      });
    });
    body.querySelectorAll("[data-stop]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = loadState();
        delete s[btn.dataset.stop];
        saveState(s);
        render();
      });
    });
    body.querySelectorAll("[data-custom-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.customToggle;
        if (customOpenIds.has(id)) customOpenIds.delete(id); else customOpenIds.add(id);
        render();
      });
    });
    body.querySelectorAll("[data-custom-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.customConfirm;
        const rawDays = Number(body.querySelector(`[data-custom-days="${id}"]`).value) || 0;
        const rawHours = Number(body.querySelector(`[data-custom-hours="${id}"]`).value) || 0;
        // min/max属性はキーボード直接入力までは防げないため、確定時にもクランプする。
        const days = Math.min(Math.max(rawDays, 0), 365);
        const hours = Math.min(Math.max(rawHours, 0), 23);
        const addMs = (days * 24 + hours) * 3600 * 1000;
        if (addMs <= 0) return;
        const s = loadState();
        const current = s[id];
        const base = current && current.expiry > Date.now() ? current.expiry : Date.now();
        s[id] = { expiry: base + addMs };
        saveState(s);
        customOpenIds.delete(id);
        render();
      });
    });
    body.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.remove;
        saveList(loadList().filter((x) => x !== id));
        // リストから外す＝タイマーも無関係になるので一緒に消す
        const s = loadState();
        delete s[id];
        saveState(s);
        customOpenIds.delete(id);
        render();
      });
    });
  }

  function tick() {
    document.querySelectorAll("#booster-panel .b-time").forEach((elm) => {
      const remaining = Number(elm.dataset.expiry) - Date.now();
      if (remaining <= 0) {
        render(); // 期限切れになった行はボタン表示に戻す
        return;
      }
      elm.textContent = formatRemaining(remaining);
    });
  }

  function applyPanelPos(panel, pos) {
    panel.style.top = `${pos.top}px`;
    panel.style.left = `${pos.left}px`;
  }

  // ブーストボタンのすぐ右横（画面端で入りきらなければ左横）に位置を計算する。
  // パネルはhidden中は display:none でサイズが取れないため、呼び出し側で先に
  // hiddenを外してから（＝実寸を測れる状態で）呼ぶこと。
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
      // ハンドル内のボタン（閉じるボタン等）上でのpointerdownはドラッグ扱いにしない。
      // setPointerCaptureをハンドルに奪わせると、その下のボタンのclickイベントが
      // 発火しなくなる（pointerup時のヒットテスト対象がハンドル側に切り替わるため）。
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
      // ボタン操作での開閉は、ドラッグで保存した位置ではなくブーストボタンの横へ毎回スナップする
      // （2026-08-18指摘）。保存済み位置はページ再読み込み時の復元にのみ使う（init()側）。
      positionNextToButton(panel, btn);
      render();
    }
  }

  function init() {
    injectStyle();

    const btn = document.createElement("button");
    btn.id = "booster-toggle-btn";
    btn.innerHTML = (window.icon ? window.icon("zap") : "") + "ブースト";
    // テーマ切替ボタン（theme.js）と横並びの共通バーへ収める。ブーストボタンを左、
    // テーマボタンを右にしたいので、スクリプト読み込み順（booster.js→theme.js）どおり
    // 先に追加する（2026-08-18指摘）。
    getTopRightBar().appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "booster-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div class="b-head" id="booster-drag-handle">
        <span class="b-title">${window.icon ? window.icon("zap", { size: 14 }) : ""}ブースト</span>
        <div class="popover-wrap">
          <button class="icon-btn" id="booster-help-toggle" title="使い方">${window.icon ? window.icon("circle-alert", { size: 14 }) : "!"}</button>
          <div class="popover hidden" id="booster-help-popover">
            プルダウンは購入時の固定期間（3/7/30/90日）専用。<br>
            <code>+</code>ボタンで任意の日数/時間を指定可能（上限365日23時間）——テンノコンでの大量購入や、リレーで他プレイヤーから貰った時間単位のギフトに対応。<br>
            稼働中に<code>+</code>を押すと「追加」になり、残り時間に加算されます。
          </div>
        </div>
        <button id="booster-close" title="閉じる">${window.icon ? window.icon("x", { size: 14 }) : "×"}</button>
      </div>
      <div class="b-body">
        <div class="b-add-row" id="booster-add-row"></div>
        <div id="booster-list-body"></div>
      </div>
    `;
    document.body.appendChild(panel);
    applyPanelPos(panel, loadPanelPos());

    btn.addEventListener("click", () => togglePanel(btn, panel));
    panel.querySelector("#booster-close").addEventListener("click", () => togglePanel(btn, panel));
    setupDrag(panel, panel.querySelector("#booster-drag-handle"));

    panel.querySelector("#booster-help-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      panel.querySelector("#booster-help-popover").classList.toggle("hidden");
    });
    panel.querySelector("#booster-help-popover").addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      panel.querySelector("#booster-help-popover").classList.add("hidden");
    });

    // 前回開いたまま（閉じずに）リロードされていたら、開いた状態を引き継ぐ。
    if (loadOpen()) {
      panel.classList.remove("hidden");
      btn.classList.add("active");
    }

    render();
    setInterval(tick, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
