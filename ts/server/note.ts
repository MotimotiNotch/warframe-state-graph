// A dedicated single-page Markdown memo (2026-08-29, のっち依頼) — distinct
// from scratch.ts's クイックメモ (a small floating sticky-note widget meant
// for transient jotting). This is "the big memo you check periodically": one
// persistent Markdown document, its own full page (note.html), no counters
// or other structure. Deliberately as thin as ScratchStore's note half.

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  content: z.string().default(""),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, content: "" };
}

export class NoteStore {
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

  async setContent(content: string): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.content = content;
      d.schemaVersion = CURRENT_SCHEMA_VERSION;
      await saveJSON(this.#path, d);
      return d;
    });
  }
}
