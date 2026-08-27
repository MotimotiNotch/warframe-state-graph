// Chain View build folders (2026-08-27) — a flat (single-level, no nesting)
// grouping of Build/Goal nodes for the left-sidebar "explorer" panel, so the
// picker doesn't just grow as a single unsorted list as builds accumulate
// (same motivation as `archived`, a different axis — archived hides
// entirely, a folder just organizes where a still-active build shows up).
//
// Deliberately its own tiny store rather than a field group folded into
// graph.json's Node — a folder has no `satisfied`/requires-chain semantics
// of its own and never participates in a Build's requires/contains
// traversal, so it doesn't belong in the flat node graph (the same reasoning
// that pulled Riven/Kuva individuals out into collections.json rather than
// Node fields, 2026-08-17). Node only holds the loose `folderId` reference.

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

export const FolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type Folder = z.infer<typeof FolderSchema>;

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  folders: z.record(z.string(), FolderSchema).default({}),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, folders: {} };
}

export class FolderStore {
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

  /** `f.id` is client-generated (same pattern as scratch.ts's counters). */
  async addFolder(f: Folder): Promise<Folder> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.folders[f.id] = f;
      await this.#saveLocked(d);
      return f;
    });
  }

  async renameFolder(id: string, name: string): Promise<Folder> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      const f = d.folders[id];
      if (!f) throw new Error(`folder "${id}" not found`);
      f.name = name;
      await this.#saveLocked(d);
      return f;
    });
  }

  async deleteFolder(id: string): Promise<void> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.folders[id];
      await this.#saveLocked(d);
    });
  }
}
