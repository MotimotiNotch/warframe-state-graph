// Port of pkg/store/store.go — graph.json persistence + node CRUD +
// the ToggleSatisfied entry point that invokes engine's cascades.

import { AsyncMutex } from "./async-mutex.ts";
import { cascadeSatisfyContainsParents, cascadeSatisfyRequires, cascadeUnsatisfyDependents } from "./engine.ts";
import { CURRENT_SCHEMA_VERSION, GraphSchema, newGraph, type Counter, type Graph, type Node } from "./model.ts";
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

  /** Moves a node (and, implicitly, everything already nested under it —
   * moving the node itself carries its own contains/requires along, no
   * separate subtree walk needed) from wherever it's currently referenced
   * to a new parent's requires or contains array (2026-08-29, Inspector's
   * "付け替え" action). Strips the node's id from every other node's
   * `relation` array first (a node might be multiply-referenced; all of
   * those links move, not just one), then adds it to `targetId`'s. Throws
   * if either node doesn't exist, or if targetId === id (can't parent a
   * node under itself).
   *
   * "付け替え" reads as a cut, not a copy (のっち指摘, 2026-08-29) — a
   * Goal/Build being moved stops being an independent entry point, so it
   * should stop cluttering the left-sidebar build list too. Demotes
   * type "Goal"/"Build" to "Resource" on the way in, the same demotion
   * dsl.ts already applies to any node another node's requires/contains
   * reaches (the sidebar only lists Build/Goal — see build-sidebar.ts's
   * selectableBuilds()). Any other type is left untouched — a Frame/Quest/
   * etc. being reparented is still that same kind of thing, just relocated. */
  async reparentNode(id: string, targetId: string, relation: "requires" | "contains"): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[id];
      if (!n) throw new Error(`node "${id}" not found`);
      const target = g.nodes[targetId];
      if (!target) throw new Error(`node "${targetId}" not found`);
      if (targetId === id) throw new Error("cannot reparent a node under itself");
      for (const other of Object.values(g.nodes)) {
        other.requires = other.requires.filter((x) => x !== id);
        other.contains = other.contains.filter((x) => x !== id);
      }
      const arr = target[relation];
      if (!arr.includes(id)) arr.push(id);
      if (n.type === "Goal" || n.type === "Build") n.type = "Resource";
      await this.#saveLocked(g);
      return n;
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
   * the requires chain (prerequisite side) satisfied, and auto-satisfies any
   * `contains` parent whose children are now all done (2026-08-26 —
   * container nodes can only be toggled indirectly this way, since clicking
   * one always drills in instead of selecting it); reverting cascades
   * dependents (downstream side) unsatisfied. */
  async toggleSatisfied(id: string): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[id];
      if (!n) throw new Error(`node "${id}" not found`);
      n.satisfied = !n.satisfied;
      if (n.satisfied) {
        cascadeSatisfyRequires(g, id);
        cascadeSatisfyContainsParents(g, id);
      } else {
        cascadeUnsatisfyDependents(g, id);
      }
      await this.#saveLocked(g);
      return n;
    });
  }

  /** Flips `archived` — hides/unhides a Build/Goal from the Chain View
   * build-select dropdown without deleting it (2026-08-27). */
  async toggleArchived(id: string): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[id];
      if (!n) throw new Error(`node "${id}" not found`);
      n.archived = !n.archived;
      await this.#saveLocked(g);
      return n;
    });
  }

  /** Sets (or clears, with `null`) which folder a Build/Goal is filed under
   * (2026-08-27, left-sidebar explorer panel's "移動" action). */
  async setNodeFolder(id: string, folderId: string | null): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[id];
      if (!n) throw new Error(`node "${id}" not found`);
      if (folderId) n.folderId = folderId;
      else delete n.folderId;
      await this.#saveLocked(g);
      return n;
    });
  }

  /** Unfiles every node referencing a just-deleted folder (same "strip
   * dangling references" shape as deleteNode's requires/contains cleanup) —
   * called from the DELETE /api/folders/:id route, not from FolderStore
   * itself, since folder.ts has no visibility into graph.json. */
  async clearFolderFromNodes(folderId: string): Promise<void> {
    await this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      for (const n of Object.values(g.nodes)) {
        if (n.folderId === folderId) delete n.folderId;
      }
      await this.#saveLocked(g);
    });
  }

  /** Sets a node's free-text note directly (Inspector's live-markdown editor),
   * without going through the full node-edit modal's upsertNode round trip. */
  async setNodeNote(id: string, note: string): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[id];
      if (!n) throw new Error(`node "${id}" not found`);
      n.note = note;
      await this.#saveLocked(g);
      return n;
    });
  }

  /** `c.id` is client-generated (same pattern as ScratchStore.addCounter). */
  async addNodeCounter(nodeId: string, c: Counter): Promise<Node> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[nodeId];
      if (!n) throw new Error(`node "${nodeId}" not found`);
      (n.counters ??= []).push(c);
      await this.#saveLocked(g);
      return n;
    });
  }

  async #mutateNodeCounter(nodeId: string, counterId: string, mutate: (c: Counter) => void): Promise<Counter> {
    return this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[nodeId];
      if (!n) throw new Error(`node "${nodeId}" not found`);
      const c = n.counters?.find((x) => x.id === counterId);
      if (!c) throw new Error(`counter "${counterId}" not found on node "${nodeId}"`);
      mutate(c);
      await this.#saveLocked(g);
      return c;
    });
  }

  async incrementNodeCounter(nodeId: string, counterId: string): Promise<Counter> {
    return this.#mutateNodeCounter(nodeId, counterId, (c) => c.value++);
  }

  /** Below-zero is allowed — this is an undo for a mis-click, not a floor. */
  async decrementNodeCounter(nodeId: string, counterId: string): Promise<Counter> {
    return this.#mutateNodeCounter(nodeId, counterId, (c) => c.value--);
  }

  async setNodeCounterValue(nodeId: string, counterId: string, value: number): Promise<Counter> {
    return this.#mutateNodeCounter(nodeId, counterId, (c) => (c.value = value));
  }

  async renameNodeCounter(nodeId: string, counterId: string, label: string): Promise<Counter> {
    return this.#mutateNodeCounter(nodeId, counterId, (c) => (c.label = label));
  }

  async deleteNodeCounter(nodeId: string, counterId: string): Promise<void> {
    await this.#mutex.run(async () => {
      const g = await this.#loadLocked();
      const n = g.nodes[nodeId];
      if (!n) throw new Error(`node "${nodeId}" not found`);
      n.counters = (n.counters ?? []).filter((c) => c.id !== counterId);
      await this.#saveLocked(g);
    });
  }
}
