// Port of web/quest-onboarding.js. One-time first-launch modal offering to
// pre-register already-cleared gating quests (pkg/stats.GatingQuests — only
// the 3 quests that gate Focus School/Railjack/Drifter spoiler sections,
// not the full quest list). Waits for spoiler-warning.ts's ack event so the
// two first-run modals never stack.

const KEY = "warframe-state-graph:questOnboardingSeen";

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

const SPOILER_KEY = "warframe-state-graph:spoilerAcknowledged";
function spoilerAcknowledged(): boolean {
  try {
    return localStorage.getItem(SPOILER_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* not fatal */
  }
}

// Japanese labels sourced from wikiwiki.jp/warframe (confirmed in
// 02_Requirements_and_Roadmap.md item 23) — not verified against official localization.
const GATING_QUESTS: { name: string; ja: string }[] = [
  { name: "The Second Dream", ja: "二番目の夢" },
  { name: "Rising Tide", ja: "流転する形勢" },
  { name: "The Duviri Paradox", ja: "デュヴィリ・パラドックス" },
];

function show(): void {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;" +
    "justify-content:center;padding:16px;z-index:500;";
  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--bg,#12141a);color:var(--text,#e4e6ec);border:1px solid var(--border,#2a2e3a);" +
    "border-radius:16px;padding:18px 20px;max-width:480px;font-family:'Noto Sans JP',-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
    "font-size:0.85rem;line-height:1.6;box-shadow:0 12px 30px rgba(0,0,0,0.5);max-height:80vh;overflow-y:auto;";

  const checksHtml = GATING_QUESTS.map(
    (q, i) =>
      `<label style='display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;'>` +
      `<input type='checkbox' id='quest-onboarding-check-${i}' style='width:auto;'>${q.ja}</label>`,
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

  document.getElementById("quest-onboarding-skip")!.addEventListener("click", () => {
    markSeen();
    backdrop.remove();
  });
  document.getElementById("quest-onboarding-save")!.addEventListener("click", async () => {
    markSeen();
    backdrop.remove();
    for (let i = 0; i < GATING_QUESTS.length; i++) {
      const checked = (document.getElementById(`quest-onboarding-check-${i}`) as HTMLInputElement).checked;
      if (!checked) continue; // uncleared side stays at the default false
      try {
        await fetch(`/api/stats/quest/${encodeURIComponent(GATING_QUESTS[i]!.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleared: true }),
        });
      } catch {
        /* the modal still closes on save failure; can be re-registered from the Stats page */
      }
    }
  });
}

function tryShow(): void {
  const proceed = () => {
    if (document.body) show();
  };
  if (spoilerAcknowledged()) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", proceed);
    else proceed();
  } else {
    window.addEventListener("warframe-state-graph:spoiler-acknowledged", proceed, { once: true });
  }
}

if (!alreadySeen()) tryShow();
