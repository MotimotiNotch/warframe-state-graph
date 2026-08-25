function renderGraph() {
  const layout = computeLayout(state.report);
  const svg = document.getElementById("graph-svg");
  svg.setAttribute("width", layout.width);
  svg.setAttribute("height", layout.height);
  svg.innerHTML = "";

  // ルートノードだけ半径22、それ以外は18（下のノード描画ループと同じ値）。
  // エッジの端点をノード中心ではなく円周で止めるための半径参照に使う。
  const nodeRadius = (id) => (id === state.report.buildId ? 22 : 18);

  const ns = "http://www.w3.org/2000/svg";
  for (const e of layout.edges) {
    const p1 = layout.positions[e.from], p2 = layout.positions[e.to];
    if (!p1 || !p2) continue;
    // 中心同士を結ぶと線がノード内部（中央）まで伸びてしまうため、始点・終点を
    // それぞれの半径ぶん外側へオフセットし、円周で止まるようにする（2026-08-18）。
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const r1 = nodeRadius(e.from), r2 = nodeRadius(e.to);
    const x1 = p1.x + ux * r1, y1 = p1.y + uy * r1;
    const x2 = p2.x - ux * r2, y2 = p2.y - uy * r2;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("class", e.kind === "requires" ? "edge-requires" : "edge-contains");
    svg.appendChild(line);
  }

  for (const [id, pos] of Object.entries(layout.positions)) {
    const node = state.report.nodes[id];
    if (!node) continue;

    const isRoot = id === state.report.buildId;
    const drillable = !isRoot && (node.contains?.length ?? 0) > 0;
    const r = isRoot ? 22 : 18;
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", pos.x); circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", r);
    // エッジを円周で止めるよう修正済み（上のnodeRadius/オフセット計算）のため、
    // ノード内部へ線が入り込むことはもう無い。不透明var(--bg)は黒塗りで浮いて見えたため、
    // 元の半透明var(--panel)へ戻した（2026-08-18）。
    circle.setAttribute("fill", "var(--panel)");
    circle.setAttribute("stroke", nodeColor(id));
    circle.setAttribute("stroke-width", "3");
    circle.setAttribute("class", "node" + (state.selected === id ? " selected" : "") + (drillable ? " drillable" : ""));
    circle.dataset.id = id;
    // 子(contains)を持つノードはクリックでその場で1段フォーカスを移し、葉ノードは選択してInspectorに詳細を出す。
    // ラベル文字列（14文字超は省略表示）とcircleで同じハンドラーを共有する — 円だけが当たり判定だと、
    // 省略された名前の続きを見たくてラベルをクリックしても無反応になるため（2026-08-21）。
    const handleNodeClick = () => {
      if (drillable) {
        focusOn(id);
      } else {
        state.selected = id;
        renderGraph();
        renderPanel();
      }
    };
    circle.addEventListener("click", handleNodeClick);
    // ホバーすると中にある全ノード（レイヤーパネルの一覧）を表示し、クリックで一気にそこまで飛べる
    // （通常クリックは1段ずつ、というルールはそのまま。これは複数段を飛ぶショートカット）。
    const handleNodeEnter = () => {
      const items = collectDescendants(id);
      showFlyout(circle, "中身（クリックで直接ジャンプ）", items, (it) => focusOn(it.id));
    };
    if (drillable) {
      circle.addEventListener("mouseenter", handleNodeEnter);
      circle.addEventListener("mouseleave", scheduleHideFlyout);
    }
    svg.appendChild(circle);

    // 入れ子（containsを持ち、ドリルダウンできる）ノードは同心円の細いリングで判別する。
    // 塗り潰しは状態色の意味を薄めて濁るので避け、「thin marks」の方針で線1本だけ足す。
    // リングは満円ではなく、中身（containsの子孫）の完了率を円弧の長さで表す進捗リングにする。
    // ノード本体の状態色（外側の線）とは独立した情報 — 本体がsatisfiedでも中身が未達なら弧は途中で切れる。
    if (drillable) {
      const { done, total } = containsCompletion(state.report, id);
      const ringR = r * 0.6;
      const circumference = 2 * Math.PI * ringR;
      const frac = total ? done / total : 0;

      // 下地のトラック（未達成分）は常にフルの円として描き、「入れ子である」こと自体を保証する。
      // --borderだと薄すぎて入れ子判別そのものが見えなくなるため、状態色を半透明にして使う
      // （色の系統は保ちつつ、進捗弧の「濃い部分」との対比で完了率を示す）。
      const track = document.createElementNS(ns, "circle");
      track.setAttribute("cx", pos.x); track.setAttribute("cy", pos.y);
      track.setAttribute("r", ringR);
      track.setAttribute("fill", "none");
      track.setAttribute("stroke", nodeColor(id));
      track.setAttribute("stroke-opacity", "0.3");
      track.setAttribute("stroke-width", "1.5");
      track.setAttribute("pointer-events", "none");
      svg.appendChild(track);

      // 進捗分の弧。frac===0だとstroke-linecap:roundが長さ0のダッシュにも丸い点を
      // 描いてしまうSVGの仕様があるため、0%のときは弧そのものを描かずトラックだけにする。
      if (frac > 0) {
        const arc = document.createElementNS(ns, "circle");
        arc.setAttribute("cx", pos.x); arc.setAttribute("cy", pos.y);
        arc.setAttribute("r", ringR);
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", nodeColor(id));
        arc.setAttribute("stroke-width", "1.5");
        arc.setAttribute("stroke-dasharray", `${circumference * frac} ${circumference}`);
        arc.setAttribute("stroke-linecap", "round");
        arc.setAttribute("transform", `rotate(-90 ${pos.x} ${pos.y})`);
        arc.setAttribute("pointer-events", "none");
        svg.appendChild(arc);
      }

      const title = document.createElementNS(ns, "title");
      title.textContent = `中身の完了: ${done} / ${total}`;
      track.appendChild(title);
    }

    // 選択中は状態色と紛れないアクセントカラーの内側ドットで明示する（入れ子リングとは別の視覚言語）
    if (state.selected === id) {
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", pos.x); dot.setAttribute("cy", pos.y);
      dot.setAttribute("r", r * 0.4);
      dot.setAttribute("fill", "var(--accent)");
      dot.setAttribute("pointer-events", "none");
      svg.appendChild(dot);
    }

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pos.x); label.setAttribute("y", pos.y + 34);
    label.setAttribute("class", "node-label" + (drillable ? " drillable" : ""));
    label.textContent = node.name.length > 14 ? node.name.slice(0, 13) + "…" : node.name;
    label.addEventListener("click", handleNodeClick);
    if (drillable) {
      label.addEventListener("mouseenter", handleNodeEnter);
      label.addEventListener("mouseleave", scheduleHideFlyout);
    }
    svg.appendChild(label);
  }
}
