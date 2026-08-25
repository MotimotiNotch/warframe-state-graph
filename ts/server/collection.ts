// Port of pkg/collection. An "acquisition log" independent of Chain View
// (dependency graph) and Loadouts (MOD config) — for individually-rolled
// items like Riven/Kuva-line weapons that don't belong mixed into the node
// graph. Loosely (optionally) linked to a Chain View node by id, same
// pattern as Loadouts.BuildSet<->Chain View.

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

// Theoretical stat-range calculation is out of scope (item 2) — this only
// records "what actually rolled on this one" and "does it still need re-rolling".
export const RivenEntrySchema = z.object({
  id: z.string().min(1),
  weaponName: z.string().min(1),
  positiveStats: z.array(z.string()).default([]),
  // Same index as positiveStats (the rolled numeric value, e.g. 150.5 for a
  // %-stat). Still not a theoretical-range calculation — just "what rolled
  // on this one", added 2026-08-20 for the card text export.
  positiveValues: z.array(z.number()).optional(),
  negativeStat: z.string().optional(),
  negativeValue: z.number().optional(),
  // "Finished, doesn't need re-rolling." false = "still needs rolling" (a
  // deliberate 2-value field, no in-between state, per explicit request).
  fixed: z.boolean().default(false),
  // "Actually in use in the current build / high priority" — a subjective
  // marker fully independent of fixed (objective roll completeness); every
  // combination of the two is valid.
  favorite: z.boolean().default(false),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type RivenEntry = z.infer<typeof RivenEntrySchema>;

export const KuvaKind = z.enum(["Kuva", "Tenet", "Coda"]);
export type KuvaKind = z.infer<typeof KuvaKind>;

export const KuvaEntrySchema = z.object({
  id: z.string().min(1),
  weaponName: z.string().min(1),
  kind: KuvaKind.optional(),
  owned: z.boolean().default(false),
  // "Which of several copies of the same weapon is the real one" (e.g.
  // Valence Fusion target) — a subjective marker, independent per copy since
  // same-named weapons each get their own entry.
  favorite: z.boolean().default(false),
  // The elemental bonus granted on Lich conversion (e.g. stat name "Cold" +
  // value 58). The stat kind is determined by the converting Warframe (not
  // random), but the value itself is a per-individual random roll, not
  // derivable from WFCD static data — a manual-entry field. Kept as a
  // separate stat/value pair like Riven.negativeStat/negativeValue
  // (2026-08-23, split from a single "+58% Cold Damage" string).
  bonusStat: z.string().optional(),
  bonusValue: z.number().optional(),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type KuvaEntry = z.infer<typeof KuvaEntrySchema>;

// FrameEntry-shaped minimal record. Not full-roster inventory — only
// register frames you actually care about (Riven/Kuva pattern, 2026-08-19).
export const FrameEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // picked from WFCD Warframes.json
  owned: z.boolean().default(false),
  // "This individual has reached Rank 30." Deliberately not called
  // "mastered" — that would clash with MasteryTrack (the separate Gild
  // concept for Zaw/Kitgun/Amp etc.), so "ranked 30" is used explicitly
  // (2026-08-19 finding, owner-specified).
  rankedThirty: z.boolean().default(false),
  // "This frame was fed to Helminth" (the consuming side). The receiving
  // side (which ability was transplanted where) lives in Loadouts.Item.note instead.
  helminthFed: z.boolean().default(false),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type FrameEntry = z.infer<typeof FrameEntrySchema>;

// WeaponEntry/CompanionEntry/ArchwingEntry/NecramechEntry are all the same
// FrameEntry-shaped minimal record (2026-08-25, item 27) — the cross-page
// auto-link target (Loadouts-originated = force-registered owned:true,
// Chain-View-originated = force-registered owned:false; either way same-name
// reuses the existing entry). Structured fields stay to the minimum needed
// for cross-linking/dedup/aggregation; anything more specific goes in note
// rather than a dedicated field (a deliberate "don't record everything" call).
// Kuva/Tenet/Coda weapons remain KuvaEntry's job (multiple per-individual
// entries allowed) and are out of scope here.

export const WeaponEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // picked from WFCD Primary/Secondary/Melee.json
  owned: z.boolean().default(false),
  rankedThirty: z.boolean().default(false),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type WeaponEntry = z.infer<typeof WeaponEntrySchema>;

export const CompanionEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // picked from WFCD Pets.json
  owned: z.boolean().default(false),
  rankedThirty: z.boolean().default(false),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type CompanionEntry = z.infer<typeof CompanionEntrySchema>;

export const ArchwingEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owned: z.boolean().default(false),
  rankedThirty: z.boolean().default(false),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type ArchwingEntry = z.infer<typeof ArchwingEntrySchema>;

export const NecramechEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owned: z.boolean().default(false),
  rankedThirty: z.boolean().default(false),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type NecramechEntry = z.infer<typeof NecramechEntrySchema>;

// Incarnon-capable weapon progress, one entry per weapon (register-only,
// same as Riven/Kuva/Frame — 2026-08-22 re-re-correction: an earlier
// place-centric "obtained/completed" aggregate over Duviri was abandoned
// after confirming neither WFCD source lists Circuit-eligible Incarnon
// weapons, so no denominator exists to aggregate against). Duviri-proper
// story clear state (Lone Story, Orowyrm defeat, etc.) is out of this tool's scope.
export const IncarnonEntrySchema = z.object({
  id: z.string().min(1),
  weaponName: z.string().min(1), // picked from WFCD Primary/Secondary/Melee.json
  // "Incarnon obtained" — the Genesis adapter acquired via Duviri Circuit.
  obtained: z.boolean().default(false),
  // "Incarnon completed" — evolution challenges finished after equipping the
  // adapter, unlocking the actual Incarnon form. obtained:false + completed:true
  // shouldn't happen in-game but, like Riven.fixed, the UI doesn't enforce it.
  completed: z.boolean().default(false),
  note: z.string().optional(),
  chainViewNodeId: z.string().optional(),
});
export type IncarnonEntry = z.infer<typeof IncarnonEntrySchema>;

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  rivens: z.record(z.string(), RivenEntrySchema).default({}),
  kuva: z.record(z.string(), KuvaEntrySchema).default({}),
  frames: z.record(z.string(), FrameEntrySchema).default({}),
  weapons: z.record(z.string(), WeaponEntrySchema).default({}),
  companions: z.record(z.string(), CompanionEntrySchema).default({}),
  archwings: z.record(z.string(), ArchwingEntrySchema).default({}),
  necramechs: z.record(z.string(), NecramechEntrySchema).default({}),
  incarnons: z.record(z.string(), IncarnonEntrySchema).default({}),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rivens: {},
    kuva: {},
    frames: {},
    weapons: {},
    companions: {},
    archwings: {},
    necramechs: {},
    incarnons: {},
  };
}

// Same design as pkg/loadout (single JSON file, mutex-serialized). A
// separate file since it's a separate concept.
export class CollectionStore {
  readonly #path: string;
  readonly #mutex = new AsyncMutex();

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<Data> {
    return this.#mutex.run(() => this.#loadLocked());
  }

  async #loadLocked(): Promise<Data> {
    try {
      return await loadJSON(this.#path, DataSchema);
    } catch (err) {
      if (err instanceof NotFoundError) return newData();
      throw err;
    }
  }

  async #saveLocked(d: Data): Promise<void> {
    d.schemaVersion = CURRENT_SCHEMA_VERSION;
    await saveJSON(this.#path, d);
  }

  async upsertRiven(entry: RivenEntry): Promise<RivenEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.rivens[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteRiven(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.rivens[id];
      await this.#saveLocked(d);
    });
  }

  async upsertKuva(entry: KuvaEntry): Promise<KuvaEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.kuva[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteKuva(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.kuva[id];
      await this.#saveLocked(d);
    });
  }

  async upsertFrame(entry: FrameEntry): Promise<FrameEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.frames[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteFrame(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.frames[id];
      await this.#saveLocked(d);
    });
  }

  async upsertWeapon(entry: WeaponEntry): Promise<WeaponEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.weapons[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteWeapon(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.weapons[id];
      await this.#saveLocked(d);
    });
  }

  async upsertCompanion(entry: CompanionEntry): Promise<CompanionEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.companions[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteCompanion(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.companions[id];
      await this.#saveLocked(d);
    });
  }

  async upsertArchwing(entry: ArchwingEntry): Promise<ArchwingEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.archwings[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteArchwing(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.archwings[id];
      await this.#saveLocked(d);
    });
  }

  async upsertNecramech(entry: NecramechEntry): Promise<NecramechEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.necramechs[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteNecramech(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.necramechs[id];
      await this.#saveLocked(d);
    });
  }

  async upsertIncarnon(entry: IncarnonEntry): Promise<IncarnonEntry> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.incarnons[entry.id] = entry;
      await this.#saveLocked(d);
      return entry;
    });
  }
  async deleteIncarnon(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.incarnons[id];
      await this.#saveLocked(d);
    });
  }
}
