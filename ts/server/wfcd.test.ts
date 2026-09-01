// No Go tests exist for pkg/wfcd to port 1:1 (checked: no pkg/wfcd/*_test.go).
// Lightweight unit tests for the pure, network-free helpers added in Phase
// 11 — the network-touching fetchers were smoke-tested manually against the
// live dev server instead (see the migration plan's verification notes).
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { cacheStatus, cachedJSON, findSyndicateWeaponRank, isRelicVaulted, refreshCache, type SyndicateEntry } from "./wfcd.ts";

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

// cacheStatus backs the "as of" reading on every data page (Issue #4), so
// what matters is that it stays truthful in the three states the UI has to
// distinguish: never fetched, cached, and just-refreshed-nothing-yet.
let cacheDir: string;
beforeEach(async () => {
  cacheDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "wsg-wfcd-test-")), "wfcd-cache");
});
afterEach(async () => {
  await fs.rm(path.dirname(cacheDir), { recursive: true, force: true });
});

test("cacheStatus: nothing fetched yet", async () => {
  const st = await cacheStatus(cacheDir);
  expect(st.files).toBe(0);
  expect(st.asOf).toBeNull();
  expect(st.newest).toBeNull();
});

test("cacheStatus: asOf is the oldest cached file, newest the most recent", async () => {
  await cachedJSON(cacheDir, "old.json", async () => ["a"]);
  await cachedJSON(cacheDir, "new.json", async () => ["b"]);
  // Backdate one file so the two timestamps are distinguishable regardless
  // of how fast the two writes above land.
  const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  await fs.utimes(path.join(cacheDir, "old.json"), old, old);

  const st = await cacheStatus(cacheDir);
  expect(st.files).toBe(2);
  expect(new Date(st.asOf!).getTime()).toBeCloseTo(old.getTime(), -3);
  expect(new Date(st.newest!).getTime()).toBeGreaterThan(new Date(st.asOf!).getTime());
});

test("cacheStatus: a refresh reports its own time, not 'never fetched'", async () => {
  await cachedJSON(cacheDir, "old.json", async () => ["a"]);
  const before = Date.now();
  await refreshCache(cacheDir);

  const st = await cacheStatus(cacheDir);
  expect(st.files).toBe(0); // the marker itself is not counted as data
  expect(st.newest).toBeNull();
  expect(new Date(st.asOf!).getTime()).toBeGreaterThanOrEqual(before - 1000);
});
