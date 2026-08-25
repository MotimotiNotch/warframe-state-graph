// Port of pkg/model/model.go. Core Node/Graph types for the flat DAG:
// `requires` (AND-prerequisites, drives state) vs `contains` (display
// grouping only, zero effect on state) — see engine.ts for the semantics.
//
// "Build" stays in the NodeType enum even though 2026-08-25's frontend work
// retired it from new-node creation (folded into "Goal") — existing graph.json
// data still has Build-typed nodes and must keep loading. Do not remove it
// here; that would be relitigating an already-settled decision (see migration
// plan guardrails: port first, don't "improve" while porting).

import { z } from "zod";

export const NodeType = z.enum([
  "Goal",
  "Build",
  "Weapon",
  "Frame",
  "Mod",
  "Riven",
  "Syndicate",
  "Quest",
  "Resource",
  "Relic",
]);
export type NodeType = z.infer<typeof NodeType>;

export const NodeState = z.enum(["SATISFIED", "ACTIONABLE", "BLOCKED"]);
export type NodeState = z.infer<typeof NodeState>;

// Go's `requires`/`contains` fields have no `omitempty` tag, so they can
// appear in JSON as an array, or as `null` (a nil Go slice marshals to
// `null`, not `[]`). Absent (older schema) should also collapse to `[]`.
const stringArray = z.preprocess((v) => v ?? [], z.array(z.string()));

export const NodeSchema = z.object({
  // Go's POST /api/nodes handler rejects empty id/name imperatively at the
  // HTTP boundary; expressing it as a schema constraint here is the same
  // rule in a more natural home for Zod, not a new rule — real graph.json
  // data never has an empty id/name to begin with.
  id: z.string().min(1),
  name: z.string().min(1),
  type: NodeType,
  satisfied: z.boolean().default(false),
  requires: stringArray,
  contains: stringArray,
  evaluation: z.string().optional(),
  priority: z.number().optional(),
  note: z.string().optional(),
  // MasteryTrack marks a node as one of the asymmetric MR-earning parts
  // (Zaw/Kitgun/Amp Strike/Chamber/Prism) — only these show a Gild toggle.
  masteryTrack: z.boolean().optional(),
  // Gilded is independent of `satisfied` (part owned/ranked) — Gilding is a
  // separate step that actually grants the mastery.
  gilded: z.boolean().optional(),
  // uniqueName is the WFCD warframe-items uniqueName path, present only on
  // WFCD-auto-generated nodes, used for i18n/Vault/Resurgence lookups by a
  // stable key instead of fuzzy name matching.
  uniqueName: z.string().optional(),
});
export type Node = z.infer<typeof NodeSchema>;

export const CURRENT_SCHEMA_VERSION = 1;

export const GraphSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  nodes: z.record(z.string(), NodeSchema).default({}),
});
export type Graph = z.infer<typeof GraphSchema>;

export function newGraph(): Graph {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, nodes: {} };
}
