const STATE_COLOR = {
  ROOT: "var(--root)",
  SATISFIED: "var(--satisfied)",
  ACTIONABLE: "var(--actionable)",
  BLOCKED: "var(--blocked)",
};
const STATE_LABEL_JA = { SATISFIED: "達成済み", ACTIONABLE: "実行可能", BLOCKED: "前提待ち" };

// 「ノード追加」→「新規ゴール」（2026-08-25項目28・30）: このボタンはRequires/Contains検索UIを
// 持たない裸のGoalノード作成専用になった（接続はInspectorの前提/中身追加ボタン経由で行う）ため、
// 実態に合わせて名称も変更した。
document.getElementById("new-node-btn").innerHTML = iconLabel("plus", "新規ゴール");
document.getElementById("new-node-btn").title = "新規ゴール";
document.getElementById("wfcd-import-btn").innerHTML = iconLabel("refresh-cw", "WFCDから自動生成");
document.getElementById("wfcd-import-btn").title = "WFCDから自動生成";
document.getElementById("refresh-wfcd-btn").innerHTML = icon("refresh-cw");
document.getElementById("refresh-wfcd-btn").addEventListener("click", async () => {
  const btn = document.getElementById("refresh-wfcd-btn");
  btn.disabled = true;
  btn.classList.add("spinning");
  btn.title = "更新中…";
  await fetch("/api/wfcd/refresh", { method: "POST" });
  btn.classList.remove("spinning");
  btn.classList.add("success");
  btn.innerHTML = icon("check");
  btn.title = "更新完了";
  setTimeout(() => {
    btn.classList.remove("success");
    btn.innerHTML = icon("refresh-cw");
    btn.disabled = false;
    btn.title = "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください";
  }, 2000);
});

document.getElementById("legend-toggle").innerHTML = icon("info");
(function setupLegendPopover() {
  const btn = document.getElementById("legend-toggle");
  const pop = document.getElementById("legend-popover");
  btn.addEventListener("click", (e) => { e.stopPropagation(); pop.classList.toggle("hidden"); });
  pop.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => pop.classList.add("hidden"));
})();

// focus: 今Chain Viewが中心に据えているノード（Buildルートとは限らない）。
// history: focusを移すたびに直前の位置を積む「戻る」履歴（ブラウザ/Obsidianのノート間移動と同じモデル）。
// パンくず（Buildルートからの一本道）はやめた。orokin-cellのように複数の親から参照される
// 真のDAGでは「唯一の正しい経路」が存在しないため、木構造前提のパンくずは実データと合わない。
// 1回のビューではcontainsを1段しか展開しない（computeLayout側で制御）。requiresは常に全展開のまま。
const state = { graph: null, buildId: null, focus: null, history: [], report: null, selected: null };

async function loadGraph() {
  await refreshGraph();
  populateBuildSelect();
}

// トグル操作直後など、フォーカス位置・履歴を保ったままグラフデータだけ再取得したい場合に使う。
async function refreshGraph() {
  const res = await fetch("/api/graph");
  state.graph = await res.json();
}

function populateBuildSelect() {
  const sel = document.getElementById("build-select");
  // Build種別はGoalへ統合済み（2026-08-25項目30、新規作成では選べない）だが、既存データに残る
  // 旧Build種別ノードもプルダウンから引き続き辿れるよう、フィルタ自体は後方互換のため据え置く。
  const builds = Object.values(state.graph.nodes).filter(n => n.type === "Build" || n.type === "Goal");
  sel.innerHTML = builds.map(n => `<option value="${n.id}">${n.name}</option>`).join("");
  sel.onchange = () => { selectBuild(sel.value); };
  if (builds.length) {
    sel.value = builds[0].id;
    selectBuild(builds[0].id);
  }
}

function selectBuild(buildId) {
  state.buildId = buildId;
  state.focus = buildId;
  state.history = [];
  state.selected = null;
  loadReport();
}

async function loadReport() {
  if (!state.focus) return;
  const res = await fetch(`/api/next-actions?build=${encodeURIComponent(state.focus)}`);
  if (!res.ok) return;
  state.report = await res.json();
  renderBreadcrumb();
  renderProgress();
  renderGraph();
  renderPanel();
}

function renderProgress() {
  const { done, total } = state.report.progress;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent = `${done} / ${total} 完了（${pct}%）`;
}
