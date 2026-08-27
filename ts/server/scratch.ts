// Port of pkg/scratch — a page-independent quick-memo/counter scratchpad
// (the "新規" header icon's modal on every page), backing web/scratch.js.

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { CounterSchema, type Counter } from "./model.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

// Re-exported for existing importers (ts/web/scratch.ts) — the schema/type
// itself now lives in model.ts, shared with Node's per-node counters
// (2026-08-27).
export { CounterSchema };
export type { Counter };

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  note: z.string().default(""),
  counters: z.array(CounterSchema).default([]),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, note: "", counters: [] };
}

export class ScratchStore {
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

  async setNote(note: string): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.note = note;
      await this.#saveLocked(d);
      return d;
    });
  }

  /** `c.id` is client-generated (same `${prefix}-${Date.now().toString(36)}...` pattern as loadouts.html). */
  async addCounter(c: Counter): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.counters.push(c);
      await this.#saveLocked(d);
      return d;
    });
  }

  async #mutateCounter(id: string, mutate: (c: Counter) => void): Promise<Counter> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      const c = d.counters.find((x) => x.id === id);
      if (!c) throw new Error(`counter "${id}" not found`);
      mutate(c);
      await this.#saveLocked(d);
      return c;
    });
  }

  async incrementCounter(id: string): Promise<Counter> {
    return this.#mutateCounter(id, (c) => c.value++);
  }

  /** Below-zero is allowed — this is an undo for a mis-click, not a floor. */
  async decrementCounter(id: string): Promise<Counter> {
    return this.#mutateCounter(id, (c) => c.value--);
  }

  async setCounterValue(id: string, value: number): Promise<Counter> {
    return this.#mutateCounter(id, (c) => (c.value = value));
  }

  async renameCounter(id: string, label: string): Promise<Counter> {
    return this.#mutateCounter(id, (c) => (c.label = label));
  }

  async deleteCounter(id: string): Promise<void> {
    await this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.counters = d.counters.filter((c) => c.id !== id);
      await this.#saveLocked(d);
    });
  }
}
