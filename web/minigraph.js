// 装備カード上のGitコミット履歴グラフ風ミニ進捗表示（2026-08-18設計）。
// Chain View本体の階層BFSレイアウト（入れ子・ドリルダウン込み）は再利用せず、
// requiresチェーンをそのまま一直線の点と線で並べるだけの軽量な専用レンダラー。
// インタラクションは各点クリック/ホバーで名前＋状態をツールチップ表示するのみ、
// フルChain Viewへの遷移導線は持たない（静的な進捗確認用途に限定、という設計判断どおり）。

(function () {
  const STYLE = `
    .minigraph-wrap { margin: 4px 0 2px; overflow-x: auto; }
    .minigraph-svg { display: block; }
    .minigraph-dot { cursor: pointer; }
    #minigraph-tip {
      position: fixed; z-index: 500; pointer-events: none;
      background: var(--panel, #1b1e27); backdrop-filter: blur(var(--panel-blur)); -webkit-backdrop-filter: blur(var(--panel-blur));
      border: 1px solid var(--border, #2a2e3a); border-radius: 8px;
      padding: 4px 8px; font-size: 0.75rem; color: var(--text, #e4e6ec);
      box-shadow: 0 6px 16px rgba(0,0,0,0.35); white-space: nowrap;
      opacity: 0; transition: opacity 0.1s ease;
    }
    #minigraph-tip.show { opacity: 1; }
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  const tip = document.createElement("div");
  tip.id = "minigraph-tip";
  document.body.appendChild(tip);

  function showTip(evt, name, satisfied) {
    tip.textContent = `${name} — ${satisfied ? "達成済み" : "未達成"}`;
    tip.style.left = `${evt.clientX + 12}px`;
    tip.style.top = `${evt.clientY + 12}px`;
    tip.classList.add("show");
  }
  function hideTip() {
    tip.classList.remove("show");
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  // targetId起点でrequiresを再帰的に遡った祖先ノード集合（targetId自身も含む）。
  function collectRequiresClosure(targetId, nodesById) {
    const visited = new Set();
    const stack = [targetId];
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id) || !nodesById[id]) continue;
      visited.add(id);
      (nodesById[id].requires || []).forEach((r) => stack.push(r));
    }
    return visited;
  }

  // 前提(prereq)が先、対象(target)が最後に来るよう位相ソート（Kahn法、部分集合限定）。
  function topoOrder(nodeSet, nodesById) {
    const indegree = {};
    const adj = {};
    nodeSet.forEach((id) => {
      indegree[id] = 0;
      adj[id] = [];
    });
    nodeSet.forEach((id) => {
      (nodesById[id].requires || []).forEach((r) => {
        if (!nodeSet.has(r)) return;
        adj[r].push(id);
        indegree[id]++;
      });
    });
    const queue = Array.from(nodeSet)
      .filter((id) => indegree[id] === 0)
      .sort();
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      adj[id].forEach((dep) => {
        indegree[dep]--;
        if (indegree[dep] === 0) queue.push(dep);
      });
    }
    // 循環参照があった場合の防御的フォールバック（本来はDAGのはず）
    nodeSet.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    return order;
  }

  // containerEl: 描画先要素。nodeId: Chain View側ノードID。nodesById: /api/graph の nodes マップ。
  function renderMiniGraph(containerEl, nodeId, nodesById) {
    if (!nodeId || !nodesById || !nodesById[nodeId]) {
      containerEl.innerHTML = "";
      return;
    }
    const closure = collectRequiresClosure(nodeId, nodesById);
    const order = topoOrder(closure, nodesById);
    const items = order.map((id) => nodesById[id]).filter(Boolean);
    if (items.length <= 1) {
      containerEl.innerHTML = `<div class="minigraph-wrap"><svg class="minigraph-svg" width="18" height="20">
        <circle class="minigraph-dot" data-name="${escapeAttr(items[0] ? items[0].name : "")}" data-satisfied="${items[0] ? items[0].satisfied : false}"
          cx="9" cy="10" r="5" fill="${items[0] && items[0].satisfied ? "var(--satisfied)" : "var(--border)"}" stroke="var(--bg)" stroke-width="1.5"/>
      </svg></div>`;
      bindDots(containerEl);
      return;
    }

    const step = 20,
      r = 5,
      padX = 8,
      h = 20;
    const svgW = padX * 2 + step * (items.length - 1);
    const cy = h / 2;

    let lines = "";
    for (let i = 0; i < items.length - 1; i++) {
      const x1 = padX + i * step,
        x2 = padX + (i + 1) * step;
      const bothDone = items[i].satisfied && items[i + 1].satisfied;
      lines += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${bothDone ? "var(--satisfied)" : "var(--border)"}" stroke-width="2"/>`;
    }
    const dots = items
      .map((n, i) => {
        const x = padX + i * step;
        const color = n.satisfied ? "var(--satisfied)" : "var(--border)";
        return `<circle class="minigraph-dot" data-name="${escapeAttr(n.name)}" data-satisfied="${n.satisfied}" cx="${x}" cy="${cy}" r="${r}" fill="${color}" stroke="var(--bg)" stroke-width="1.5"/>`;
      })
      .join("");

    containerEl.innerHTML = `<div class="minigraph-wrap"><svg class="minigraph-svg" width="${svgW}" height="${h}">${lines}${dots}</svg></div>`;
    bindDots(containerEl);
  }

  function bindDots(containerEl) {
    containerEl.querySelectorAll(".minigraph-dot").forEach((dot) => {
      dot.addEventListener("mouseenter", (e) => showTip(e, dot.dataset.name, dot.dataset.satisfied === "true"));
      dot.addEventListener("mousemove", (e) => showTip(e, dot.dataset.name, dot.dataset.satisfied === "true"));
      dot.addEventListener("mouseleave", hideTip);
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        showTip(e, dot.dataset.name, dot.dataset.satisfied === "true");
      });
    });
  }

  window.renderMiniGraph = renderMiniGraph;
})();
