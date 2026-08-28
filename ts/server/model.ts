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
  // どのカテゴリにも当てはまらないアイテム用の汎用種別（のっち依頼、2026-08-28）。
  "Other",
]);
export type NodeType = z.infer<typeof NodeType>;

export const NodeState = z.enum(["SATISFIED", "ACTIONABLE", "BLOCKED"]);
export type NodeState = z.infer<typeof NodeState>;

// Shared {id, label, value} counter shape — originally scratch.ts-only (the
// page-independent quick-memo widget), promoted here once Node also needed
// per-node count-up counters (2026-08-27, Chain View Inspector "メモ"/
// "カウントアップ" section matching quick memo's look). scratch.ts imports
// this instead of defining its own copy.
export const CounterSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
});
export type Counter = z.infer<typeof CounterSchema>;

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
  priority: z.number().optional(),
  // Free-form note. `evaluation` (a second, near-duplicate freeform field)
  // was folded into this one 2026-08-27 — same "don't keep two overlapping
  // freeform fields" call as Loadouts' HelminthNote -> Note consolidation
  // (2026-08-20). Existing data was migrated in place (evaluation text
  // prepended into note, evaluation key dropped) via a one-off script run
  // directly against data/graph.json, not a lazy-migration-on-read path.
  note: z.string().optional(),
  // Per-node count-up counters (2026-08-27), same shape/semantics as
  // scratch.ts's page-independent ones — e.g. "Forma回数"/"討伐回数" tracked
  // against this specific node instead of the global scratchpad. Optional
  // like note/masteryTrack (not a `.default([])`, unlike
  // requires/contains) — most nodes have none, and a `.default` would make
  // every existing node-literal construction site (tests, wfcdgen.ts, dsl.ts)
  // list it explicitly for no runtime benefit. Consumers read `node.counters
  // ?? []`.
  counters: z.array(CounterSchema).optional(),
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
  // Archived (2026-08-27): hides a Build/Goal from the Chain View build-select
  // dropdown without deleting it (deleteNode strips requires/contains
  // references from every other node — a real Build the owner still wants as
  // a reference shouldn't pay that cost just to declutter the picker). Not
  // meaningful on non-Build/Goal nodes; nothing currently reads it for them.
  archived: z.boolean().optional(),
  // Loose optional reference to a folder.ts Folder id — which group this
  // Build/Goal shows under in the left-sidebar explorer panel (2026-08-27).
  // Same "loose id reference, no referential integrity enforced" pattern as
  // Loadouts/Collections' chainViewNodeId — a folder can be deleted out from
  // under this without touching Node (store.ts's clearFolderFromNodes()
  // handles that side). Absent/unset means "unfiled" (未分類). Not
  // meaningful on non-Build/Goal nodes.
  folderId: z.string().optional(),
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
