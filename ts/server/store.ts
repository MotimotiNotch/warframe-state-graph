// Port of pkg/store/store.go — graph.json persistence + node CRUD +
// the ToggleSatisfied entry point that invokes engine's cascades.

import { AsyncMutex } from "./async-mutex.ts";
import { cascadeSatisfyRequires, cascadeUnsatisfyDependents } from "./engine.ts";
import { CURRENT_SCHEMA_VERSION, GraphSchema, newGraph, type Graph, type Node } from "./model.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

export class GraphStore {
  readonly #path: string;
  readonly #mutex = new AsyncMutex();

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<Graph> {
    return this.#mutex.run(() => this.#loadLocked());
  }

  async #loadLocked(): Promise<Graph> {
    try {
      // GraphSchema's own .default([])/.default({}) on nodes/schemaVersion
      // already cover the "nil map"/"zero schemaVersion" backfill the Go
      // loadLocked did by hand after persist.LoadJSON returned.
      return await loadJSON(this.#path, GraphSchema);
    } catch (err) {
      if (err instanceof NotFoundError) return newGraph();
      throw err;
    }
  }

  async #saveLocked(g: Graph): Promise<void> {
    g.schemaVersion = CURRENT_SCHEMA_VERSION;
    await saveJSON(this.#path, g);
  }

  /** Creates or overwrites a single node (node create/edit UI). */
  async upsertNode(n: Node): Promise<void> {
    await this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      g.nodes[n.id] = n;
      await this.#saveLocked(g);
    });
  }

  /** Creates or overwrites several nodes at once (WFCD auto-import). */
  async upsertNodes(nodes: Node[]): Promise<void> {
    await this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      for (const n of nodes) g.nodes[n.id] = n;
      await this.#saveLocked(g);
    });
  }

  /** Deletes a node and strips references to it from every other node's
   * requires/contains (a dangling reference would otherwise just sit as
   * garbage in graph.json — the frontend/engine already treat it as
   * inert). */
  async deleteNode(id: string): Promise<void> {
    await this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      delete g.nodes[id];
      for (const n of Object.values(g.nodes)) {
        n.requires = n.requires.filter((x) => x !== id);
        n.contains = n.contains.filter((x) => x !== id);
      }
      await this.#saveLocked(g);
    });
  }

  /** Flips Gild state for a mastery-track part (Zaw/Kitgun/Amp Strike/
   * Chamber/Prism etc.) — independent of `satisfied` (owning/ranking the
   * part doesn't grant mastery until it's Gilded too). */
  async toggleGilded(id: string): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[id];
      if (!n) throw new Error(`node "${id}" not found`);
      n.gilded = !n.gilded;
      await this.#saveLocked(g);
      return n;
    });
  }

  /** Flips `satisfied` and immediately persists. Becoming satisfied cascades
   * the requires chain (prerequisite side) satisfied; reverting cascades
   * dependents (downstream side) unsatisfied. */
  async toggleSatisfied(id: string): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[id];
      if (!n) throw new Error(`node "${id}" not found`);
      n.satisfied = !n.satisfied;
      if (n.satisfied) {
        cascadeSatisfyRequires(g, id);
      } else {
        cascadeUnsatisfyDependents(g, id);
      }
      await this.#saveLocked(g);
      return n;
    });
  }
}
