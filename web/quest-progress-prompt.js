// Focus School/Railjackセクション（Statsページ）はThe Second Dream/Rising Tideの
// 達成状態と連動して自動的に折りたたみを解除する設計（02_Requirements_and_Roadmap.md項目23）。
// この連動に気づけるよう、初回起動時に両クエストの達成状態をその場で登録できるモーダルを出す。
// spoiler-warning.jsと違い「二度と出さない」localStorageフラグは使わず、**毎回実際のグラフの
// 状態を見て、まだ両方登録されていなければ出す**（「後で」を選んでも次回また促される、
// 一度登録すれば自然に出なくなる——2026-08-20、「スキップ可能だが強く促す」方針で確定）。
(function () {
  const TARGETS = [
    { name: "The Second Dream", ja: "二番目の夢" },
    { name: "Rising Tide", ja: "流転する形勢" },
  ];

  async function slugStatus() {
    // graph.jsonの実データからノードの有無/satisfiedを見る。ネットワーク越しにサーバー側の
    // questchain.Slug()と同じ変換規則を再実装するより、既存ノードをそのまま引く方が確実。
    const res = await fetch("/api/graph");
    if (!res.ok) return null;
    const graph = await res.json();
    return TARGETS.map((t) => {
      const id = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const node = graph.nodes ? graph.nodes[id] : null;
      return { ...t, id, satisfied: !!(node && node.satisfied) };
    });
  }

  async function registerQuest(target) {
    // 既にノードがあるなら再importで達成状態を潰さない（UpsertNodesは完全上書きのため）。
    // 無ければWFCD自動生成（questchain由来、前提クエスト込み）でインポートしてから、
    // トグルAPI（内部でCascadeSatisfyRequiresが働き前提クエストも遡って達成扱いになる）を呼ぶ。
    const graphRes = await fetch("/api/graph");
    const graph = await graphRes.json();
    if (!graph.nodes || !graph.nodes[target.id]) {
      const genRes = await fetch(`/api/wfcd/generate?nodeType=Quest&name=${encodeURIComponent(target.name)}`);
      if (!genRes.ok) return false;
      const suggestion = await genRes.json();
      await fetch("/api/wfcd/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: suggestion.questChain }),
      });
    }
    await fetch(`/api/nodes/${encodeURIComponent(target.id)}/toggle`, { method: "POST" });
    return true;
  }

  function show(targets) {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;" +
      "justify-content:center;padding:16px;z-index:499;"; // spoiler-warning(500)の下、重なった場合も見える順で表示
    const box = document.createElement("div");
    box.style.cssText =
      // spoiler-warning.jsと同じ理由で不透明な--bgを使う（2026-08-20、のっち指摘）。
      "background:var(--bg,#12141a);color:var(--text,#e4e6ec);border:1px solid var(--border,#2a2e3a);" +
      "border-radius:16px;padding:18px 20px;max-width:520px;font-family:-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
      "font-size:0.85rem;line-height:1.6;box-shadow:0 12px 30px rgba(0,0,0,0.5);";

    const checkboxesHtml = targets.map((t, i) =>
      `<label style="display:flex;align-items:center;gap:8px;margin:8px 0;cursor:pointer;">` +
      `<input type="checkbox" data-quest-idx="${i}" style="width:auto;">` +
      `<span>${t.name}（${t.ja}）をクリア済み</span></label>`
    ).join("");

    box.innerHTML =
      "<div style='font-weight:600;font-size:0.95rem;margin-bottom:8px;'>クエストの進行状況を登録</div>" +
      "<div>Statsページ下部には、これらのクエストの進行に応じて表示が自動調整されるセクションがあります。" +
      "ネタバレ回避のため内容はここでは伏せていますが、今のうちに登録しておくのがおすすめです。</div>" +
      `<div>${checkboxesHtml}</div>` +
      "<div style='text-align:right;margin-top:10px;'>" +
      "<button id='quest-prompt-later' style='background:transparent;border:1px solid var(--border,#2a2e3a);" +
      "color:var(--muted,#7c818f);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;margin-right:8px;'>後で</button>" +
      "<button id='quest-prompt-save' style='background:transparent;border:1px solid var(--accent,#f6ddaa);" +
      "color:var(--accent,#f6ddaa);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>登録する</button>" +
      "</div>";
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    document.getElementById("quest-prompt-later").addEventListener("click", () => backdrop.remove());
    document.getElementById("quest-prompt-save").addEventListener("click", async () => {
      const checked = [...box.querySelectorAll("[data-quest-idx]:checked")].map((cb) => targets[Number(cb.dataset.questIdx)]);
      for (const t of checked) {
        await registerQuest(t);
      }
      backdrop.remove();
    });
  }

  async function init() {
    const status = await slugStatus();
    if (!status) return; // グラフ取得に失敗した場合はブロックする理由がないため出さない
    const unregistered = status.filter((s) => !s.satisfied);
    if (!unregistered.length) return; // 両方すでに達成済み・登録済みなら出さない
    show(unregistered);
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
