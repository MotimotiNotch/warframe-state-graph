// Adds a book-open button to each page's <nav>, next to legend-toggle/
// help-toggle. Clicking opens manual.html as a separate browser WINDOW
// (window.open with a fixed name, not a same-page popover) — 2026-08-27,
// のっちの指摘: 同じウィンドウ内のpopoverだと、対象ページと見比べながら
// 「ボタンの場所を確認」ハイライトを確認できない。同名ウィンドウを再指定す
// ると新規タブは開かず既存ウィンドウが前面に来る（ブラウザ標準の挙動）。
import { icon } from "./icons.ts";

function openManualWindow(): void {
  window.open("/manual.html", "wsg-manual", "width=600,height=680,resizable=yes,scrollbars=yes");
}

function init(): void {
  // Other 4 pages put the page-link nav and the utility icon buttons
  // (refresh-wfcd-btn/help-toggle等) in the same <nav> row, so appending to
  // `nav` lands the manual button in that icon cluster. Chain View
  // (index.html) alone splits them — <nav> is page links only, the icon
  // cluster (refresh-wfcd-btn/legend-toggle) is a separate `.toolbar` div —
  // so appending to `nav` there put it after "Stats" instead, a different
  // spot from every other page (のっち報告, 2026-08-27).
  const container = document.querySelector<HTMLElement>(".toolbar") ?? document.querySelector<HTMLElement>("nav");
  if (!container) return;
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.id = "manual-launcher-btn";
  btn.title = "マニュアル（別ウィンドウで開く）";
  btn.innerHTML = icon("book-open");
  btn.addEventListener("click", openManualWindow);
  container.appendChild(btn);
}

init();
