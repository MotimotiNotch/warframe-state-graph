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

test("upsertNodes: re-importing an existing id preserves the user-state fields, not just structure", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([{ ...node("a", "A"), satisfied: true, note: "手動メモ", counters: [{ id: "c1", label: "x", value: 3 }], gilded: true, archived: true, folderId: "folder-1", priority: 5 }]);
  // A re-generation (WFCD/DSL) resolves to the same id but only carries fresh
  // structural fields — no note/counters/gilded/archived/folderId/priority set.
  await store.upsertNodes([{ ...node("a", "Renamed A", ["req-1"]), type: "Build" }]);
  const g = await store.load();
  expect(g.nodes["a"]).toEqual({
    id: "a",
    name: "Renamed A",
    type: "Build",
    requires: ["req-1"],
    contains: [],
    satisfied: true,
    note: "手動メモ",
    counters: [{ id: "c1", label: "x", value: 3 }],
    gilded: true,
    archived: true,
    folderId: "folder-1",
    priority: 5,
  });
});

test("upsertNodes: a brand-new id gets exactly the incoming node, untouched", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("a", "A")]);
  const g = await store.load();
  expect(g.nodes["a"]).toEqual(node("a", "A"));
});

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

test("reparentNode: demotes a Goal to Resource so it drops off the sidebar build list", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("child", "Child"), node("new", "New Parent")]);

  await store.reparentNode("child", "new", "contains");

  const g = await store.load();
  expect(g.nodes["child"]!.type).toBe("Resource");
});

test("reparentNode: leaves a non-Goal/Build type unchanged", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([{ ...node("child", "Child"), type: "Quest" }, node("new", "New Parent")]);

  await store.reparentNode("child", "new", "contains");

  const g = await store.load();
  expect(g.nodes["child"]!.type).toBe("Quest");
});

test("detachNode: strips the node from its parent's contains and promotes Resource back to Goal", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([{ ...node("child", "Child"), type: "Resource" }, node("parent", "Parent", [], ["child"])]);

  await store.detachNode("child");

  const g = await store.load();
  expect(g.nodes["parent"]!.contains).toEqual([]);
  expect(g.nodes["child"]!.type).toBe("Goal");
});

test("detachNode: leaves a non-Resource type unchanged", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([{ ...node("child", "Child"), type: "Quest" }, node("parent", "Parent", [], ["child"])]);

  await store.detachNode("child");

  const g = await store.load();
  expect(g.nodes["child"]!.type).toBe("Quest");
});

test("detachNode: strips from every referencing node when multiply-referenced", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([
    { ...node("child", "Child"), type: "Resource" },
    node("parentA", "Parent A", [], ["child"]),
    node("parentB", "Parent B", ["child"]),
  ]);

  await store.detachNode("child");

  const g = await store.load();
  expect(g.nodes["parentA"]!.contains).toEqual([]);
  expect(g.nodes["parentB"]!.requires).toEqual([]);
});

test("detachNode: throws for a nonexistent node", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await expect(store.detachNode("missing")).rejects.toThrow();
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

// --- 入れ子の組み合わせ（2026-08-29、のっち依頼のテストケース群） ---

test("reparentNode: moving a subtree carries its own children along untouched", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([
    node("oldParent", "Old Parent", [], ["mover"]),
    node("mover", "Mover", ["grandchild-req"], ["grandchild-con"]),
    node("grandchild-req", "Grandchild Req"),
    node("grandchild-con", "Grandchild Con"),
    node("newParent", "New Parent"),
  ]);

  await store.reparentNode("mover", "newParent", "contains");

  const g = await store.load();
  expect(g.nodes["oldParent"]!.contains).toEqual([]);
  expect(g.nodes["newParent"]!.contains).toEqual(["mover"]);
  // "mover" itself still has its own subtree intact — only its own
  // *incoming* link moved, not its outgoing requires/contains.
  expect(g.nodes["mover"]!.requires).toEqual(["grandchild-req"]);
  expect(g.nodes["mover"]!.contains).toEqual(["grandchild-con"]);
});

test("reparentNode: reparenting into a node with existing contains appends without disturbing siblings", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([
    node("mover", "Mover"),
    node("sibling", "Existing Sibling"),
    node("newParent", "New Parent", [], ["sibling"]),
  ]);

  await store.reparentNode("mover", "newParent", "contains");

  const g = await store.load();
  expect(g.nodes["newParent"]!.contains.sort()).toEqual(["mover", "sibling"]);
});

test("reparentNode: 3+ level deep nesting stays intact when the middle node moves", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([
    node("root", "Root", [], ["mid"]),
    node("mid", "Mid", [], ["leaf"]),
    node("leaf", "Leaf"),
    node("elsewhere", "Elsewhere"),
  ]);

  // Move "mid" (with "leaf" still nested under it) out from under "root" to "elsewhere".
  await store.reparentNode("mid", "elsewhere", "contains");

  const g = await store.load();
  expect(g.nodes["root"]!.contains).toEqual([]);
  expect(g.nodes["elsewhere"]!.contains).toEqual(["mid"]);
  expect(g.nodes["mid"]!.contains).toEqual(["leaf"]); // leaf followed mid, untouched
});

test("reparentNode: refuses to reparent an ancestor under its own descendant (would create a cycle)", async () => {
  // A contains B contains C. Reparenting A under C would make C (A's own
  // grandchild) A's new parent — a cycle. Found via testing 2026-08-29
  // that nothing stopped this; fixed with isDescendant() guard.
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("a", "A", [], ["b"]), node("b", "B", [], ["c"]), node("c", "C")]);

  await expect(store.reparentNode("a", "c", "contains")).rejects.toThrow();

  // Confirm nothing was mutated (the guard runs before any writes).
  const g = await store.load();
  expect(g.nodes["a"]!.contains).toEqual(["b"]);
  expect(g.nodes["b"]!.contains).toEqual(["c"]);
  expect(g.nodes["c"]!.contains).toEqual([]);
});

test("reparentNode: also refuses via the requires side of the cycle check (mixed contains/requires)", async () => {
  // A requires B, B contains C — reparenting A under C (via either
  // relation) would still create a cycle, since the descendant check walks
  // both contains and requires outward from A.
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("a", "A", ["b"]), node("b", "B", [], ["c"]), node("c", "C")]);

  await expect(store.reparentNode("a", "c", "requires")).rejects.toThrow();
});

test("reparentNode: a non-cyclic move to an unrelated branch still succeeds (guard isn't overly strict)", async () => {
  // A contains B contains C, and a completely separate D. Moving C under D
  // doesn't touch A/B's ancestry at all — must not be refused.
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("a", "A", [], ["b"]), node("b", "B", [], ["c"]), node("c", "C"), node("d", "D")]);

  await store.reparentNode("c", "d", "contains");

  const g = await store.load();
  expect(g.nodes["b"]!.contains).toEqual([]);
  expect(g.nodes["d"]!.contains).toEqual(["c"]);
});

test("detachNode: a mid-tree node keeps its own children when detached", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([
    node("root", "Root", [], ["mid"]),
    { ...node("mid", "Mid", [], ["leaf"]), type: "Resource" },
    node("leaf", "Leaf"),
  ]);

  await store.detachNode("mid");

  const g = await store.load();
  expect(g.nodes["root"]!.contains).toEqual([]);
  expect(g.nodes["mid"]!.type).toBe("Goal"); // promoted, now an independent entry point
  expect(g.nodes["mid"]!.contains).toEqual(["leaf"]); // its own subtree is untouched
});

test("reparentNode then detachNode round-trips back to a fully independent node with no dangling references", async () => {
  const store = new GraphStore(path.join(tmpDir, "graph.json"));
  await store.upsertNodes([node("a", "A"), node("b", "B")]);

  await store.reparentNode("a", "b", "contains");
  let g = await store.load();
  expect(g.nodes["b"]!.contains).toEqual(["a"]);
  expect(g.nodes["a"]!.type).toBe("Resource");

  await store.detachNode("a");
  g = await store.load();
  expect(g.nodes["b"]!.contains).toEqual([]);
  expect(g.nodes["a"]!.type).toBe("Goal");
});
