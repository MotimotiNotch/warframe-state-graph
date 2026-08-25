// 単鎖の自動フラット化は廃止（各段ごとに個別クリック・個別に戻るのが期待挙動と確認済み）。
// クリックしたノードへそのままフォーカスを移す。
// 現在のフォーカスからnodeIdまでの contains 経路上にある中間ノードを求める
// （フライアウトのショートカットで複数段を一気に飛んだ場合、実際に通過したはずの
// 中間ノードがパンくずから欠落しないようにするため）。通常の1段クリックでは空配列になる。
function ancestorsBetweenFocusAnd(nodeId) {
  const parentOf = {};
  const seen = new Set();
  (function walk(id) {
    if (seen.has(id)) return;
    seen.add(id);
    const node = state.report.nodes[id];
    if (!node) return;
    for (const childId of (node.contains || [])) {
      if (!(childId in parentOf)) parentOf[childId] = id;
      walk(childId);
    }
  })(state.focus);

  const path = [];
  let cur = nodeId;
  while (cur !== state.focus && parentOf[cur] !== undefined) {
    path.unshift(cur);
    cur = parentOf[cur];
  }
  return path.slice(0, -1); // nodeId自身は除き、間にある中間ノードだけ返す
}

function focusOn(nodeId) {
  const intermediates = ancestorsBetweenFocusAnd(nodeId);
  state.history.push(state.focus, ...intermediates);
  state.focus = nodeId;
  state.selected = nodeId; // 移動先ノード自身の情報がInspectorから消えないようにする
  loadReport();
}

// 経路上の途中まで一気に戻る（ホバーリストからの直接ジャンプ用）。
function jumpToHistory(index) {
  state.focus = state.history[index];
  state.history = state.history.slice(0, index);
  state.selected = state.focus;
  loadReport();
}

// containsの子孫を再帰的に辿り、分岐点（子が2つ以上あるノード）だけを集める。
// state.report.nodesは現在のフォーカスの全子孫を含む（描画は1段に制限しているだけ）ので
// 追加のAPI呼び出しなしでショートカット一覧を作れる。
// 子孫を全部リストする（葉ノードも含む）。達成チェックリストとして機能させるため、
// 未達の葉ノードも見えている必要がある。ただしジャンプ先になれる（クリックできる）のは
// それ自体が入れ子（containsを持つ）ノードだけ — clickableで区別する。
// 子孫のうち、それ自体が入れ子（containsを持つ＝クリックでさらに飛べる）ノードだけをリストする。
// 完了ドットは自分のsatisfiedではなく「中身が全部完了してるか」で判定する
// （satisfiedは中身の状態と独立のフラグなので、そのまま使うと本体済み/中身未達を見逃す。
// これにより葉ノードを別途並べなくても、入れ子ノードのドットだけで中の状態が分かる）。
function collectDescendants(nodeId, depth = 0, seen = new Set()) {
  if (seen.has(nodeId)) return [];
  seen.add(nodeId);
  const node = state.report.nodes[nodeId];
  if (!node) return [];
  let results = [];
  for (const childId of (node.contains || [])) {
    const child = state.report.nodes[childId];
    if (!child) continue;
    if ((child.contains?.length ?? 0) > 0) {
      const c = containsCompletion(state.report, childId);
      const satisfied = c.total > 0 && c.done === c.total;
      results.push({ id: childId, name: child.name, depth, satisfied, clickable: true });
    }
    results = results.concat(collectDescendants(childId, depth + 1, seen));
  }
  return results;
}

let flyoutHideTimer = null;

function showFlyout(anchorEl, label, items, onPick) {
  clearTimeout(flyoutHideTimer);
  const flyout = document.getElementById("flyout");
  if (!items.length) { flyout.classList.add("hidden"); return; }

  flyout.innerHTML = `<div class="flyout-label">${label}</div>` + items.map((it, i) => {
    // ✅/⬜のような別記号ではなく、凡例・グラフ本体と同じドット言語（青=Satisfied）で揃える。
    const dot = it.satisfied === undefined ? "" :
      `<i class="dot" style="background:${it.satisfied ? "var(--satisfied)" : "var(--border)"}"></i> `;
    const clickable = it.clickable !== false; // フィールドが無い呼び出し元は従来通り全部クリック可
    const cls = "item" + (clickable ? "" : " not-clickable");
    // 深い入れ子でインデントが際限なく伸びて横に破綻しないよう、表示上の段数に上限をかける
    // （実際の深さ情報は失わない、あくまで見た目のインデント幅だけの話）。
    // 頭打ち後は段数が潰れて区別つかなくなるので、実際の深さを数字で補足する。
    const depth = it.depth ?? 0;
    const capped = 6;
    const indent = "　".repeat(Math.min(depth, capped));
    const depthTag = depth >= capped ? `<span class="depth-tag">D${depth}</span> ` : "";
    return `<div class="${cls}" data-i="${i}" title="${it.name}">${indent}${depthTag}${dot}${it.name}</div>`;
  }).join("");

  const panelRect = document.getElementById("graph-panel").getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();
  flyout.classList.remove("hidden");

  // 右端・下端でのはみ出しを避ける（多数の入れ子でリストが縦横に育っても親パネル内に収まるように）。
  const flyoutW = flyout.offsetWidth;
  const flyoutH = flyout.offsetHeight;
  let left = anchorRect.left - panelRect.left + anchorRect.width / 2;
  let top = anchorRect.bottom - panelRect.top + 6;
  left = Math.min(left, panelRect.width - flyoutW - 4);
  left = Math.max(left, 4);
  if (top + flyoutH > panelRect.height) {
    top = anchorRect.top - panelRect.top - flyoutH - 6; // 収まらなければノードの上側に出す
  }
  flyout.style.left = left + "px";
  flyout.style.top = top + "px";

  flyout.querySelectorAll(".item:not(.not-clickable)").forEach(el => {
    el.addEventListener("click", () => { onPick(items[Number(el.dataset.i)]); hideFlyout(); });
  });
  flyout.onmouseenter = () => clearTimeout(flyoutHideTimer);
  flyout.onmouseleave = scheduleHideFlyout;
}

function scheduleHideFlyout() {
  flyoutHideTimer = setTimeout(hideFlyout, 150);
}

function hideFlyout() {
  document.getElementById("flyout").classList.add("hidden");
}

// 「パンくず」は経路表示ではなく「今どこにいるか」＋「戻る」だけのシンプルな表示にする。
// 内部モデル（focus + history＝戻る履歴）は変えず、表示だけ常時パンくずにする。
// state.historyがそのまま経路（Buildルートから現在地までの訪問順）になっている。
// 「← 戻る」ボタンの位置にパンくずトレイルを常時表示する。内部モデル（focus + history）は変えず、
// state.history（訪問順の経路）+ 現在地をそのまま並べるだけ。途中のパンくずはクリックで直接ジャンプ。
function renderBreadcrumb() {
  const el = document.getElementById("breadcrumb");
  const trail = [...state.history, state.focus];
  el.innerHTML = trail.map((id, i) => {
    const isLast = i === trail.length - 1;
    const name = state.graph.nodes[id]?.name ?? id;
    const cls = isLast ? "crumb current" : "crumb";
    return `<span class="${cls}" data-idx="${i}">${name}</span>`;
  }).join(`<span class="sep">▸</span>`);

  el.querySelectorAll(".crumb:not(.current)").forEach(elm => {
    elm.addEventListener("click", () => jumpToHistory(Number(elm.dataset.idx)));
  });
}
