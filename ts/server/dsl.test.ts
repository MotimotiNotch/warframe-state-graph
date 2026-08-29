import { expect, test } from "bun:test";
import { parseDsl } from "./dsl.ts";

function byId(nodes: ReturnType<typeof parseDsl>["nodes"], id: string) {
  const n = nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node not found in result: ${id}`);
  return n;
}

test("item 29's own example: A -> B -> [A' -> B'], A -> D", () => {
  const { nodes, errors } = parseDsl("A -> B -> [A' -> B'], A -> D");
  expect(errors).toEqual([]);
  expect(nodes.map((n) => n.id).sort()).toEqual(["A", "A'", "B", "B'", "D"]);

  const a = byId(nodes, "A");
  expect(a.requires.sort()).toEqual(["B", "D"]);
  expect(a.contains).toEqual([]);

  const b = byId(nodes, "B");
  expect(b.contains).toEqual(["A'"]);
  expect(b.requires).toEqual([]);

  const aPrime = byId(nodes, "A'");
  expect(aPrime.requires).toEqual(["B'"]);

  const bPrime = byId(nodes, "B'");
  expect(bPrime.requires).toEqual([]);
  expect(bPrime.contains).toEqual([]);

  const d = byId(nodes, "D");
  expect(d.requires).toEqual([]);

  // Only A (nothing else's requires/contains points at it) is a dropdown
  // search entry point; everything reached by drilling down from it is
  // "Resource" so it doesn't also clutter the dropdown.
  expect(a.type).toBe("Goal");
  expect(b.type).toBe("Resource");
  expect(aPrime.type).toBe("Resource");
  expect(bPrime.type).toBe("Resource");
  expect(d.type).toBe("Resource");
});

test("a line break inside a name (textarea wrap) collapses to a space so it still dedups (2026-08-29 bug: 'Mag Prime' and 'Mag\\n  Prime' from one paste became two nodes)", () => {
  const { nodes, errors } = parseDsl("Mag Prime -> [B], Mag\n  Prime -> [C]");
  expect(errors).toEqual([]);
  expect(nodes.filter((n) => n.id === "Mag Prime")).toHaveLength(1);
  expect(byId(nodes, "Mag Prime").contains.sort()).toEqual(["B", "C"]);
});

test("a name repeated across branches resolves to one node, not a duplicate", () => {
  const { nodes, errors } = parseDsl("A -> B, A -> C");
  expect(errors).toEqual([]);
  expect(nodes.filter((n) => n.id === "A")).toHaveLength(1);
  expect(byId(nodes, "A").requires.sort()).toEqual(["B", "C"]);
});

test("simple single-edge requires chain", () => {
  const { nodes, errors } = parseDsl("A -> B -> C");
  expect(errors).toEqual([]);
  expect(byId(nodes, "A").requires).toEqual(["B"]);
  expect(byId(nodes, "B").requires).toEqual(["C"]);
  expect(byId(nodes, "C").requires).toEqual([]);
});

test("bracket is a side branch: a trailing arrow after ']' continues from the node before the bracket", () => {
  const { nodes, errors } = parseDsl("A -> [B] -> C");
  expect(errors).toEqual([]);
  const a = byId(nodes, "A");
  expect(a.contains).toEqual(["B"]);
  expect(a.requires).toEqual(["C"]);
});

test("nested brackets", () => {
  const { nodes, errors } = parseDsl("A -> [B -> [C]]");
  expect(errors).toEqual([]);
  expect(byId(nodes, "A").contains).toEqual(["B"]);
  expect(byId(nodes, "B").contains).toEqual(["C"]);
  expect(byId(nodes, "B").requires).toEqual([]);
});

test("Japanese node names are used verbatim as ids (no WFCD-style slug collapse)", () => {
  const { nodes, errors } = parseDsl("フレーム入手 -> レリック開封 -> [パーツA -> パーツB]");
  expect(errors).toEqual([]);
  expect(byId(nodes, "フレーム入手").requires).toEqual(["レリック開封"]);
  expect(byId(nodes, "レリック開封").contains).toEqual(["パーツA"]);
  expect(byId(nodes, "パーツA").requires).toEqual(["パーツB"]);
});

test("a lone node with no edges is its own root: type Goal, unsatisfied, empty requires/contains", () => {
  const { nodes } = parseDsl("A");
  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({ id: "A", name: "A", type: "Goal", satisfied: false, requires: [], contains: [] });
});

test("empty input is an error", () => {
  const { nodes, errors } = parseDsl("");
  expect(nodes).toEqual([]);
  expect(errors).toHaveLength(1);
});

test("whitespace-only input is an error", () => {
  const { errors } = parseDsl("   ");
  expect(errors).toHaveLength(1);
});

test("dangling arrow at end of input is an error", () => {
  const { errors } = parseDsl("A ->");
  expect(errors).toHaveLength(1);
  expect(errors[0]!.message).toContain("'->'");
});

test("unclosed bracket is an error", () => {
  const { errors } = parseDsl("A -> [B -> C");
  expect(errors).toHaveLength(1);
  expect(errors[0]!.message).toContain("']'");
});

test("empty bracket is an error", () => {
  const { errors } = parseDsl("A -> []");
  expect(errors).toHaveLength(1);
});

test("dangling comma at end of input is an error", () => {
  const { errors } = parseDsl("A -> B,");
  expect(errors).toHaveLength(1);
  expect(errors[0]!.message).toContain("','");
});

test("comma not followed by a chain is an error", () => {
  const { errors } = parseDsl("A -> B, ->");
  expect(errors).toHaveLength(1);
});

test("stray closing bracket with no matching open is an error", () => {
  const { errors } = parseDsl("A -> B]");
  expect(errors).toHaveLength(1);
});

test("self-loop via -> does not add a self-referencing edge", () => {
  const { nodes, errors } = parseDsl("A -> A");
  expect(errors).toEqual([]);
  expect(byId(nodes, "A").requires).toEqual([]);
  expect(byId(nodes, "A").type).toBe("Goal");
});

test("two independent comma-separated chains each get their own Goal root", () => {
  const { nodes, errors } = parseDsl("A -> B, X -> Y");
  expect(errors).toEqual([]);
  expect(byId(nodes, "A").type).toBe("Goal");
  expect(byId(nodes, "X").type).toBe("Goal");
  expect(byId(nodes, "B").type).toBe("Resource");
  expect(byId(nodes, "Y").type).toBe("Resource");
});

test("error position points at the offending token", () => {
  const { errors } = parseDsl("A -> B -> ");
  expect(errors).toHaveLength(1);
  expect(errors[0]!.pos).toBe("A -> B -> ".length);
});
