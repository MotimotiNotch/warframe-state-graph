// Port of pkg/standing. Current rank (not a one-way toggle — the 6 major
// syndicates have hostile-pair factions and can be demoted to Rank -2) for
// all 16 syndicates (everything except Conclave/Cephalon Simaris). See the
// original Go package doc comment (pkg/standing/model.go) for the full
// research trail (faction hostility mechanics, per-syndicate sourcing) —
// mechanically copied here, not re-derived, per the migration plan's
// "standing data is settled wiki research, don't reinterpret it" guardrail.

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

export const Faction = z.enum(["left", "right", "none"]);
export type Faction = z.infer<typeof Faction>;

export const RankSacrificeSchema = z.object({
  items: z.array(z.string()).optional(),
  none: z.boolean().optional(),
  unconfirmed: z.boolean().optional(),
});
export type RankSacrifice = z.infer<typeof RankSacrificeSchema>;

export const SyndicateInfoSchema = z.object({
  name: z.string(),
  faction: Faction,
  ranks: z.array(z.string()),
  sacrifices: z.array(RankSacrificeSchema),
  note: z.string().optional(),
});
export type SyndicateInfo = z.infer<typeof SyndicateInfoSchema>;

/** -2 for the two hostile-pair factions (can be demoted below Neutral), 0 for everything else. */
export function minRank(s: SyndicateInfo): number {
  return s.faction === "left" || s.faction === "right" ? -2 : 0;
}
export function maxRank(s: SyndicateInfo): number {
  return s.ranks.length;
}

function sac(...items: string[]): RankSacrifice {
  return { items };
}
const noSacrifice: RankSacrifice = { none: true };

export const MAJOR_SYNDICATES: SyndicateInfo[] = [
  {
    name: "Steel Meridian",
    faction: "left",
    ranks: ["Brave", "Valiant", "Defender", "Protector", "General"],
    sacrifices: [sac("Morphics×2"), sac("Forma×1"), sac("Orokin Catalyst×1"), sac("Aya×2"), sac("Aya×3")],
  },
  {
    name: "Arbiters of Hexis",
    faction: "left",
    ranks: ["Principled", "Authentic", "Lawful", "Crusader", "Maxim"],
    sacrifices: [sac("Gallium×2"), sac("Forma×1"), sac("Orokin Reactor×1"), sac("Aya×2"), sac("Aya×3")],
  },
  {
    name: "Cephalon Suda",
    faction: "left",
    ranks: ["Competent", "Intriguing", "Intelligent", "Wise", "Genius"],
    sacrifices: [sac("Control Module×2"), sac("Forma×1"), sac("Orokin Catalyst×1"), sac("Aya×2"), sac("Aya×3")],
  },
  {
    name: "Red Veil",
    faction: "right",
    ranks: ["Respected", "Honored", "Esteemed", "Revered", "Exalted"],
    sacrifices: [sac("Gallium×2"), sac("Forma×1"), sac("Orokin Catalyst×1"), sac("Aya×2"), sac("Aya×3")],
  },
  {
    name: "The Perrin Sequence",
    faction: "right",
    ranks: ["Associate", "Senior Associate", "Executive", "Senior Executive", "Partner"],
    sacrifices: [sac("Detonite Ampule×2"), sac("Forma×1"), sac("Orokin Reactor×1"), sac("Aya×2"), sac("Aya×3")],
  },
  {
    name: "New Loka",
    faction: "right",
    ranks: ["Humane", "Bountiful", "Benevolent", "Pure", "Flawless"],
    sacrifices: [sac("Fieldron Sample×2"), sac("Forma×1"), sac("Orokin Reactor×1"), sac("Aya×2"), sac("Aya×3")],
  },
];

export const EXTENDED_SYNDICATES: SyndicateInfo[] = [
  {
    name: "Ostron",
    faction: "none",
    ranks: ["Offworlder", "Visitor", "Trusted", "Surah", "Kin"],
    sacrifices: [
      sac("Nistlepod×25", "Iradite×25", "Grokdrul×25"),
      sac("Tear Azurite×10", "Pyrol×40", "Fish Scales×60"),
      sac("Cetus Wisp×1", "Maprico×5"),
      sac("Maprico×10", "Fersteel Alloy×40", "Murkray Liver×5"),
      sac("Nyth×1", "Sentirum×1", "Norg Brain×1", "Cuthol Tendrils×1"),
    ],
  },
  {
    name: "Solaris United",
    faction: "none",
    ranks: ["Outworlder", "Rapscallion", "Doer", "Cove", "Old Mate"],
    sacrifices: [
      sac("Training Debt-Bond×2"),
      sac("Training Debt-Bond×2", "Shelter Debt-Bond×3"),
      sac("Training Debt-Bond×2", "Shelter Debt-Bond×3", "Medical Debt-Bond×4"),
      sac("Shelter Debt-Bond×3", "Medical Debt-Bond×4", "Advances Debt-Bond×5"),
      sac("Medical Debt-Bond×3", "Advances Debt-Bond×5", "Familial Debt-Bond×5"),
    ],
    note: "1ランクにつき複数種の負債証書(Debt-Bond)を同時消費する。公式Wiki（wiki.warframe.com/w/Debt-Bond）のランク別テーブルに各証書種別の合計行（Training6/Shelter9/Medical11/Advances10/Familial5）が付記されており、ここに掲載した各ランクの個数を合算するとその合計と一致することを確認済み（2026-08-22、WebFetch調査でその場での新規消費量と確定）",
  },
  {
    name: "Vox Solaris",
    faction: "none",
    ranks: ["Operative", "Agent", "Hand", "Instrument", "Shadow"],
    sacrifices: [
      sac("Calda Toroid×1", "Vega Toroid×1", "Sola Toroid×1"),
      sac("Gyromag Systems×1", "Vega Toroid×1"),
      sac("Atmo Systems×1", "Calda Toroid×1"),
      sac("Repeller Systems×1", "Sola Toroid×1"),
      sac("Crisma Toroid×1"),
    ],
  },
  {
    name: "Ventkids",
    faction: "none",
    ranks: ["Glinty", "Whozit", "Proper Felon", "Primo", "Logical"],
    sacrifices: [noSacrifice, noSacrifice, noSacrifice, noSacrifice, noSacrifice],
    note: "貢献アイテムを消費しない。K-Driveのトリック/レースで稼いだStandingのみで昇格する",
  },
  {
    name: "Entrati",
    faction: "none",
    ranks: ["Stranger", "Acquaintance", "Associate", "Friend", "Family"],
    sacrifices: [
      sac("Benign Infested Tumor×6", "Ferment Bladder×6"),
      sac("Keratinos Blade Blueprint×1", "Father Token×1", "Daughter Token×1"),
      sac("Sly Vulpaphyla Tag×3", "Vizier Predasite Tag×3", "Mother Token×1", "Son Token×1"),
      sac("Zarim Mutagen Blueprint×1", "Arioli Mutagen Blueprint×1", "Father Token×1", "Son Token×1"),
      sac("Seriglass Shard×1", "Mother Token×1", "Father Token×1"),
    ],
  },
  {
    name: "Necraloid",
    faction: "none",
    ranks: ["Clearance: Agnesis", "Clearance: Modus", "Clearance: Odima"],
    sacrifices: [
      sac("Orokin Orientation Matrix×10", "Void Traces×150", "Zymos Barrel Blueprint×1", "Father Token×20"),
      sac("Orokin Ballistics Matrix×15", "Void Traces×250", "Sepulcrum Barrel Blueprint×1", "Father Token×20"),
      sac("Orokin Animus Matrix×15", "Void Traces×350", "Trumna Barrel Blueprint×1", "Father Token×20"),
    ],
    note: "Orokinマトリクス自体もStandingを付与する特殊なアイテム",
  },
  {
    name: "Kahl's Garrison",
    faction: "none",
    ranks: ["Shelter", "Encampment", "Fort", "Settlement", "Home"],
    sacrifices: [noSacrifice, noSacrifice, noSacrifice, noSacrifice, noSacrifice],
    note: "Standingという概念自体を使わない。週次ミッション「Kahl's Break」の完了で自動的にランクが進む（シンジケート端末にも表示されない）",
  },
  {
    name: "Operational Supply",
    faction: "none",
    ranks: ["Collaborator", "Defender", "Champion"],
    sacrifices: [sac("Grokdrul×10"), sac("Iradite×10"), sac("Nistlepod×10")],
    note: "Operation: Plague Star開催期間中のみ有効なイベント専用シンジケート",
  },
  {
    name: "The Holdfasts",
    faction: "none",
    ranks: ["Fallen", "Watcher", "Guardian", "Seraph", "Angel"],
    sacrifices: [
      sac("Voidplume Down×5", "Ferrite×2000", "Alloy Plate×2000"),
      sac("Voidplume Vane×10", "Voidgel Orb×10", "Alloy Plate×5000"),
      sac("Voidplume Crest×10", "Entrati Lanthorn×10", "Ferrite×5000"),
      sac("Voidplume Quill×15", "Thrax Plasm×60", "Voidgel Orb×40"),
      sac("Voidplume Pinion×5", "Thrax Plasm×90", "Entrati Lanthorn×20"),
    ],
  },
  {
    name: "The Quills",
    faction: "none",
    ranks: ["Mote", "Observer", "Adherent", "Instrument", "Architect"],
    sacrifices: [
      sac("Intact Sentient Core×10"),
      sac("Intact Sentient Core×20"),
      sac("Eidolon Shard×10"),
      sac("Eidolon Shard×20"),
      sac("Eidolon Shard×30"),
    ],
  },
];

export const ALL_SYNDICATES: SyndicateInfo[] = [...MAJOR_SYNDICATES, ...EXTENDED_SYNDICATES];

export function findSyndicate(name: string): SyndicateInfo | undefined {
  return ALL_SYNDICATES.find((s) => s.name === name);
}

/** Items needed to recover from a negative rank back to Neutral (0) — always
 * equal to the Rank-3 sacrifice, per the pattern found in 3 real data points
 * (see pkg/standing's doc comment). Empty for non-hostile syndicates. */
export function recoverySacrifice(syndicateName: string): RankSacrifice {
  const s = findSyndicate(syndicateName);
  if (!s || (s.faction !== "left" && s.faction !== "right") || s.sacrifices.length < 3) {
    return {};
  }
  return s.sacrifices[2]!;
}

export function rankLabel(syndicateName: string, rank: number): string {
  if (rank === 0) return "Neutral (Rank 0)";
  if (rank < 0) return `敵対 (Rank ${rank})`;
  const s = findSyndicate(syndicateName);
  if (s && rank >= 1 && rank <= s.ranks.length) return `${s.ranks[rank - 1]} (Rank ${rank})`;
  return `Rank ${rank}`;
}

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  ranks: z.record(z.string(), z.number()).default({}),
  highestRankReached: z.record(z.string(), z.number()).default({}),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  const d: Data = { schemaVersion: CURRENT_SCHEMA_VERSION, ranks: {}, highestRankReached: {} };
  for (const s of ALL_SYNDICATES) {
    d.ranks[s.name] = 0;
    d.highestRankReached[s.name] = 0;
  }
  return d;
}

export class StandingStore {
  readonly #path: string;
  readonly #mutex = new AsyncMutex();

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<Data> {
    return this.#mutex.run(() => this.#loadLocked());
  }

  async #loadLocked(): Promise<Data> {
    let d: Data;
    try {
      d = await loadJSON(this.#path, DataSchema);
    } catch (err) {
      if (err instanceof NotFoundError) return newData();
      throw err;
    }
    // A syndicate absent from `ranks` (new file, or a syndicate added since
    // this file was written — the 16-syndicate expansion added 10) starts
    // Neutral. A syndicate absent from `highestRankReached` (pre-this-field
    // legacy file, or newly added) migrates its achievement from the
    // current rank, clamped at 0 (a negative rank is not an achievement) —
    // a one-time backfill so upgrading doesn't erase progress.
    for (const s of ALL_SYNDICATES) {
      if (!(s.name in d.ranks)) d.ranks[s.name] = 0;
      if (!(s.name in d.highestRankReached)) {
        d.highestRankReached[s.name] = Math.max(0, d.ranks[s.name] ?? 0);
      }
    }
    return d;
  }

  async #saveLocked(d: Data): Promise<void> {
    d.schemaVersion = CURRENT_SCHEMA_VERSION;
    await saveJSON(this.#path, d);
  }

  /** Sets the current rank for one syndicate (no clamping — the caller/HTTP
   * boundary validates range) and bumps `highestRankReached` up if this is a
   * new high (never down; achievement is one-way). */
  async setRank(syndicateName: string, rank: number): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.ranks[syndicateName] = rank;
      if (rank > (d.highestRankReached[syndicateName] ?? 0)) {
        d.highestRankReached[syndicateName] = rank;
      }
      await this.#saveLocked(d);
      return d;
    });
  }

  /** Directly overwrites the achievement value (manual correction — unlike
   * setRank, this can move it down). */
  async setHighestRankReached(syndicateName: string, rank: number): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.highestRankReached[syndicateName] = rank;
      await this.#saveLocked(d);
      return d;
    });
  }
}
