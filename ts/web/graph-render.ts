// Port of web/graph-render.js. SVG rendering of the current layout.

import { el } from "./dom.ts";
import { state } from "./graph-state.ts";
import { computeLayout, containsCompletion, nodeColor } from "./graph-layout.ts";
import { collectDescendants, focusOn, scheduleHideFlyout, showFlyout } from "./graph-nav.ts";
import { renderPanel } from "./inspector.ts";
import { nodeDisplayName } from "./quest-i18n.ts";
import { effective } from "./locale.ts";

const STRINGS: Record<"ja" | "en", { flyoutLabel: string; containsDone: string }> = {
  ja: { flyoutLabel: "中身（クリックで直接ジャンプ）", containsDone: "中身の完了" },
  en: { flyoutLabel: "Contents (click to jump straight there)", containsDone: "Contents completed" },
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderGraph(): void {
  const layout = computeLayout(state.report!);
  const svg = el<SVGSVGElement>("graph-svg");
  svg.setAttribute("width", String(layout.width));
  svg.setAttribute("height", String(layout.height));
  svg.innerHTML = "";

  // Root node only gets radius 22, everything else 18 (same values as the
  // node-drawing loop below) — used to stop edges at the node's circle edge
  // instead of its center.
  const nodeRadius = (id: string) => (id === state.report!.buildId ? 22 : 18);

  for (const e of layout.edges) {
    const p1 = layout.positions[e.from];
    const p2 = layout.positions[e.to];
    if (!p1 || !p2) continue;
    // Connecting centers directly would run the line into the node's
    // middle, so offset both ends outward by their radius and stop at the
    // circle edge instead (2026-08-18).
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const r1 = nodeRadius(e.from);
    const r2 = nodeRadius(e.to);
    const x1 = p1.x + ux * r1;
    const y1 = p1.y + uy * r1;
    const x2 = p2.x - ux * r2;
    const y2 = p2.y - uy * r2;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("class", e.kind === "requires" ? "edge-requires" : "edge-contains");
    svg.appendChild(line);
  }

  for (const [id, pos] of Object.entries(layout.positions)) {
    const node = state.report!.nodes[id];
    if (!node) continue;

    const isRoot = id === state.report!.buildId;
    const drillable = !isRoot && (node.contains?.length ?? 0) > 0;
    const r = isRoot ? 22 : 18;
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(pos.x));
    circle.setAttribute("cy", String(pos.y));
    circle.setAttribute("r", String(r));
    // Edges already stop at the circle edge (nodeRadius/offset math above),
    // so a line can no longer run into the node's interior. Opaque var(--bg)
    // read as a floating black blob, so the original translucent var(--panel)
    // was restored (2026-08-18).
    circle.setAttribute("fill", "var(--panel)");
    circle.setAttribute("stroke", nodeColor(id));
    circle.setAttribute("stroke-width", "3");
    circle.setAttribute("class", `node${state.selected === id ? " selected" : ""}${drillable ? " drillable" : ""}`);
    circle.dataset.id = id;
    // A node with contains children moves focus one level in on click; a
    // leaf node gets selected so Inspector shows its detail. The label text
    // (truncated past 14 chars) shares the same handler as the circle — if
    // only the circle were hit-testable, clicking the label to see the rest
    // of a truncated name would do nothing (2026-08-21).
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
    // Hovering shows every node inside (the layer-panel-style list) and
    // clicking jumps straight there (the "one level per click" rule for a
    // normal click is unchanged — this is a shortcut for skipping several
    // levels).
    const handleNodeEnter = () => {
      const items = collectDescendants(id);
      showFlyout(circle, STRINGS[effective()].flyoutLabel, items, (it) => focusOn(it.id));
    };
    if (drillable) {
      circle.addEventListener("mouseenter", handleNodeEnter);
      circle.addEventListener("mouseleave", scheduleHideFlyout);
    }
    svg.appendChild(circle);

    // A nested (has `contains`, drillable) node is marked by a thin
    // concentric ring — a filled dot would dilute the state color's
    // meaning, so this follows a "thin marks" approach with a single extra
    // line. The ring isn't a full circle; its arc length represents
    // completion of the `contains` descendants. This is independent of the
    // node's own state color (outer stroke) — if the body is satisfied but
    // the contents aren't, the arc still stops short.
    if (drillable) {
      const { done, total } = containsCompletion(state.report!, id);
      const ringR = r * 0.6;
      const circumference = 2 * Math.PI * ringR;
      const frac = total ? done / total : 0;

      // The background track (incomplete portion) is always drawn as a full
      // circle, to guarantee "this is nested" is visible on its own.
      // var(--border) alone reads too faint for that, so the state color is
      // used at reduced opacity instead (keeps the same color family while
      // still contrasting against the arc's solid portion).
      const track = document.createElementNS(SVG_NS, "circle");
      track.setAttribute("cx", String(pos.x));
      track.setAttribute("cy", String(pos.y));
      track.setAttribute("r", String(ringR));
      track.setAttribute("fill", "none");
      track.setAttribute("stroke", nodeColor(id));
      track.setAttribute("stroke-opacity", "0.3");
      track.setAttribute("stroke-width", "1.5");
      track.setAttribute("pointer-events", "none");
      svg.appendChild(track);

      // The completed-portion arc. SVG draws a rounded dot for a
      // zero-length dash when stroke-linecap:round is set, so at 0% the arc
      // itself is skipped and only the track is drawn.
      if (frac > 0) {
        const arc = document.createElementNS(SVG_NS, "circle");
        arc.setAttribute("cx", String(pos.x));
        arc.setAttribute("cy", String(pos.y));
        arc.setAttribute("r", String(ringR));
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", nodeColor(id));
        arc.setAttribute("stroke-width", "1.5");
        arc.setAttribute("stroke-dasharray", `${circumference * frac} ${circumference}`);
        arc.setAttribute("stroke-linecap", "round");
        arc.setAttribute("transform", `rotate(-90 ${pos.x} ${pos.y})`);
        arc.setAttribute("pointer-events", "none");
        svg.appendChild(arc);
      }

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${STRINGS[effective()].containsDone}: ${done} / ${total}`;
      track.appendChild(title);
    }

    // Selection is marked with an inner accent-colored dot distinct from
    // the state color (a different visual language from the nesting ring).
    if (state.selected === id) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(pos.x));
      dot.setAttribute("cy", String(pos.y));
      dot.setAttribute("r", String(r * 0.4));
      dot.setAttribute("fill", "var(--accent)");
      dot.setAttribute("pointer-events", "none");
      svg.appendChild(dot);
    }

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(pos.x));
    label.setAttribute("y", String(pos.y + 34));
    label.setAttribute("class", `node-label${drillable ? " drillable" : ""}`);
    const displayName = nodeDisplayName(node);
    label.textContent = displayName.length > 14 ? `${displayName.slice(0, 13)}…` : displayName;
    label.addEventListener("click", handleNodeClick);
    if (drillable) {
      label.addEventListener("mouseenter", handleNodeEnter);
      label.addEventListener("mouseleave", scheduleHideFlyout);
    }
    svg.appendChild(label);
  }
}
