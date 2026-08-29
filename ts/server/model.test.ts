// generateRandomId()/resolveNodeIds() (2026-08-29 node-id spec change — ids
// are opaque random strings now, not name-derived). No Go equivalent to
// port (this concept postdates the Go->TS migration).
import { expect, test } from "bun:test";
import { generateRandomId, resolveNodeIds, newGraph, type Node } from "./model.ts";

function node(id: string, name: string, requires: string[] = [], contains: string[] = []): Node {
  return { id, name, type: "Goal", satisfied: false, requires, contains };
}

test("generateRandomId: 8 lowercase-alphanumeric chars", () => {
  const id = generateRandomId();
  expect(id).toMatch(/^[a-z0-9]{8}$/);
});

test("resolveNodeIds: a name with no existing match gets a fresh random id", () => {
  const g = newGraph();
  const [resolved] = resolveNodeIds([node("Mag Prime", "Mag Prime")], g);
  expect(resolved!.id).toMatch(/^[a-z0-9]{8}$/);
  expect(resolved!.id).not.toBe("Mag Prime");
});

test("resolveNodeIds: a name matching an existing node reuses that node's id", () => {
  const g = newGraph();
  g.nodes["existing123"] = node("existing123", "Mag Prime");
  const [resolved] = resolveNodeIds([node("Mag Prime", "Mag Prime")], g);
  expect(resolved!.id).toBe("existing123");
});

test("resolveNodeIds: remaps requires/contains references to the resolved ids", () => {
  const g = newGraph();
  const nodes = [node("Mag Prime", "Mag Prime", [], ["設計図"]), node("設計図", "設計図", ["レリック開封"]), node("レリック開封", "レリック開封")];
  const resolved = resolveNodeIds(nodes, g);
  const byName = new Map(resolved.map((n) => [n.name, n]));
  expect(byName.get("Mag Prime")!.contains).toEqual([byName.get("設計図")!.id]);
  expect(byName.get("設計図")!.requires).toEqual([byName.get("レリック開封")!.id]);
});

test("resolveNodeIds: two incoming nodes with the same name resolve to one id (defensive fallback)", () => {
  const g = newGraph();
  const resolved = resolveNodeIds([node("A", "Dup"), node("B", "Dup")], g);
  expect(resolved[0]!.id).toBe(resolved[1]!.id);
});

test("resolveNodeIds: never reuses an id already present in the graph or already minted this batch", () => {
  const g = newGraph();
  g.nodes["aaaaaaaa"] = node("aaaaaaaa", "Something Else");
  const resolved = resolveNodeIds([node("X", "New A"), node("Y", "New B")], g);
  const ids = resolved.map((n) => n.id);
  expect(new Set(ids).size).toBe(2);
  expect(ids).not.toContain("aaaaaaaa");
});
