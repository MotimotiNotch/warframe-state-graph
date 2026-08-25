// No Go tests exist for pkg/wfcd to port 1:1 (checked: no pkg/wfcd/*_test.go).
// Lightweight unit tests for the pure, network-free helpers added in Phase
// 11 — the network-touching fetchers were smoke-tested manually against the
// live dev server instead (see the migration plan's verification notes).
import { expect, test } from "bun:test";
import { findSyndicateWeaponRank, isRelicVaulted, type SyndicateEntry } from "./wfcd.ts";

test("isRelicVaulted: normalizes refinement suffix and 'Relic' suffix before lookup", () => {
  const active = new Set(["Axi A22", "Meso B2"]);
  expect(isRelicVaulted(active, "Axi A22")).toBe(false);
  expect(isRelicVaulted(active, "Axi A22 Relic (Radiant)")).toBe(false);
  expect(isRelicVaulted(active, "Meso B2 (Flawless)")).toBe(false);
  expect(isRelicVaulted(active, "Axi B1")).toBe(true);
});

test("findSyndicateWeaponRank: extracts rank label after the last comma", () => {
  const data: Record<string, SyndicateEntry[]> = {
    "Steel Meridian": [{ item: "Vaykor Marelok", place: "Steel Meridian, General", standing: 100000, chance: 0, rarity: "" }],
  };
  const got = findSyndicateWeaponRank(data, "vaykor marelok"); // case-insensitive
  expect(got).toBeDefined();
  expect(got!.syndicate).toBe("Steel Meridian");
  expect(got!.rankLabel).toBe("General");
  expect(got!.standing).toBe(100000);
});

test("findSyndicateWeaponRank: undefined for an unknown weapon", () => {
  const data: Record<string, SyndicateEntry[]> = {
    "Steel Meridian": [{ item: "Vaykor Marelok", place: "Steel Meridian, General", standing: 100000, chance: 0, rarity: "" }],
  };
  expect(findSyndicateWeaponRank(data, "Braton")).toBeUndefined();
});
