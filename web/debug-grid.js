// デバッグ用グリッドオーバーレイ（2026-08-19追加）。実機確認時に画面位置を「A1」「C4」の
// ようなチェス盤記法で指せるようにするための、確認作業用の一時ツール。他の共有ウィジェット
// （theme.js/booster.js）と同じく画面右上共有バーにトグルボタンを置くが、これだけは性質が
// 違う——確認作業用なので状態はlocalStorageに保存せず、ページを開くたびに必ずOFFから始まる。
(function () {
  const CELL = 100; // px、列/行のマス目サイズ

  let overlay = null;
  let on = false;

  function colLabel(i) {
    // 0-indexed → A, B, ..., Z, AA, AB, ...（Excel列名と同じ方式）
    let s = "";
    i += 1;
    while (i > 0) {
      const rem = (i - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  function buildOverlay() {
    const el = document.createElement("div");
    el.id = "debug-grid-overlay";
    el.style.cssText = [
      "position:fixed", "inset:0", "z-index:9999", "pointer-events:none",
      `background-image:linear-gradient(to right, rgba(255,60,60,0.35) 1px, transparent 1px),` +
        `linear-gradient(to bottom, rgba(255,60,60,0.35) 1px, transparent 1px)`,
      `background-size:${CELL}px ${CELL}px`,
    ].join(";");

    const cols = Math.ceil(window.innerWidth / CELL);
    const rows = Math.ceil(window.innerHeight / CELL);
    const labelStyle = "position:absolute;font:11px/1 monospace;color:#ff3c3c;background:rgba(0,0,0,0.55);padding:1px 3px;border-radius:2px;";

    let labels = "";
    for (let c = 0; c < cols; c++) {
      labels += `<div style="${labelStyle}left:${c * CELL + 2}px;top:2px;">${colLabel(c)}</div>`;
    }
    for (let r = 0; r < rows; r++) {
      labels += `<div style="${labelStyle}left:2px;top:${r * CELL + 2}px;">${r + 1}</div>`;
    }
    el.innerHTML = labels;
    return el;
  }

  function setOn(next) {
    on = next;
    if (on) {
      overlay = buildOverlay();
      document.body.appendChild(overlay);
    } else if (overlay) {
      overlay.remove();
      overlay = null;
    }
    const btn = document.getElementById("debug-grid-toggle-btn");
    if (btn) btn.style.color = on ? "var(--accent, #f6ddaa)" : "";
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = `
      #debug-grid-toggle-btn {
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a);
        color: var(--muted, #7c818f);
        border-radius: 10px;
        padding: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        line-height: 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      }
      #debug-grid-toggle-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyle();
    const btn = document.createElement("button");
    btn.id = "debug-grid-toggle-btn";
    btn.title = "デバッグ用グリッドオーバーレイ（A1形式の位置確認）";
    btn.innerHTML = window.icon ? window.icon("layout-grid", { size: 22 }) : "";
    btn.addEventListener("click", () => setOn(!on));
    (window.getTopRightBar ? window.getTopRightBar() : document.body).appendChild(btn);

    window.addEventListener("resize", () => { if (on) setOn(true); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
