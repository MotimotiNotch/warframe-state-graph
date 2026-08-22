// 起動初回に1回だけ、既にクリア済みのクエストを先行登録できるモーダルを出す（2026-08-22新設）。
// 対象はpkg/stats.GatingQuests（フォーカス/レールジャック/ドリフター関連セクションの
// ネタバレゲート判定に使う3件）のみ——State更新コスト極小化原則により、全クエスト一覧
// （Statsページの「クエスト進行状況」パネル）をここに持ち込むことはしない。
//
// 旧web/quest-progress-prompt.js（2026-08-20実装→2026-08-22削除）は「満たされるまで毎回
// 起動時に促す」方式だったが、「クエストが無い状態だと毎回ダイアログが出てUXが終わる」との
// 指摘で廃止された。今回は同じ轍を踏まないよう、spoiler-warning.jsと同じ「localStorageで
// 一度だけ表示・以後は二度と出さない」方式にする（既にクリア済みの人が最初に一括登録できる
// 利便性のためのワンショットな導線であり、未クリアの人を追い立てる仕組みではない）。
(function () {
  const KEY = "warframe-state-graph:questOnboardingSeen";
  try {
    if (localStorage.getItem(KEY) === "1") return;
  } catch (e) {
    return; // localStorage不可の環境ではモーダルを出さない。
  }

  const SPOILER_KEY = "warframe-state-graph:spoilerAcknowledged";
  function spoilerAcknowledged() {
    try {
      return localStorage.getItem(SPOILER_KEY) === "1";
    } catch (e) {
      return true;
    }
  }

  function markSeen() {
    try {
      localStorage.setItem(KEY, "1");
    } catch (e) {}
  }

  // 日本語表記はwikiwiki.jp/warframe出典（02_Requirements_and_Roadmap.md項目23で確認済み、
  // 公式ローカライズとの一致は未検証）。
  const GATING_QUESTS = [
    { name: "The Second Dream", ja: "二番目の夢" },
    { name: "Rising Tide", ja: "流転する形勢" },
    { name: "The Duviri Paradox", ja: "デュヴィリ・パラドックス" },
  ];

  function show() {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;" +
      "justify-content:center;padding:16px;z-index:500;";
    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--bg,#12141a);color:var(--text,#e4e6ec);border:1px solid var(--border,#2a2e3a);" +
      "border-radius:16px;padding:18px 20px;max-width:480px;font-family:'Noto Sans JP',-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
      "font-size:0.85rem;line-height:1.6;box-shadow:0 12px 30px rgba(0,0,0,0.5);max-height:80vh;overflow-y:auto;";

    const checksHtml = GATING_QUESTS.map((q, i) =>
      `<label style='display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;'>` +
      `<input type='checkbox' id='quest-onboarding-check-${i}' style='width:auto;'>${q.ja}</label>`
    ).join("");

    box.innerHTML =
      "<div style='font-weight:600;font-size:0.95rem;margin-bottom:10px;'>クエスト進行状況を先に登録しますか？</div>" +
      "<div style='margin-bottom:12px;'>Statsページの一部セクションは、対応するクエストをクリア済みでないとネタバレ回避のため折りたたまれています。<b>既にクリア済みのもの</b>にチェックを入れると、該当セクションがすぐに開きます。</div>" +
      `<div style='margin-bottom:14px;'>${checksHtml}</div>` +
      "<div style='color:var(--muted,#9aa0ab);font-size:0.75rem;margin-bottom:4px;'>後からでもStatsページの「クエスト進行状況」パネルでいつでも変更できます。このモーダルは今回限りです。</div>" +
      "<div style='text-align:right;margin-top:10px;display:flex;gap:8px;justify-content:flex-end;'>" +
      "<button id='quest-onboarding-skip' style='background:transparent;border:1px solid var(--border,#2a2e3a);" +
      "color:var(--muted,#9aa0ab);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>スキップ</button>" +
      "<button id='quest-onboarding-save' style='background:transparent;border:1px solid var(--accent,#f6ddaa);" +
      "color:var(--accent,#f6ddaa);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>保存して閉じる</button>" +
      "</div>";
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    document.getElementById("quest-onboarding-skip").addEventListener("click", () => {
      markSeen();
      backdrop.remove();
    });
    document.getElementById("quest-onboarding-save").addEventListener("click", async () => {
      markSeen();
      backdrop.remove();
      for (let i = 0; i < GATING_QUESTS.length; i++) {
        const checked = document.getElementById(`quest-onboarding-check-${i}`).checked;
        if (!checked) continue; // 未クリア側は何もしない（既定値のfalseのまま）。
        try {
          await fetch(`/api/stats/quest/${encodeURIComponent(GATING_QUESTS[i].name)}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cleared: true }),
          });
        } catch (e) { /* 保存失敗してもモーダルは閉じる。Statsページから登録し直せる */ }
      }
    });
  }

  function tryShow() {
    const proceed = () => { if (document.body) show(); };
    if (spoilerAcknowledged()) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", proceed);
      else proceed();
    } else {
      // spoiler-warning.jsのモーダルと同時に2枚重ならないよう、閉じるのを待つ。
      window.addEventListener("warframe-state-graph:spoiler-acknowledged", proceed, { once: true });
    }
  }

  tryShow();
})();
