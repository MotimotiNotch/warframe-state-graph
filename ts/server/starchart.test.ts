// Ported 1:1 from pkg/starchart/starchart_test.go.
import { expect, test } from "bun:test";
import { groupPlanets, groupProxima, type RegionNode } from "./starchart.ts";

test("groupPlanets", () => {
  const raw: Record<string, RegionNode> = {
    SolNode1: { systemName: "/Lotus/Language/Locations/Earth" },
    SolNode2: { systemName: "/Lotus/Language/Locations/Earth" },
    SolNode3: { systemName: "/Lotus/Language/Locations/Earth_SPACE" }, // Railjack Proxima, excluded (groupProxima's job)
    SolNode4: { systemName: "/Lotus/Language/Locations/Duviri" }, // excluded entirely
    SolNode5: { systemName: "/Lotus/Language/Locations/ZarimanRegionName" },
    ClanNode1: { systemName: "/Lotus/Language/Locations/Earth" }, // Dojo, excluded by ID prefix
  };

  const planets = groupPlanets(raw);
  const byKey = new Map(planets.map((p) => [p.key, p]));

  expect(byKey.has("Duviri")).toBe(false);
  const earth = byKey.get("Earth");
  expect(earth).toBeDefined();
  expect(earth!.nodeCount).toBe(2);
  expect(earth!.steelPathApplicable).toBe(true);

  const zariman = byKey.get("ZarimanRegionName");
  expect(zariman).toBeDefined();
  expect(zariman!.displayName).toBe("Zariman");
  expect(zariman!.steelPathApplicable).toBe(false);
});

test("groupProxima", () => {
  const raw: Record<string, RegionNode> = {
    SolNode1: { systemName: "/Lotus/Language/Locations/Earth" }, // ground, not Proxima
    SolNode2: { systemName: "/Lotus/Language/Locations/Earth_SPACE" },
    SolNode3: { systemName: "/Lotus/Language/Locations/Earth_SPACE" },
    SolNode4: { systemName: "/Lotus/Language/Locations/DeepSpace_SPACE" }, // Veil Proxima
    SolNode5: { systemName: "/Lotus/Language/Locations/Uranus_SPACE" }, // excluded (Jade Shadows Part 2)
    ClanNode1: { systemName: "/Lotus/Language/Locations/Earth_SPACE" }, // Dojo, excluded by ID prefix
  };

  const proxima = groupProxima(raw);
  const byKey = new Map(proxima.map((p) => [p.key, p]));

  const earth = byKey.get("Earth");
  expect(earth).toBeDefined();
  expect(earth!.nodeCount).toBe(2);
  expect(earth!.displayName).toBe("Earth Proxima");

  const deepSpace = byKey.get("DeepSpace");
  expect(deepSpace).toBeDefined();
  expect(deepSpace!.displayName).toBe("Veil Proxima");

  expect(byKey.has("Uranus")).toBe(false);
  expect(byKey.has("Ground")).toBe(false);
});
