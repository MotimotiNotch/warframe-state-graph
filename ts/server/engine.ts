// Port of pkg/engine/engine.go — the cascade/resolve semantics that are the
// conceptual core of the app. CODEOWNERS-protects pkg/engine + pkg/model in
// the Go repo (required review, no direct-to-main push); once this file
// exists it should get the same protection (see migration plan guardrails —
// noted here as a to-do, not applied by this port itself).

import type { Graph, Node, NodeState } from "./model.ts";

/**
 * Recursively resolves a node's fulfillment state. requires empty, or all
 * SATISFIED, → ACTIONABLE. A cycle is treated as BLOCKED rather than
 * recursing forever.
 */
export function resolveState(
  g: Graph,
  nodeId: string,
  stack: ReadonlySet<string> = new Set(),
): NodeState {
  const node = g.nodes[nodeId];
  if (!node) return "BLOCKED";
  if (node.satisfied) return "SATISFIED";
  if (stack.has(nodeId)) return "BLOCKED"; // cycle guard
  if (node.requires.length === 0) return "ACTIONABLE";

  const next = new Set(stack);
  next.add(nodeId);

  for (const reqId of node.requires) {
    if (resolveState(g, reqId, next) !== "SATISFIED") return "BLOCKED";
  }
  return "ACTIONABLE";
}

/**
 * When a node becomes satisfied, walks its `requires` chain backward and
 * marks everything in it satisfied too — "if the later step is done, the
 * earlier steps it required must already be done" (e.g. completing Natah
 * implies The War Within and Saya's Vigil are already done).
 *
 * `contains` carries no such implication (a build being satisfied doesn't
 * mean its parts are — that's the flat-DAG design behind the progress
 * ring), so it is not walked here.
 */
export function cascadeSatisfyRequires(g: Graph, nodeId: string, seen: Set<string> = new Set()): void {
  if (seen.has(nodeId)) return;
  seen.add(nodeId);

  const node = g.nodes[nodeId];
  if (!node) return;
  for (const reqId of node.requires) {
    const reqNode = g.nodes[reqId];
    if (reqNode) {
      reqNode.satisfied = true;
      cascadeSatisfyRequires(g, reqId, seen);
    }
  }
}

/**
 * The reverse walk of {@link cascadeSatisfyRequires}. When a node reverts to
 * unsatisfied, every node that lists it in `requires` (its downstream
 * dependents) reverts too, recursively — "if the prerequisite no longer
 * holds, anything built on top of it wasn't really done either" (e.g.
 * un-completing Natah reverts Steel Path access that required it).
 *
 * The prerequisite side is left untouched — un-completing Natah doesn't
 * erase the fact The War Within was finished.
 */
export function cascadeUnsatisfyDependents(g: Graph, nodeId: string, seen: Set<string> = new Set()): void {
  if (seen.has(nodeId)) return;
  seen.add(nodeId);

  for (const [id, node] of Object.entries(g.nodes)) {
    if (node.requires.includes(nodeId)) {
      node.satisfied = false;
      cascadeUnsatisfyDependents(g, id, seen);
    }
  }
}

/**
 * Recursively walks both `contains` and `requires` from nodeId and collects
 * every related node id (not including nodeId itself). Walking `contains`
 * alone drops real Next Actions (e.g. a syndicate-rank requirement) from the
 * report — a gap found while building the original Obsidian prototype — so
 * both edge kinds are combined here.
 */
export function collectMembers(g: Graph, nodeId: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(nodeId)) return [];
  seen.add(nodeId);

  const node = g.nodes[nodeId];
  if (!node) return [];

  const members = [nodeId];
  for (const childId of [...node.contains, ...node.requires]) {
    members.push(...collectMembers(g, childId, seen));
  }
  return members;
}

/** A node's own fields plus its computed state, for the frontend to draw
 * layout/edges from one fetch without reimplementing traversal. */
export interface NodeView extends Node {
  state: NodeState;
}

export interface Progress {
  done: number;
  total: number;
}

export interface NextActionReport {
  buildId: string;
  progress: Progress;
  actionable: string[];
  blocked: string[];
  satisfied: string[];
  /** Every member node's view, including buildId itself. */
  nodes: Record<string, NodeView>;
}

/** Classifies every node related to buildId (via collectMembers) into
 * ACTIONABLE/BLOCKED/SATISFIED and returns a report the frontend renders
 * from directly. */
export function deriveNextActions(g: Graph, buildId: string): NextActionReport {
  const members = collectMembers(g, buildId, new Set());

  const report: NextActionReport = {
    buildId,
    progress: { done: 0, total: 0 },
    actionable: [],
    blocked: [],
    satisfied: [],
    nodes: {},
  };

  const buildNode = g.nodes[buildId];
  if (buildNode) {
    // The root is always shown as satisfied ("起点"/origin), regardless of
    // its own `satisfied` field — matches the Go original exactly.
    report.nodes[buildId] = { ...buildNode, state: "SATISFIED" };
  }

  for (const id of members) {
    if (id === buildId) continue;
    const node = g.nodes[id];
    // collectMembers only ever adds ids that resolved to a real node, so
    // this is unreachable in practice — kept only to satisfy
    // noUncheckedIndexedAccess.
    if (!node) continue;
    const state = resolveState(g, id, new Set());
    report.nodes[id] = { ...node, state };

    switch (state) {
      case "SATISFIED":
        report.satisfied.push(id);
        break;
      case "ACTIONABLE":
        report.actionable.push(id);
        break;
      default:
        report.blocked.push(id);
        break;
    }
  }

  report.progress = {
    done: report.satisfied.length,
    total: report.satisfied.length + report.actionable.length + report.blocked.length,
  };
  return report;
}
