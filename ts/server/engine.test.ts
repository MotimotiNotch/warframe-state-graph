// Port of pkg/engine/engine_test.go — same 6 cases, same test graphs, same
// expected results, translated to TS naming/idiom. Test-first executable
// spec for the cascade/resolve core.

import { expect, test } from "bun:test";
import { newGraph, type Graph } from "./model.ts";
import {
  cascadeSatisfyRequires,
  cascadeUnsatisfyDependents,
  deriveNextActions,
  resolveState,
} from "./engine.ts";

// Ash Stealth Build test case (same as the Obsidian Prototype/Nodes/ setup),
// reproduced here so a manually-traced expected result can be checked
// against both the Go and TS engines.
function buildTestGraph(): Graph {
  const g = newGraph();
  g.nodes["ash-stealth-build"] = {
    id: "ash-stealth-build",
    name: "",
    type: "Build",
    satisfied: false,
    requires: [],
    contains: ["dragon-nikana", "ash-prime", "seeking-shuriken"],
  };
  g.nodes["dragon-nikana"] = {
    id: "dragon-nikana",
    name: "",
    type: "Weapon",
    satisfied: true,
    requires: [],
    contains: ["dragon-nikana-riven"],
  };
  g.nodes["dragon-nikana-riven"] = {
    id: "dragon-nikana-riven",
    name: "",
    type: "Riven",
    satisfied: false,
    requires: [],
    contains: [],
  };
  g.nodes["ash-prime"] = {
    id: "ash-prime",
    name: "",
    type: "Frame",
    satisfied: true,
    requires: [],
    contains: [],
  };
  g.nodes["seeking-shuriken"] = {
    id: "seeking-shuriken",
    name: "",
    type: "Mod",
    satisfied: false,
    requires: ["red-veil-rank-5"],
    contains: [],
  };
  g.nodes["red-veil-rank-5"] = {
    id: "red-veil-rank-5",
    name: "",
    type: "Syndicate",
    satisfied: false,
    requires: [],
    contains: [],
  };
  return g;
}

function assertSet(got: string[], want: string[]): void {
  expect(new Set(got)).toEqual(new Set(want));
  expect(got.length).toBe(want.length);
}

// Minimal node factory for tests that don't need the full Ash Stealth Build
// setup — mirrors the Go tests' terse &model.Node{ID: ..., Requires: ...}
// literals, filling in the fields Zod's schema requires but the Go struct
// left at zero value.
function node(id: string, opts: { requires?: string[]; satisfied?: boolean } = {}) {
  return {
    id,
    name: "",
    type: "Resource" as const,
    satisfied: opts.satisfied ?? false,
    requires: opts.requires ?? [],
    contains: [],
  };
}

test("deriveNextActions classifies the Ash Stealth Build graph", () => {
  const g = buildTestGraph();
  const report = deriveNextActions(g, "ash-stealth-build");

  assertSet(report.actionable, ["dragon-nikana-riven", "red-veil-rank-5"]);
  assertSet(report.blocked, ["seeking-shuriken"]);
  assertSet(report.satisfied, ["dragon-nikana", "ash-prime"]);

  expect(report.progress.done).toBe(2);
  expect(report.progress.total).toBe(5);
});

test("resolveState treats cyclic requires as BLOCKED, not an infinite loop", () => {
  const g = newGraph();
  g.nodes.a = node("a", { requires: ["b"] });
  g.nodes.b = node("b", { requires: ["a"] });

  expect(resolveState(g, "a")).toBe("BLOCKED");
});

// Steel Path quest chain (Saya's Vigil → Chains of Harrow → ... → Natah)
// modeled as a requires chain. Completing Natah should cascade-complete
// every prerequisite automatically.
test("cascadeSatisfyRequires completes a chain of prerequisites", () => {
  const g = newGraph();
  g.nodes.natah = node("natah", { requires: ["war-within"] });
  g.nodes["war-within"] = node("war-within", { requires: ["second-dream"] });
  g.nodes["second-dream"] = node("second-dream", { requires: ["apostasy"] });
  g.nodes.apostasy = node("apostasy", { requires: ["chains-of-harrow"] });
  g.nodes["chains-of-harrow"] = node("chains-of-harrow", { requires: ["saya-vigil"] });
  g.nodes["saya-vigil"] = node("saya-vigil");

  cascadeSatisfyRequires(g, "natah");

  // natah itself is out of scope for this function (the caller is expected
  // to set node.satisfied = true first); the 5-node prerequisite chain
  // should all be cascade-satisfied.
  for (const id of ["war-within", "second-dream", "apostasy", "chains-of-harrow", "saya-vigil"]) {
    expect(g.nodes[id]?.satisfied).toBe(true);
  }
});

test("cascadeSatisfyRequires on a cycle does not infinite-loop", () => {
  const g = newGraph();
  g.nodes.a = node("a", { requires: ["b"] });
  g.nodes.b = node("b", { requires: ["a"] });

  cascadeSatisfyRequires(g, "a"); // returning without hanging is the test
  expect(g.nodes.b?.satisfied).toBe(true);
});

// Reverting Natah should cascade-revert downstream dependents (Steel Path
// access), while leaving Natah's own prerequisites (The War Within) alone —
// their completion record doesn't get erased.
test("cascadeUnsatisfyDependents reverts downstream only", () => {
  const g = newGraph();
  g.nodes["war-within"] = node("war-within", { satisfied: true });
  g.nodes.natah = node("natah", { requires: ["war-within"], satisfied: false });
  g.nodes["steel-path-junction"] = node("steel-path-junction", { requires: ["natah"], satisfied: true });
  g.nodes["further-quest"] = node("further-quest", { requires: ["steel-path-junction"], satisfied: true });

  cascadeUnsatisfyDependents(g, "natah");

  expect(g.nodes["war-within"]?.satisfied).toBe(true); // prerequisite side: untouched
  expect(g.nodes["steel-path-junction"]?.satisfied).toBe(false); // direct dependent
  expect(g.nodes["further-quest"]?.satisfied).toBe(false); // indirect dependent
});

test("cascadeUnsatisfyDependents on a cycle does not infinite-loop", () => {
  const g = newGraph();
  g.nodes.a = node("a", { requires: ["b"], satisfied: true });
  g.nodes.b = node("b", { requires: ["a"], satisfied: true });

  cascadeUnsatisfyDependents(g, "a"); // returning without hanging is the test
  expect(g.nodes.b?.satisfied).toBe(false);
});
