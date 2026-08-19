// 初回起動時にネタバレ注意を1回だけ表示する（4ページ共通）。クエスト名・前提チェーン
// （Chain ViewのQuest自動生成）やKuva/Tenet/Coda等のリッチ系武器名は、WFCD公開データを
// そのまま扱う都合上、未プレイのコンテンツ名がそのまま画面に出うる。同意/閉じるを押すと
// localStorageにフラグを立て、以後は表示しない（wallpaper.js/theme.jsと同じ永続化発想）。
(function () {
  const KEY = "warframe-state-graph:spoilerAcknowledged";
  try {
    if (localStorage.getItem(KEY) === "1") return;
  } catch (e) {
    return; // localStorage不可の環境ではモーダルを出さない（ブロックする理由がないため）。
  }

  function show() {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;" +
      "justify-content:center;padding:16px;z-index:500;";
    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--panel,#1b1e27);color:var(--text,#e4e6ec);border:1px solid var(--border,#2a2e3a);" +
      "border-radius:16px;padding:18px 20px;max-width:440px;font-family:-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
      "font-size:0.85rem;line-height:1.6;box-shadow:0 12px 30px rgba(0,0,0,0.5);";
    box.innerHTML =
      "<div style='font-weight:600;font-size:0.95rem;margin-bottom:8px;'>⚠️ ネタバレについて</div>" +
      "<div>このツールはWarframe公開データ（WFCD）をそのまま扱うため、クエスト名・前提関係や" +
      "Kuva/Tenet/Coda等のリッチ系武器名など、<b>まだプレイしていないコンテンツの名称が画面に表示される</b>" +
      "ことがあります。自分の進行に合わせて、先の情報を見たくないページ（特にChain ViewのWFCD自動生成）は" +
      "利用を控えてください。</div>" +
      "<div style='text-align:right;margin-top:14px;'>" +
      "<button id='spoiler-ack-btn' style='background:transparent;border:1px solid var(--accent,#f0c674);" +
      "color:var(--accent,#f0c674);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>了解した</button>" +
      "</div>";
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    document.getElementById("spoiler-ack-btn").addEventListener("click", () => {
      try {
        localStorage.setItem(KEY, "1");
      } catch (e) {}
      backdrop.remove();
    });
  }

  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show);
})();
