// Port of web/minigraph.js. Git-commit-graph-style mini progress display on
// equipment cards (2026-08-18 design). Not a reuse of Chain View's own
// hierarchical BFS layout (nesting/drill-down included) — this is a
// deliberately lighter, standalone renderer.
//
// Clicking any dot jumps to Chain View with the linked node selected
// (2026-08-26, のっち's call — previously this was a static glance only,
// no navigation). Every dot in one minigraph jumps to the same place: the
// item's own linked node, not whatever individual/aggregated nodes that
// particular layer happens to represent — a fan-out layer has no single
// "corresponding" node to jump to, so there's no attempt to resolve one.
//
// Redesigned 2026-08-26: the original version only walked `requires` and put
// one dot per node — real items mostly compose parts via `contains` instead
// (e.g. a Prime frame `contains` 5 blueprint/component nodes, `requires: []`
// at the item level), so it rendered as a single, easy-to-miss dot for the
// common case. Now BFS-layers the requires∪contains tree from the target
// (layer 0 = target, layer 1 = its direct children, ...) and renders one dot
// per *layer*, colored with the same satisfied/actionable/blocked 3-state
// Chain View's own graph uses — a layer is "actionable" once the layer one
// level deeper (its own prerequisites) is fully satisfied, matching what
// ACTIONABLE actually means there. A pure `requires` chain (no fan-out)
// degrades to the old one-dot-per-node look, since each layer then holds
// exactly one node.
import type { Node } from "../server/model.ts";

const STYLE = `
    .minigraph-wrap { margin: 4px 0 2px; overflow-x: auto; }
    .minigraph-svg { display: block; }
    .minigraph-dot { cursor: pointer; }
    .minigraph-hit { cursor: pointer; }
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

function showTip(evt: MouseEvent, text: string): void {
  tip.textContent = text;
  tip.style.left = `${evt.clientX + 12}px`;
  tip.style.top = `${evt.clientY + 12}px`;
  tip.classList.add("show");
}
function hideTip(): void {
  tip.classList.remove("show");
}

function escapeAttr(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

type NodesById = Record<string, Node>;
type LayerState = "satisfied" | "actionable" | "blocked";

// Same 3-state model Chain View's own graph uses (graph-state.ts's
// STATE_COLOR) — reused directly, not reinvented, per のっち's direction
// (2026-08-26) to keep this legible against the one legend players already
// have to learn.
const LAYER_COLOR: Record<LayerState, string> = {
  satisfied: "var(--satisfied)",
  actionable: "var(--actionable)",
  blocked: "var(--blocked)",
};
const LAYER_LABEL_JA: Record<LayerState, string> = {
  satisfied: "達成済み",
  actionable: "実行可能",
  blocked: "前提待ち",
};

/**
 * BFS layers from targetId, walking `requires` ∪ `contains` (a Frame's parts
 * live under `contains`, a quest chain's prerequisites live under `requires`
 * — real data mixes which relation is populated, so both are followed).
 * layers[0] = [targetId]; layers[1] = its direct requires/contains children;
 * deeper layers follow the same way. A node reachable by multiple paths
 * keeps only its shallowest layer (first-seen wins).
 */
function collectLayers(targetId: string, nodesById: NodesById): string[][] {
  const layerOf = new Map<string, number>();
  let frontier = [targetId];
  let depth = 0;
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      if (layerOf.has(id) || !nodesById[id]) continue;
      layerOf.set(id, depth);
      const node = nodesById[id]!;
      for (const childId of [...(node.requires ?? []), ...(node.contains ?? [])]) {
        if (!layerOf.has(childId)) next.push(childId);
      }
    }
    frontier = next;
    depth++;
  }
  const layers: string[][] = Array.from({ length: depth }, () => []);
  layerOf.forEach((d, id) => layers[d]!.push(id));
  return layers;
}

/**
 * One state per layer, computed deepest-first: a layer is "satisfied" if
 * every node in it is; otherwise "actionable" if it's the deepest layer (no
 * further prerequisites to wait on) or the layer one level deeper is fully
 * satisfied (its own prerequisites are met); otherwise "blocked". Mirrors
 * the real engine's ACTIONABLE definition (not done, but unblocked) without
 * needing the full NextActionReport — layers[] already encodes the same
 * requires/contains dependency structure.
 */
function layerStates(layers: string[][], nodesById: NodesById): LayerState[] {
  const states: LayerState[] = new Array(layers.length);
  for (let k = layers.length - 1; k >= 0; k--) {
    const nodes = layers[k]!.map((id) => nodesById[id]).filter((n): n is Node => !!n);
    const allSatisfied = nodes.length > 0 && nodes.every((n) => n.satisfied);
    if (allSatisfied) {
      states[k] = "satisfied";
    } else {
      const deeper = k + 1 < layers.length ? states[k + 1] : undefined;
      states[k] = deeper === undefined || deeper === "satisfied" ? "actionable" : "blocked";
    }
  }
  return states;
}

function layerTooltip(layerIdx: number, layers: string[][], nodesById: NodesById, state: LayerState): string {
  const nodes = layers[layerIdx]!.map((id) => nodesById[id]).filter((n): n is Node => !!n);
  const done = nodes.filter((n) => n.satisfied).length;
  const names = nodes.map((n) => n.name);
  const shown = names.length > 3 ? `${names.slice(0, 3).join("、")} 他${names.length - 3}件` : names.join("、");
  return `${LAYER_LABEL_JA[state]}（${done}/${nodes.length}）: ${shown}　［クリックでChain Viewへ］`;
}

/** containerEl: render target. nodeId: Chain View node id. nodesById: the /api/graph nodes map. */
export function renderMiniGraph(containerEl: HTMLElement, nodeId: string | undefined, nodesById: NodesById): void {
  if (!nodeId || !nodesById[nodeId]) {
    containerEl.innerHTML = "";
    return;
  }
  const layers = collectLayers(nodeId, nodesById);
  const states = layerStates(layers, nodesById);
  // Render order: deepest layer (furthest prerequisite) on the left, the
  // target itself (layer 0) on the right — same "prerequisite first, target
  // last" reading direction the old requires-chain version used.
  //
  // Capped to the MAX_LAYERS deepest layers (2026-08-26, のっち's call): the
  // point of this widget is a glance at how far along things are, not a
  // full tree — and the deepest layers are the most foundational
  // prerequisites (raw farming/materials), which is where day-to-day
  // progress actually happens; the shallower layers (assembly/crafting) are
  // usually quick once those are done. For a node with more layers than
  // this, the target itself (layer 0) drops off the display entirely —
  // confirmed as the intended tradeoff, not an oversight.
  const MAX_LAYERS = 3;
  const order = layers.map((_, i) => layers.length - 1 - i).slice(0, MAX_LAYERS);
  // The cut-off part is always the shallow end (toward the target/goal,
  // rendered on the right) — a dashed stub there signals "this keeps going,
  // you're not looking at the whole thing" instead of silently implying the
  // visible 3 layers are the entire chain (2026-08-26, のっち's call).
  const truncated = layers.length > order.length;
  const stubLen = 10;

  const step = 20;
  const r = 5;
  const padX = 8;
  const h = 20;
  const baseW = order.length <= 1 ? 18 : padX * 2 + step * (order.length - 1);
  const svgW = baseW + (truncated ? stubLen + 4 : 0);
  const cy = h / 2;

  // The dots themselves stay small by design — but a 5px-radius circle is a
  // narrow target to actually hit (2026-08-26, のっち's call). Rather than
  // enlarging the dots, an invisible rect underneath catches clicks/hover
  // across a fixed area sized for the common MAX_LAYERS=3 case, regardless
  // of how few dots this particular instance actually renders — so even a
  // single-dot minigraph (the common case: an item with no fan-out) gets
  // the same generous, consistent click target as a full 3-dot one.
  const hitW = padX * 2 + step * (MAX_LAYERS - 1);
  const svgWFinal = Math.max(svgW, hitW);

  let lines = `<rect class="minigraph-hit" x="0" y="0" width="${hitW}" height="${h}" fill="transparent"/>`;
  for (let i = 0; i < order.length - 1; i++) {
    const x1 = padX + i * step;
    const x2 = padX + (i + 1) * step;
    const bothSatisfied = states[order[i]!] === "satisfied" && states[order[i + 1]!] === "satisfied";
    lines += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${bothSatisfied ? "var(--satisfied)" : "var(--border)"}" stroke-width="2"/>`;
  }
  if (truncated) {
    const lastX = order.length <= 1 ? 9 : padX + (order.length - 1) * step;
    lines += `<line x1="${lastX + r}" y1="${cy}" x2="${lastX + r + stubLen}" y2="${cy}" stroke="var(--border)" stroke-width="2" stroke-dasharray="2,2"><title>この先にさらに層があります（表示は最深${MAX_LAYERS}層まで）</title></line>`;
  }
  const dots = order
    .map((layerIdx, i) => {
      const x = order.length <= 1 ? 9 : padX + i * step;
      const layerState = states[layerIdx]!;
      const tooltip = layerTooltip(layerIdx, layers, nodesById, layerState);
      return `<circle class="minigraph-dot" data-tip="${escapeAttr(tooltip)}" cx="${x}" cy="${cy}" r="${r}" fill="${LAYER_COLOR[layerState]}" stroke="var(--bg)" stroke-width="1.5"/>`;
    })
    .join("");

  containerEl.innerHTML = `<div class="minigraph-wrap"><svg class="minigraph-svg" width="${svgWFinal}" height="${h}">${lines}${dots}</svg></div>`;
  bindDots(containerEl, nodeId);
}

function bindDots(containerEl: HTMLElement, nodeId: string): void {
  const navigate = (): void => {
    window.location.href = `/?focus=${encodeURIComponent(nodeId)}`;
  };
  // The hit rect is the actual click/hover target now (sized generously and
  // consistently, see renderMiniGraph) — it sits under the dots but nothing
  // else in this small SVG can occlude it, so binding navigation there once
  // covers the whole minigraph rather than per-dot.
  const hit = containerEl.querySelector<SVGRectElement>(".minigraph-hit");
  if (hit) {
    hit.addEventListener("click", (e) => {
      e.stopPropagation();
      navigate();
    });
  }
  // Dots keep their own hover/click bindings too — tooltip content differs
  // per dot, and a dot can still receive the pointer directly (it's drawn
  // on top of the hit rect), so its own click must also navigate rather
  // than falling through to nothing.
  containerEl.querySelectorAll<SVGCircleElement>(".minigraph-dot").forEach((dot) => {
    const text = dot.dataset.tip ?? "";
    dot.addEventListener("mouseenter", (e) => showTip(e, text));
    dot.addEventListener("mousemove", (e) => showTip(e, text));
    dot.addEventListener("mouseleave", hideTip);
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      navigate();
    });
  });
}
