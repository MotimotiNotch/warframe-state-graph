// Port of pkg/loadout. MOD-config tracking (A/B/C slots) for frames/weapons/
// companions/archwings/necramechs, plus BuildSet (a frame + weapons bundle).
// Independent data from graph.json (Chain View) and collections.json
// (Collections) — see each type's field comments for the loose
// (name/id-only, no referential integrity) cross-page linking pattern.

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

export const ItemType = z.enum(["Frame", "Weapon", "Companion", "Archwing", "Necramech"]);
export type ItemType = z.infer<typeof ItemType>;

export const ConfigSlot = z.enum(["A", "B", "C"]);
export type ConfigSlot = z.infer<typeof ConfigSlot>;

// A/B/C mirrors Warframe's own MOD config slots. No slot position/polarity/
// rank — just the MOD name list, a deliberately lightweight simplification.
// Companion only ever uses config A (single loadout, low switch frequency);
// the data shape still has B/C, the UI just hides them.
export const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ItemType,
  configs: z.record(ConfigSlot, z.array(z.string())).default({ A: [], B: [], C: [] }),

  // "current main / high priority" — a subjective marker independent of
  // Chain View's satisfied state or config completeness.
  favorite: z.boolean().optional(),

  // Free-form card note. Low-frequency asides (Helminth-transplanted
  // abilities, Arcane setup) go here rather than getting their own field.
  note: z.string().optional(),

  // Loose optional reference to a Chain View node, for the card's mini
  // progress graph.
  chainViewNodeId: z.string().optional(),

  // Unix ms of the last config edit (SetConfig only — favorite toggles and
  // note edits don't count). Used as a secondary sort key ("recently used"
  // mixed in above plain favorite, so items nobody starred don't vanish
  // past the 8-item fold), 2026-08-23.
  lastUsedAt: z.number().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

// Which frame/weapon config (A/B/C) a BuildSet slot points at.
export const ItemRefSchema = z.object({
  itemId: z.string(),
  config: ConfigSlot,
});
export type ItemRef = z.infer<typeof ItemRefSchema>;

// A frame + multiple weapons (each with a chosen config) bundled into one
// "what I actually bring" snapshot. Distinct from a Chain View Build/Goal
// node (a dependency-graph target) — this is the loadout itself.
export const BuildSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  frame: ItemRefSchema.nullish(),
  weapons: z.array(ItemRefSchema).default([]),
  note: z.string().optional(),

  // Loose optional reference to a graph.json Build/Goal node, for
  // cross-page progress display.
  chainViewBuildId: z.string().optional(),
});
export type BuildSet = z.infer<typeof BuildSetSchema>;

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  items: z.record(z.string(), ItemSchema).default({}),
  buildSets: z.record(z.string(), BuildSetSchema).default({}),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, items: {}, buildSets: {} };
}

export class LoadoutStore {
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

  async upsertItem(item: Item): Promise<Item> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.items[item.id] = item;
      await this.#saveLocked(d);
      return item;
    });
  }

  /** Replaces one config slot's MOD list wholesale and bumps lastUsedAt. */
  async setConfig(itemId: string, slot: ConfigSlot, mods: string[]): Promise<Item> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      const item = d.items[itemId];
      if (!item) throw new Error(`item ${itemId} not found`);
      item.configs[slot] = mods;
      item.lastUsedAt = Date.now();
      await this.#saveLocked(d);
      return item;
    });
  }

  async deleteItem(itemId: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.items[itemId];
      await this.#saveLocked(d);
    });
  }

  async upsertBuildSet(set: BuildSet): Promise<BuildSet> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.buildSets[set.id] = set;
      await this.#saveLocked(d);
      return set;
    });
  }

  async deleteBuildSet(setId: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.buildSets[setId];
      await this.#saveLocked(d);
    });
  }
}
