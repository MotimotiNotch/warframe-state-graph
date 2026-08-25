// Port of web/minigraph.js. Git-commit-graph-style mini progress display on
// equipment cards (2026-08-18 design). Not a reuse of Chain View's own
// hierarchical BFS layout (nesting/drill-down included) — this is a
// deliberately lighter, standalone renderer that just lays the `requires`
// chain out as a straight line of dots and edges. Interaction is limited to
// a name+state tooltip on hover/click of each dot; there's no navigation
// into the full Chain View (static progress glance only, by design).
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

function showTip(evt: MouseEvent, name: string, satisfied: boolean): void {
  tip.textContent = `${name} — ${satisfied ? "達成済み" : "未達成"}`;
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

/** The `requires` ancestor closure of targetId (targetId itself included). */
function collectRequiresClosure(targetId: string, nodesById: NodesById): Set<string> {
  const visited = new Set<string>();
  const stack = [targetId];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id) || !nodesById[id]) continue;
    visited.add(id);
    (nodesById[id]?.requires ?? []).forEach((r) => stack.push(r));
  }
  return visited;
}

/** Kahn's algorithm topo sort restricted to nodeSet — prerequisite first, target last. */
function topoOrder(nodeSet: Set<string>, nodesById: NodesById): string[] {
  const indegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  nodeSet.forEach((id) => {
    indegree[id] = 0;
    adj[id] = [];
  });
  nodeSet.forEach((id) => {
    (nodesById[id]?.requires ?? []).forEach((r) => {
      if (!nodeSet.has(r)) return;
      adj[r]!.push(id);
      indegree[id]!++;
    });
  });
  const queue = Array.from(nodeSet)
    .filter((id) => indegree[id] === 0)
    .sort();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    adj[id]!.forEach((dep) => {
      indegree[dep]!--;
      if (indegree[dep] === 0) queue.push(dep);
    });
  }
  // Defensive fallback in case of a cycle (shouldn't happen — this is meant to be a DAG).
  nodeSet.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });
  return order;
}

/** containerEl: render target. nodeId: Chain View node id. nodesById: the /api/graph nodes map. */
export function renderMiniGraph(containerEl: HTMLElement, nodeId: string | undefined, nodesById: NodesById): void {
  if (!nodeId || !nodesById[nodeId]) {
    containerEl.innerHTML = "";
    return;
  }
  const closure = collectRequiresClosure(nodeId, nodesById);
  const order = topoOrder(closure, nodesById);
  const items = order.map((id) => nodesById[id]).filter((n): n is Node => !!n);
  if (items.length <= 1) {
    const only = items[0];
    containerEl.innerHTML = `<div class="minigraph-wrap"><svg class="minigraph-svg" width="18" height="20">
        <circle class="minigraph-dot" data-name="${escapeAttr(only ? only.name : "")}" data-satisfied="${only ? only.satisfied : false}"
          cx="9" cy="10" r="5" fill="${only?.satisfied ? "var(--satisfied)" : "var(--border)"}" stroke="var(--bg)" stroke-width="1.5"/>
      </svg></div>`;
    bindDots(containerEl);
    return;
  }

  const step = 20;
  const r = 5;
  const padX = 8;
  const h = 20;
  const svgW = padX * 2 + step * (items.length - 1);
  const cy = h / 2;

  let lines = "";
  for (let i = 0; i < items.length - 1; i++) {
    const x1 = padX + i * step;
    const x2 = padX + (i + 1) * step;
    const bothDone = items[i]!.satisfied && items[i + 1]!.satisfied;
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

function bindDots(containerEl: HTMLElement): void {
  containerEl.querySelectorAll<SVGCircleElement>(".minigraph-dot").forEach((dot) => {
    const name = dot.dataset.name ?? "";
    const satisfied = dot.dataset.satisfied === "true";
    dot.addEventListener("mouseenter", (e) => showTip(e, name, satisfied));
    dot.addEventListener("mousemove", (e) => showTip(e, name, satisfied));
    dot.addEventListener("mouseleave", hideTip);
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      showTip(e, name, satisfied);
    });
  });
}
