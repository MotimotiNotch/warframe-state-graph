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
  const nav = document.querySelector("nav");
  if (!nav) return;
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.id = "manual-launcher-btn";
  btn.title = "マニュアル（別ウィンドウで開く）";
  btn.innerHTML = icon("book-open");
  btn.addEventListener("click", openManualWindow);
  nav.appendChild(btn);
}

init();
