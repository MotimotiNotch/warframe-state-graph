// Port of pkg/wfcdgen. Builds Chain View node candidates from raw WFCD item
// data (pkg/wfcd). Deliberately scoped to "suggest candidates, human picks"
// rather than "auto-confirm" (item 10) — part->relic in particular is an OR
// relationship (any one candidate is enough) with several options, so this
// package only presents choices; the caller adds exactly one chosen relic to
// `requires` (the existing AND-premised engine package needs no change).

import type { Node, NodeType } from "./model.ts";
import { MainQuestNames, Prerequisites, ResolveChain, Slug as questchainSlug } from "./questchain.ts";
import type { Item, SyndicateEntry } from "./wfcd.ts";
import { findSyndicateWeaponRank, isRelicVaulted, CategoryPets, RELIC_ERA_PREFIX } from "./wfcd.ts";

export type Paradigm =
  | "single-blueprint" // (1) blueprint-only
  | "multi-part" // (2) multi-part (Prime weapons/frames/archwings etc.)
  | "modular" // (3) freely-assembled modular (Zaw/Kitgun/Amp/Moa/Hound/K-Drive)
  | "instant" // (4) instant-complete (no components)
  | "frame-associated" // (5) frame-tied (Exalted Weapon/Venari)
  | "breeding" // (6) DNA/breeding (Kubrow/Kavat etc.)
  // quest-chain is a 7th paradigm used only for quests — a different axis
  // (prerequisite chaining) from the equipment-acquisition-structure
  // classification, but reuses the Suggestion type below.
  | "quest-chain";

// Misc.json `type` values classified as (3) modular.
const MODULAR_TYPES = new Set(["Zaw Component", "Kitgun Component", "Amp"]);

/** A simple heuristic from components/type/category alone (accurate
 * classification would need extra info like Foundry recipe presence) — the
 * human reviewing candidates before import is expected to compensate for
 * any misclassification. */
export function classifyParadigm(item: Item): Paradigm {
  if (item.type && MODULAR_TYPES.has(item.type)) return "modular";
  if (!item.components || item.components.length === 0) {
    if (item.category === CategoryPets) return "breeding";
    return "instant";
  }
  // 2+ components each with their own distinct drop source implies
  // "each part is separately acquired" (multi-part). A single blueprint +
  // generic materials (crafting materials usually carry no drops of their
  // own) stays (1) single-blueprint.
  const partsWithOwnDrop = item.components.filter((c) => c.drops && c.drops.length > 0).length;
  if (partsWithOwnDrop >= 2) return "multi-part";
  return "single-blueprint";
}

// Verified as the only ~100%-reliable identification method (name-prefix match).
const RICH_LICH_PREFIXES = ["Kuva ", "Tenet ", "Coda "];

export function detectRichLich(name: string): { kind: string; ok: boolean } {
  for (const p of RICH_LICH_PREFIXES) {
    if (name.startsWith(p)) return { kind: p.trim(), ok: true };
  }
  return { kind: "", ok: false };
}

export type Archetype = "Crit" | "Status" | "Hybrid" | "Utility";

// Thresholds are the common community rule-of-thumb (e.g. 25%+ crit chance
// counts as a "crit weapon"), not an official DE definition — item 2 scoped
// this to "archetype classification," not "which combo is theoretically
// optimal," so a rule-of-thumb suffices.
const CRIT_CHANCE_THRESHOLD = 0.25;
const PROC_CHANCE_THRESHOLD = 0.25;

export function detectArchetype(item: Item): Archetype {
  const crit = (item.criticalChance ?? 0) >= CRIT_CHANCE_THRESHOLD;
  const status = (item.procChance ?? 0) >= PROC_CHANCE_THRESHOLD;
  if (crit && status) return "Hybrid";
  if (crit) return "Crit";
  if (status) return "Status";
  return "Utility";
}

// Which archetype each Riven positive stat name belongs to.
const RIVEN_STAT_ARCHETYPE: Record<string, Archetype> = {
  "Critical Chance": "Crit",
  "Critical Damage": "Crit",
  "Status Chance": "Status",
  "Status Duration": "Status",
  Multishot: "Hybrid", // contributes to both archetypes, so it matches either
  Damage: "Hybrid",
};

/** Selectable positive-stat names for the Riven input UI. Includes the
 * archetype-matching stats above plus other commonly-rolled stats (the
 * latter are neutral — they never affect the match verdict). */
export const RivenStatChoices = [
  "Critical Chance",
  "Critical Damage",
  "Status Chance",
  "Status Duration",
  "Multishot",
  "Damage",
  "Fire Rate",
  "Reload Speed",
  "Punch Through",
  "Range",
  "Magazine Capacity",
  "Recoil",
];

export interface RivenCheck {
  archetype: Archetype;
  matches: boolean;
  matchedStats?: string[];
}

/** Whether a Riven's positive stats line up with the weapon's archetype —
 * per item 2's confirmed scope this is a showcase match indicator only, not
 * a precise theoretical-range calculation. */
export function checkRiven(item: Item, positiveStats: string[]): RivenCheck {
  const archetype = detectArchetype(item);
  const matched: string[] = [];
  for (const stat of positiveStats) {
    const a = RIVEN_STAT_ARCHETYPE[stat];
    if (a && (a === archetype || a === "Hybrid")) matched.push(stat);
  }
  return { archetype, matches: matched.length > 0, matchedStats: matched.length ? matched : undefined };
}

const SLUG_PATTERN = /[^a-z0-9]+/g;

/** "Ash Prime Neuroptics" -> "ash-prime-neuroptics", matching the existing
 * data/graph.json naming convention. */
export function Slug(name: string): string {
  const s = name.toLowerCase().replace(SLUG_PATTERN, "-");
  return s.replace(/^-+|-+$/g, "");
}

// WFCD's Component.Drops.Location mixes relic-sourced strings (e.g. "Void
// Relic (Axi B1) (25.33%)") with plain-mission-sourced ones (e.g.
// "Pluto/Fenton's Field (Skirmish), Rotation A"). When isRelic is false,
// vaulted is always false (meaningless) — a prior version didn't
// distinguish this and called isRelicVaulted on non-relic strings too,
// mislabeling plain-mission drops as "Vaulted" just because they weren't in
// the active-relics list (found 2026-08-23 from a real frame's "this text
// looks wrong" report).
export interface RelicCandidate {
  name: string;
  chance: number;
  isRelic: boolean;
  vaulted: boolean;
}

export interface PartSuggestion {
  node: Node;
  relicCandidates?: RelicCandidate[];
}

export interface SyndicateRankSuggestion {
  node: Node; // e.g. id="red-veil-exalted", name="Red Veil - Exalted"
  standing: number; // purchase cost at that rank, not cumulative standing to reach it
}

export interface Suggestion {
  paradigm: Paradigm;
  richLich?: string;
  archetype?: Archetype;

  root: Node; // the Build/Weapon/Frame node itself, or the quest's own starting node
  parts?: PartSuggestion[]; // only for (2) multi-part

  // Only set for paradigm "quest-chain": every node from the earliest
  // prerequisite through root (root included, no duplicates). Each node's
  // requires is already set to its prerequisite's node id (questchain's Slug convention).
  questChain?: Node[];

  // Only set for a syndicate weapon (Vaykor/Secura/Rakta/Synoid/Telos/Sancti
  // etc.). Not auto-added to root.requires (same as parts — the human
  // confirms at import time, per item 10's "suggest, don't auto-confirm" policy).
  syndicateRank?: SyndicateRankSuggestion;
}

// Loosely matches a relic name inside a Drop.Location (e.g. pulls "Axi A22"
// out of "Void Relic (Axi A22) (25.33%)"). WFCD's location format can shift
// between versions, so this partial-matches rather than parsing strictly. No
// match means the drop isn't relic-sourced (plain mission/assassination
// drop) — returning isRelic=false here matters (see RelicCandidate's comment above).
// Built from wfcd.ts's RELIC_ERA_PREFIX (not a second hardcoded era list) —
// see that constant's comment for why (2026-08-27, the Vanguard fix).
const RELIC_IN_LOCATION_PATTERN = new RegExp(`(${RELIC_ERA_PREFIX}) [A-Z]\\d{1,2}`);

function extractRelicName(location: string): { name: string; isRelic: boolean } {
  const m = RELIC_IN_LOCATION_PATTERN.exec(location);
  if (m) return { name: m[0], isRelic: true };
  return { name: location, isRelic: false };
}

/** Builds a node-generation suggestion for one item. An empty/undefined
 * activeRelics fixes vault status to false (so a relic-data fetch failure
 * doesn't block the rest of the suggestion). An empty/undefined syndicates
 * skips the syndicate-rank suggestion, same best-effort policy. */
export function BuildSuggestion(
  item: Item,
  nodeType: NodeType,
  activeRelics: Set<string> | undefined,
  syndicates: Record<string, SyndicateEntry[]> | undefined,
): Suggestion {
  const paradigm = classifyParadigm(item);
  const { kind: richLich, ok: hasRichLich } = detectRichLich(item.name);

  const root: Node = {
    id: Slug(item.name),
    name: item.name,
    type: nodeType,
    satisfied: false,
    requires: [],
    contains: [],
    uniqueName: item.uniqueName,
  };

  const sug: Suggestion = { paradigm, root };
  if (hasRichLich) sug.richLich = richLich;
  if (nodeType === "Weapon") {
    sug.archetype = detectArchetype(item);
    if (syndicates) {
      const rank = findSyndicateWeaponRank(syndicates, item.name);
      if (rank) {
        const rankNode: Node = {
          id: `${Slug(rank.syndicate)}-${Slug(rank.rankLabel)}`,
          name: `${rank.syndicate} - ${rank.rankLabel}`,
          type: "Syndicate",
          satisfied: false,
          requires: [],
          contains: [],
        };
        sug.syndicateRank = { node: rankNode, standing: rank.standing };
      }
    }
  }

  if (paradigm !== "multi-part") return sug;

  const parts: PartSuggestion[] = [];
  for (const c of item.components ?? []) {
    const partNode: Node = {
      id: `${root.id}-${Slug(c.name)}`,
      name: c.name,
      type: "Resource",
      satisfied: false,
      requires: [],
      contains: [],
    };
    root.contains!.push(partNode.id);

    const candidates: RelicCandidate[] = [];
    for (const d of c.drops ?? []) {
      const { name, isRelic } = extractRelicName(d.location);
      const cand: RelicCandidate = { name, chance: d.chance, isRelic, vaulted: false };
      if (isRelic) cand.vaulted = activeRelics != null && isRelicVaulted(activeRelics, name);
      candidates.push(cand);
    }
    parts.push({ node: partNode, relicCandidates: candidates.length ? candidates : undefined });
  }
  sug.parts = parts;
  return sug;
}

/** Walks questchain.MainStoryChain from questName and builds the full node
 * set (earliest prerequisite through questName, in order). A quest name not
 * registered in MainStoryChain (a side quest etc.) returns just itself
 * (no prerequisites) — out-of-table quests are treated as "prerequisite unknown". */
export function BuildQuestSuggestion(questName: string): Suggestion {
  const chain = ResolveChain(questName);
  const nodes: Node[] = chain.map((name) => ({
    id: questchainSlug(name),
    name,
    type: "Quest",
    satisfied: false,
    requires: Prerequisites(name).map((pre) => questchainSlug(pre)),
    contains: [],
  }));
  const root = nodes[nodes.length - 1]!; // ResolveChain returns prerequisites-before-subject, so the last entry is the starting quest.
  return { paradigm: "quest-chain", root, questChain: nodes };
}

// Re-exported so callers (main.ts) don't need a separate questchain import
// just for the main-quest-name list used alongside wfcdgen elsewhere.
export { MainQuestNames };
