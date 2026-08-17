// ブースタータイマー（経験値/クレジット）ウィジェット。02_Requirements_and_Roadmap.md 項目15。
// アカウント固有のブースター起動状態を取れる公式APIは無いため、アプリ側で手動起動する
// ローカルタイマーとして実装。Chain View/Loadoutsのどちらでも同じ見た目で使えるよう
// 共通スクリプトにして、両ページのbody末尾で読み込むだけで動く自己完結ウィジェットにしてある。
(function () {
  const STORAGE_KEY = "warframe-state-graph:boosters";
  const DURATIONS_HOURS = [
    { label: "3日", hours: 72 },
    { label: "7日", hours: 168 },
    { label: "30日", hours: 720 },
    { label: "90日", hours: 2160 },
  ];
  const BOOSTERS = [
    { id: "xp", label: "⚡ 経験値ブースト" },
    { id: "credit", label: "💰 クレジットブースト" },
  ];

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage不可でも致命的ではない */
    }
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = `
      #booster-widget {
        position: fixed;
        top: 10px;
        right: 10px;
        background: #1b1e27;
        border: 1px solid #2a2e3a;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 0.72rem;
        color: #e4e6ec;
        font-family: -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        z-index: 100;
        min-width: 170px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      }
      #booster-widget .b-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 3px 0; }
      #booster-widget .b-label { color: #8a8f9c; white-space: nowrap; }
      #booster-widget .b-time { color: #4fd88a; font-variant-numeric: tabular-nums; }
      #booster-widget select, #booster-widget button {
        background: #12141a; color: #e4e6ec; border: 1px solid #2a2e3a;
        border-radius: 4px; font-size: 0.68rem; padding: 2px 4px; cursor: pointer;
      }
      #booster-widget button:hover { border-color: #f0c674; color: #f0c674; }
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
    const state = loadState();
    const el = document.getElementById("booster-widget");
    el.innerHTML = BOOSTERS.map((b) => {
      const entry = state[b.id];
      const remaining = entry ? entry.expiry - Date.now() : 0;
      if (entry && remaining > 0) {
        return `
          <div class="b-row">
            <span class="b-label">${b.label}</span>
            <span class="b-time" data-expiry="${entry.expiry}" data-id="${b.id}">${formatRemaining(remaining)}</span>
            <button data-stop="${b.id}">停止</button>
          </div>`;
      }
      const options = DURATIONS_HOURS.map((d) => `<option value="${d.hours}">${d.label}</option>`).join("");
      return `
        <div class="b-row">
          <span class="b-label">${b.label}</span>
          <select data-duration="${b.id}">${options}</select>
          <button data-start="${b.id}">開始</button>
        </div>`;
    }).join("");

    el.querySelectorAll("[data-start]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.start;
        const select = el.querySelector(`[data-duration="${id}"]`);
        const hours = Number(select.value);
        const s = loadState();
        s[id] = { expiry: Date.now() + hours * 3600 * 1000 };
        saveState(s);
        render();
      });
    });
    el.querySelectorAll("[data-stop]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = loadState();
        delete s[btn.dataset.stop];
        saveState(s);
        render();
      });
    });
  }

  function tick() {
    const state = loadState();
    let anyActive = false;
    for (const b of BOOSTERS) {
      const entry = state[b.id];
      if (entry && entry.expiry - Date.now() > 0) anyActive = true;
    }
    document.querySelectorAll("#booster-widget .b-time").forEach((elm) => {
      const remaining = Number(elm.dataset.expiry) - Date.now();
      if (remaining <= 0) {
        render(); // 期限切れになった行はボタン表示に戻す
        return;
      }
      elm.textContent = formatRemaining(remaining);
    });
  }

  function init() {
    injectStyle();
    const widget = document.createElement("div");
    widget.id = "booster-widget";
    document.body.appendChild(widget);
    render();
    setInterval(tick, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
