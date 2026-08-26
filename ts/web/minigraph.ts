// Port of web/minigraph.js. Git-commit-graph-style mini progress display on
// equipment cards (2026-08-18 design). Not a reuse of Chain View's own
// hierarchical BFS layout (nesting/drill-down included) — this is a
// deliberately lighter, standalone renderer. Interaction is limited to a
// tooltip on hover/click of each dot; there's no navigation into the full
// Chain View (static progress glance only, by design).
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
  return `${LAYER_LABEL_JA[state]}（${done}/${nodes.length}）: ${shown}`;
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
  const order = layers.map((_, i) => layers.length - 1 - i);

  const step = 20;
  const r = 5;
  const padX = 8;
  const h = 20;
  const svgW = order.length <= 1 ? 18 : padX * 2 + step * (order.length - 1);
  const cy = h / 2;

  let lines = "";
  for (let i = 0; i < order.length - 1; i++) {
    const x1 = padX + i * step;
    const x2 = padX + (i + 1) * step;
    const bothSatisfied = states[order[i]!] === "satisfied" && states[order[i + 1]!] === "satisfied";
    lines += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${bothSatisfied ? "var(--satisfied)" : "var(--border)"}" stroke-width="2"/>`;
  }
  const dots = order
    .map((layerIdx, i) => {
      const x = order.length <= 1 ? 9 : padX + i * step;
      const layerState = states[layerIdx]!;
      const tooltip = layerTooltip(layerIdx, layers, nodesById, layerState);
      return `<circle class="minigraph-dot" data-tip="${escapeAttr(tooltip)}" cx="${x}" cy="${cy}" r="${r}" fill="${LAYER_COLOR[layerState]}" stroke="var(--bg)" stroke-width="1.5"/>`;
    })
    .join("");

  containerEl.innerHTML = `<div class="minigraph-wrap"><svg class="minigraph-svg" width="${svgW}" height="${h}">${lines}${dots}</svg></div>`;
  bindDots(containerEl);
}

function bindDots(containerEl: HTMLElement): void {
  containerEl.querySelectorAll<SVGCircleElement>(".minigraph-dot").forEach((dot) => {
    const text = dot.dataset.tip ?? "";
    dot.addEventListener("mouseenter", (e) => showTip(e, text));
    dot.addEventListener("mousemove", (e) => showTip(e, text));
    dot.addEventListener("mouseleave", hideTip);
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      showTip(e, text);
    });
  });
}
