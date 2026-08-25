// 現在のビューのルート(buildId)を起点にBFS展開し、階層レイアウト（深さ=行）の座標を計算する。
// requiresは常に全展開（Next Actionの前提チェーンは常に見える必要がある）。
// containsはルート直下の1段だけ展開する。それより深い入れ子（子がさらにcontainsを持つ場合）は
// このビューには出さず、その子をクリックしてドリルダウンした先で初めて見える。
// これをしないと自己相似な入れ子（A→B[A'→B'→C']→C 等）が1画面に無制限展開されて爆発する。
function computeLayout(report) {
  const nodes = report.nodes;
  const buildId = report.buildId;
  const depth = { [buildId]: 0 };
  const edges = [];
  const queue = [buildId];
  const visited = new Set([buildId]);

  while (queue.length) {
    const id = queue.shift();
    const node = nodes[id];
    if (!node) continue;
    const containsOpen = id === buildId;
    const children = [
      ...(containsOpen ? (node.contains || []).map(c => ({ id: c, kind: "contains" })) : []),
      ...(node.requires || []).map(c => ({ id: c, kind: "requires" })),
    ];
    for (const { id: childId, kind } of children) {
      edges.push({ from: id, to: childId, kind });
      if (!visited.has(childId)) {
        visited.add(childId);
        depth[childId] = depth[id] + 1;
        queue.push(childId);
      }
    }
  }

  const byDepth = {};
  for (const id of Object.keys(depth)) {
    (byDepth[depth[id]] = byDepth[depth[id]] || []).push(id);
  }

  // 縮小ウィンドウ対応（2026-08-19）: 狭い画面ではノード間隔自体を少し詰め、
  // 「見える範囲＝ほぼ1列」に近い密度にする。#graph-wrap自体はoverflow:autoで
  // 元から横スクロール可能だが、間隔も詰めた方が同じ画面幅でより多くの段が見える。
  const compact = window.innerWidth < 480;
  const colWidth = compact ? 110 : 150, rowHeight = compact ? 78 : 100, marginX = compact ? 40 : 80, marginY = compact ? 30 : 50;
  const positions = {};
  const depths = Object.keys(byDepth).map(Number).sort((a, b) => a - b);
  let maxCols = 1;
  for (const d of depths) {
    const ids = byDepth[d];
    maxCols = Math.max(maxCols, ids.length);
    ids.forEach((id, i) => {
      positions[id] = { x: marginX + i * colWidth, y: marginY + d * rowHeight };
    });
  }

  return {
    positions,
    edges,
    width: marginX * 2 + maxCols * colWidth,
    height: marginY * 2 + depths.length * rowHeight,
  };
}

// containsの子孫（再帰・requiresは含めない）の完了率を数える。
// nodeId自身のsatisfiedはcontains内の子の状態に一切連動しない設計なので
// （最初の壁打ちで決めたflat DAG原則: containsは表示グループ化のみ）、
// 「本体はsatisfiedだが中身は未達」という見た目の誤解を防ぐための補助指標。
function containsCompletion(report, nodeId, seen = new Set()) {
  if (seen.has(nodeId)) return { done: 0, total: 0 };
  seen.add(nodeId);
  const node = report.nodes[nodeId];
  if (!node) return { done: 0, total: 0 };
  let done = 0, total = 0;
  for (const childId of (node.contains || [])) {
    const child = report.nodes[childId];
    if (!child) continue;
    total += 1;
    if (child.satisfied) done += 1;
    const sub = containsCompletion(report, childId, seen);
    done += sub.done;
    total += sub.total;
  }
  return { done, total };
}

function nodeColor(id) {
  if (id === state.report.buildId) return STATE_COLOR.ROOT;
  const view = state.report.nodes[id];
  return STATE_COLOR[view?.state] || "var(--muted)";
}
