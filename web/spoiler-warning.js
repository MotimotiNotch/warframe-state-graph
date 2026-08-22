// 初回起動時にツールの目的・出典への感謝・ネタバレ注意を1回だけ表示する（4ページ共通）。
// クエスト名・前提チェーン（Chain ViewのQuest自動生成）や特定の入手手段を持つ武器名は、
// WFCD公開データをそのまま扱う都合上、未プレイのコンテンツ名がそのまま画面に出うる。
// モーダル本文では具体的な武器名を例示しない（警告文自体がネタバレになるため、2026-08-20修正）。
// 同意/閉じるを押すとlocalStorageにフラグを立て、以後は表示しない
// （wallpaper.js/theme.jsと同じ永続化発想）。
(function () {
  const KEY = "warframe-state-graph:spoilerAcknowledged";
  try {
    if (localStorage.getItem(KEY) === "1") return;
  } catch (e) {
    return; // localStorage不可の環境ではモーダルを出さない（ブロックする理由がないため）。
  }

  // 外部リンクは新規タブで開く（rel="noopener noreferrer"はタブナッピング対策の定石）。
  function link(href, text) {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:var(--accent,#f6ddaa);">${text}</a>`;
  }

  function show() {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;" +
      "justify-content:center;padding:16px;z-index:500;";
    const box = document.createElement("div");
    box.style.cssText =
      // 通常パネルは壁紙を透かすため--panel（半透明）を使うが、このモーダルは必ず一度読ませたい
      // 確認ダイアログなので、背後の壁紙で文字が読みにくくならないよう不透明な--bgを使う（2026-08-20、のっち指摘）。
      "background:var(--bg,#12141a);color:var(--text,#e4e6ec);border:1px solid var(--border,#2a2e3a);" +
      "border-radius:16px;padding:18px 20px;max-width:560px;font-family:-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
      "font-size:0.85rem;line-height:1.6;box-shadow:0 12px 30px rgba(0,0,0,0.5);max-height:80vh;overflow-y:auto;";
    const h4 = "font-weight:600;font-size:0.78rem;color:var(--muted,#7c818f);margin:0 0 4px;text-transform:uppercase;letter-spacing:0.02em;";
    const ul = "margin:0 0 14px;padding-left:18px;";
    box.innerHTML =
      "<div style='font-weight:600;font-size:0.95rem;margin-bottom:10px;'>このツールについて</div>" +
      "<div style='margin-bottom:12px;'>ゲーム内の依存関係グラフと自分の進行状況を接続し、次にやるべきことを動的に導き出す個人用ツールです。</div>" +
      `<div style='${h4}'>データ出典</div>` +
      `<ul style='${ul}'>` +
      `<li>ゲームデータ: ${link("https://github.com/WFCD", "WFCD")}（Warframe Community Developers）の公開データ</li>` +
      `<li>クエストの前提関係など: ${link("https://wiki.warframe.com/", "WARFRAME Wiki")} / ${link("https://wikiwiki.jp/warframe/", "wikiwiki.jp")}（日本語コミュニティWiki）</li>` +
      "</ul>" +
      `<div style='font-style:italic;color:var(--muted,#7c818f);margin-bottom:16px;'>そして何より、この非公式ツールの土台になっている${link("https://www.warframe.com/", "『Warframe』")}というゲームと、` +
      "それを作り届けてくださっているDigital Extremesに感謝します。</div>" +
      "<div style='font-weight:600;font-size:0.95rem;margin-bottom:8px;'>⚠️ ネタバレについて</div>" +
      "<div style='margin-bottom:8px;'>このツールはWarframe公開データ（WFCD）をそのまま扱うため、クエスト名・前提関係や" +
      "特定の入手手段を持つ武器名など、<b>まだプレイしていないコンテンツの名称が画面に表示される</b>ことがあります。</div>" +
      `<ul style='margin:0;padding-left:18px;'>` +
      "<li>先の情報を見たくないページ（特にChain ViewのWFCD自動生成）は利用を控えてください</li>" +
      "<li>先にChain ViewでWFCD自動生成インポートを使ってクエストの達成状態を登録しておくと、自分の進行にネタバレの状態を合わせやすくなります</li>" +
      "</ul>" +
      "<div style='text-align:right;margin-top:14px;'>" +
      "<button id='spoiler-ack-btn' style='background:transparent;border:1px solid var(--accent,#f6ddaa);" +
      "color:var(--accent,#f6ddaa);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>閉じる</button>" +
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
