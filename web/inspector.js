function renderPanel() {
  const panel = document.getElementById("panel-body");
  if (!state.selected) {
    panel.innerHTML = `<div class="empty">ノードを選択してください</div>`;
    return;
  }
  const node = state.report.nodes[state.selected];
  const isRoot = state.selected === state.report.buildId;
  const stateLabel = isRoot ? "起点" : (STATE_LABEL_JA[node.state] || node.state);
  const badgeColor = isRoot ? STATE_COLOR.ROOT : STATE_COLOR[node.state];

  panel.innerHTML = `
    <div class="ph-name">${node.name} <span id="i18n-name" style="color:var(--muted);font-weight:400;font-size:.85em;"></span></div>
    <div class="ph-row">種別: ${NODE_TYPE_LABEL_JA[node.type] || node.type}${node.type === "Relic" ? `<span id="vault-badge"></span>` : ""}</div>
    ${node.evaluation ? `<div class="ph-row">評価: ${node.evaluation}</div>` : ""}
    ${node.note ? `<div class="ph-row">${node.note}</div>` : ""}
    <div class="ph-state" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}">${stateLabel}</div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
      ${isRoot ? "" : `<button class="toggle" id="toggle-btn">${node.satisfied ? "取り消す" : "達成にする"}</button>`}
      ${node.masteryTrack ? `<button class="toggle" id="gild-btn" style="${node.gilded ? "border-color:var(--satisfied);color:var(--satisfied);" : ""}">${node.gilded ? "Gild済み" : "Gildする"}</button>` : ""}
      <button class="toggle" id="edit-btn">編集</button>
    </div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
      <button class="toggle" id="add-requires-btn">前提を追加</button>
      <button class="toggle" id="add-contains-btn">中身を追加</button>
    </div>
  `;

  const btn = document.getElementById("toggle-btn");
  if (btn) {
    btn.onclick = async () => {
      btn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected)}/toggle`, { method: "POST" });
      await refreshGraph();
      await loadReport();
    };
  }

  const gildBtn = document.getElementById("gild-btn");
  if (gildBtn) {
    gildBtn.onclick = async () => {
      gildBtn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected)}/gild-toggle`, { method: "POST" });
      await refreshGraph();
      await loadReport();
    };
  }

  document.getElementById("edit-btn").onclick = () => openNodeModal("edit", { ...node, id: state.selected });
  // 選択中ノードを起点に、繋がった状態の新規ノードをその場で作る（2026-08-25項目28）。
  // ユーザーはどこにも接続先をID/名前検索しない——保存時にnode-modal.js側が自動でこのノードの
  // requires/containsへ新規ノードのIDを繋ぐ。
  document.getElementById("add-requires-btn").onclick = () => openNodeModal("create", null, { relation: "requires", parentId: state.selected });
  document.getElementById("add-contains-btn").onclick = () => openNodeModal("create", null, { relation: "contains", parentId: state.selected });

  // Relicノード: Vault済みかどうかをバッジで表示。
  if (node.type === "Relic") {
    fetch(`/api/wfcd/relic-status?name=${encodeURIComponent(node.name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        const badge = document.getElementById("vault-badge");
        if (badge && res && res.vaulted) badge.innerHTML = `<span class="badge-vaulted">${gameIcon("lorc-padlock")}Vault済み</span>`;
      }).catch(() => {});
  }

  // WFCD自動生成由来ノード(uniqueName持ち): 日本語名 + Prime Resurgence在庫の突き合わせ。
  if (node.uniqueName) {
    fetch(`/api/wfcd/i18n?uniqueName=${encodeURIComponent(node.uniqueName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        const el = document.getElementById("i18n-name");
        if (el && res && res.name) el.textContent = `(${res.name})`;
      }).catch(() => {});

    fetch("/api/wfcd/resurgence")
      .then(r => r.ok ? r.json() : null)
      .then(vt => {
        if (!vt || !vt.inventory) return;
        const hit = vt.inventory.find(e => e.item && e.item.toLowerCase().includes(node.name.toLowerCase()));
        if (!hit) return;
        const row = panel.querySelector(".ph-row");
        if (row) row.insertAdjacentHTML("beforeend", `<span class="badge-resurgence">${gameIcon("lorc-hourglass")}Resurgence在庫あり(〜${(vt.expiry || "").slice(0, 10)})</span>`);
      }).catch(() => {});
  }
}
