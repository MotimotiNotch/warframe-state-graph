// カードホバー時の3D傾きエフェクト（2026-08-21、「Standing合わせのグリッド化」直後の要望）。
// 対象はLoadouts/Collectionsの5セクション（.item-card/.buildset-card/.card-v2、+カード含む）。
// これらのカードはrender()のたびにinnerHTMLごと作り直されるため、個別要素へのリスナー付与だと
// 再描画のたびに付け直しが要る。document単位のイベント委譲にして、DOM再生成に影響されない
// 構造にした（closest()でホバー中のカードを都度判定するだけなので再バインド不要）。
//
// パフォーマンス面: transform（perspective+rotateX/rotateY）はGPU合成のみで完結し
// reflow/repaintを起こさない。mousemove自体はrequestAnimationFrameで間引く——結局
// 「今ホバーしている1枚分」の計算しか走らないので、グリッドの枚数が増えてもコストは変わらない。
(function () {
  const SELECTOR = ".item-card, .buildset-card, .card-v2, .add-card";
  const MAX_TILT_DEG = 8;

  let rafId = null;
  let pending = null;

  function applyTilt(card, clientX, clientY) {
    const rect = card.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width - 0.5;
    const py = (clientY - rect.top) / rect.height - 0.5;
    const rotateY = px * MAX_TILT_DEG * 2;
    const rotateX = -py * MAX_TILT_DEG * 2;
    card.style.transform = `perspective(600px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
  }

  function resetTilt(card) {
    card.style.transform = "";
  }

  document.addEventListener("mousemove", (e) => {
    const card = e.target.closest(SELECTOR);
    if (!card) return;
    pending = { card, x: e.clientX, y: e.clientY };
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      if (pending) applyTilt(pending.card, pending.x, pending.y);
      rafId = null;
      pending = null;
    });
  });

  // mouseleaveは委譲できない（バブルしない）ため、bubbleするmouseoutで
  // 「カードの外へ実際に出たか」をrelatedTargetから判定する。
  document.addEventListener("mouseout", (e) => {
    const card = e.target.closest(SELECTOR);
    if (!card) return;
    if (e.relatedTarget && card.contains(e.relatedTarget)) return;
    resetTilt(card);
  });
})();
