// ライト/ダーク手動切り替え（2026-08-18追加）。それまでは`@media (prefers-color-scheme)`
// のみでOS設定に自動追従していたが、UI上に切り替え手段が無いという指摘を受けて追加した。
// 状態は localStorage を全ページ共通で使う（wallpaper.js/booster.jsと同じ発想）。
// 当初は「自動（OS追従）→ライト→ダーク」の3値サイクルだったが、シンプルな
// ライト⇄ダークの2値トグルでいいとの指定（2026-08-18）を受けて単純化した。
// 未選択（初回訪問）の間はOSのprefers-color-schemeにそのまま従い、ボタンは
// 「クリックしたら切り替わる先」ではなく「今の実効テーマ」のアイコンを表示する。
//
// フラッシュ防止のため、実際の<html data-theme>適用は各HTML先頭のインラインスクリプトで
// 同期的に行う（このファイルは非同期script src、CSS描画までに間に合わない可能性があるため）。
// このファイルはトグルボタンのUIと、クリック時の切り替えだけを担当する。
//
// ボタン自体は各HTMLに置かず、wallpaper.js/booster.jsと同じ流儀でJS側が動的に生成する。
// 画面右上固定の共有バー（icons.jsの getTopRightBar()）に、ブーストボタンの右隣として収める
// （2026-08-18、「ブーストボタンをテーマ切替の左隣に」の指摘。booster.js→theme.jsの
// script読み込み順どおりに並べれば自然と実現するため、appendする順序だけで制御している）。
(function () {
  const KEY = "warframe-state-graph:theme";

  // 明示的な保存値（"light" / "dark"）。未選択なら null。
  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null;
    }
  }

  // 実際に画面へ適用されている（はずの）テーマ。保存値が無ければOS設定を見て判定する。
  function effective() {
    const s = stored();
    if (s) return s;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function persist(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {
      // localStorage不可（プライベートモード等）でもページ内の見た目は切り替わるので黙って続行
    }
  }

  const LABEL = { light: "ライト", dark: "ダーク" };
  const ICON_NAME = { light: "sun", dark: "moon" };
  const ICON_SIZE = 22; // 標準アイコン16pxだと目立たないとの指摘（2026-08-18）で一回り拡大

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = `
      #theme-toggle-btn {
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
      #theme-toggle-btn:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
    `;
    document.head.appendChild(style);
  }

  function updateButton() {
    const btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    const t = effective();
    btn.innerHTML = window.icon ? window.icon(ICON_NAME[t], { size: ICON_SIZE }) : "";
    btn.title = `テーマ: ${LABEL[t]}（クリックで切替）`;
  }

  function toggle() {
    const next = effective() === "dark" ? "light" : "dark";
    persist(next);
    apply(next);
    updateButton();
  }

  function init() {
    injectStyle();
    const btn = document.createElement("button");
    btn.id = "theme-toggle-btn";
    (window.getTopRightBar ? window.getTopRightBar() : document.body).appendChild(btn);
    btn.addEventListener("click", toggle);
    updateButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
