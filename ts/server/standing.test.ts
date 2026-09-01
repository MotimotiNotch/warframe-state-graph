// Ported 1:1 from pkg/standing/model_test.go.
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  ALL_SYNDICATES,
  findSyndicate,
  maxRank,
  minRank,
  newData,
  rankLabel,
  recoverySacrifice,
  StandingStore,
} from "./standing.ts";

test("rankLabel", () => {
  const cases: [string, number, string][] = [
    ["Red Veil", 0, "Neutral (Rank 0)"],
    ["Red Veil", 1, "Respected (Rank 1)"],
    ["Red Veil", 5, "Exalted (Rank 5)"],
    ["Steel Meridian", 3, "Defender (Rank 3)"],
    ["Red Veil", -2, "敵対 (Rank -2)"],
  ];
  for (const [syndicate, rank, want] of cases) {
    expect(rankLabel(syndicate, rank)).toBe(want);
  }
});

test("newData initializes all syndicates to neutral", () => {
  const d = newData();
  expect(Object.keys(d.ranks).length).toBe(ALL_SYNDICATES.length);
  for (const s of ALL_SYNDICATES) {
    expect(d.ranks[s.name]).toBe(0);
  }
});

test("SyndicateInfo min/max rank", () => {
  const cases: [string, number, number][] = [
    ["Red Veil", -2, 5],
    ["Necraloid", 0, 3],
    ["The Quills", 0, 5],
    ["Kahl's Garrison", 0, 5],
    ["Operational Supply", 0, 3],
    ["Cavia", 0, 5],
    ["The Hex", 0, 5],
  ];
  for (const [name, wantMin, wantMaxRank] of cases) {
    const s = findSyndicate(name);
    expect(s).toBeDefined();
    expect(minRank(s!)).toBe(wantMin);
    expect(maxRank(s!)).toBe(wantMaxRank);
  }
});

// Guards the count the UI copy states out loud ("全18シンジケート" / "all 18
// syndicates" in standing.html, standing.ts, manual.ts and both READMEs) —
// adding a syndicate without updating that copy should fail here, not ship.
test("syndicate roster: 18 entries, unique names", () => {
  expect(ALL_SYNDICATES.length).toBe(18);
  expect(ALL_SYNDICATES.filter((s) => s.faction === "none").length).toBe(12);
  expect(new Set(ALL_SYNDICATES.map((s) => s.name)).size).toBe(ALL_SYNDICATES.length);
});

test("all syndicates: ranks and sacrifices lengths match", () => {
  for (const s of ALL_SYNDICATES) {
    expect(s.sacrifices.length).toBe(s.ranks.length);
  }
});

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wsg-standing-test-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("FileStore: setRank persists and reloads", async () => {
  const filePath = path.join(tmpDir, "standing.json");
  const store = new StandingStore(filePath);

  await store.setRank("Red Veil", 4);
  await store.setRank("The Perrin Sequence", -2);

  await expect(fs.stat(filePath)).resolves.toBeDefined();

  const reloaded = await new StandingStore(filePath).load();
  expect(reloaded.ranks["Red Veil"]).toBe(4);
  expect(reloaded.ranks["The Perrin Sequence"]).toBe(-2);
  expect(reloaded.ranks["Steel Meridian"]).toBe(0);
});

test("FileStore: highestRankReached tracks max and ignores demotion", async () => {
  const filePath = path.join(tmpDir, "standing.json");
  const store = new StandingStore(filePath);

  await store.setRank("Red Veil", 5);
  await store.setRank("Red Veil", -2);
  let d = await store.load();
  expect(d.ranks["Red Veil"]).toBe(-2);
  expect(d.highestRankReached["Red Veil"]).toBe(5);

  await store.setRank("Red Veil", 3);
  d = await store.load();
  expect(d.highestRankReached["Red Veil"]).toBe(5);
});

test("FileStore: setHighestRankReached overwrites directly", async () => {
  const filePath = path.join(tmpDir, "standing.json");
  const store = new StandingStore(filePath);

  await store.setRank("Cephalon Suda", 5);
  await store.setRank("Cephalon Suda", 2);
  const d = await store.setHighestRankReached("Cephalon Suda", 2);
  expect(d.highestRankReached["Cephalon Suda"]).toBe(2);
  expect(d.ranks["Cephalon Suda"]).toBe(2);

  const reloaded = await new StandingStore(filePath).load();
  expect(reloaded.highestRankReached["Cephalon Suda"]).toBe(2);
});

test("FileStore: highestRankReached migrates from legacy file without the field", async () => {
  const filePath = path.join(tmpDir, "standing.json");
  const legacy = `{"schemaVersion":1,"ranks":{"Red Veil":4,"The Perrin Sequence":-1}}`;
  await fs.writeFile(filePath, legacy);

  const d = await new StandingStore(filePath).load();
  expect(d.highestRankReached["Red Veil"]).toBe(4);
  expect(d.highestRankReached["The Perrin Sequence"]).toBe(0);
});

test("recoverySacrifice", () => {
  const cases: [string, string][] = [
    ["Red Veil", "Orokin Catalyst×1"],
    ["Cephalon Suda", "Orokin Catalyst×1"],
    ["The Perrin Sequence", "Orokin Reactor×1"],
  ];
  for (const [syndicate, want] of cases) {
    const got = recoverySacrifice(syndicate);
    expect(got.items?.length).toBe(1);
    expect(got.items?.[0]).toBe(want);
  }
});

test("recoverySacrifice: empty for non-hostile syndicate", () => {
  const got = recoverySacrifice("The Quills");
  expect(got.items?.length ?? 0).toBe(0);
  expect(got.none).toBeFalsy();
  expect(got.unconfirmed).toBeFalsy();
});
