// GraphStore.reparentNode() (2026-08-29, Inspector's "付け替え" action). No
// Go equivalent to port — this feature postdates the Go->TS migration.
// Follows the same beforeEach/afterEach tmpDir pattern as collection.test.ts.
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { GraphStore } from "./store.ts";
import type { Node } from "./model.ts";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wsg-store-test-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function node(id: string, name: string, requires: string[] = [], contains: string[] = []): Node {
  return { id, name, type: "Goal", satisfied: false, requires, contains };
}

test("reparentNode: strips the old parent's contains reference and adds it under the new parent", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("old", "Old Parent", [], ["child"]), node("child", "Child"), node("new", "New Parent")]);

  await store.reparentNode("child", "new", "contains");

  const g = await store.load();
  expect(g.nodes["old"]!.contains).toEqual([]);
  expect(g.nodes["new"]!.contains).toEqual(["child"]);
});

test("reparentNode: strips every referencing node, not just one, when the node is multiply-referenced", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([
    node("parentA", "Parent A", [], ["child"]),
    node("parentB", "Parent B", ["child"]),
    node("child", "Child"),
    node("new", "New Parent"),
  ]);

  await store.reparentNode("child", "new", "requires");

  const g = await store.load();
  expect(g.nodes["parentA"]!.contains).toEqual([]);
  expect(g.nodes["parentB"]!.requires).toEqual([]);
  expect(g.nodes["new"]!.requires).toEqual(["child"]);
});

test("reparentNode: adding to requires leaves contains untouched, and vice versa", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("child", "Child"), node("new", "New Parent", ["existing-req"])]);

  await store.reparentNode("child", "new", "contains");

  const g = await store.load();
  expect(g.nodes["new"]!.requires).toEqual(["existing-req"]);
  expect(g.nodes["new"]!.contains).toEqual(["child"]);
});

test("reparentNode: throws for a nonexistent node", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("new", "New Parent")]);
  await expect(store.reparentNode("missing", "new", "contains")).rejects.toThrow();
});

test("reparentNode: throws for a nonexistent target", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("child", "Child")]);
  await expect(store.reparentNode("child", "missing", "contains")).rejects.toThrow();
});

test("reparentNode: throws when targeting itself", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("a", "A")]);
  await expect(store.reparentNode("a", "a", "contains")).rejects.toThrow();
});
