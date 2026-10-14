// Ported 1:1 from pkg/stats/store_test.go.
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { GatingQuests, StatsStore, TektolystArtifacts, TektolystModSlots } from "./stats.ts";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wsg-stats-test-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("FileStore: setPlanetProgress persists and reloads", async () => {
  const filePath = path.join(tmpDir, "stats.json");
  const store = new StatsStore(filePath);

  await store.setPlanetProgress("Earth", { cleared: 12, steelPathCleared: 4 });

  const reloaded = await new StatsStore(filePath).load();
  expect(reloaded.planets["Earth"]).toEqual({ cleared: 12, steelPathCleared: 4 });
});

test("FileStore: setIntrinsics persists and reloads", async () => {
  const filePath = path.join(tmpDir, "stats.json");
  const store = new StatsStore(filePath);

  await store.setRailjackIntrinsic("Piloting", 7);
  await store.setDrifterIntrinsic("Riding", 5);

  const reloaded = await new StatsStore(filePath).load();
  expect(reloaded.railjackIntrinsics["Piloting"]).toBe(7);
  expect(reloaded.drifterIntrinsics["Riding"]).toBe(5);
  // Untouched categories should still be present at 0.
  expect(reloaded.railjackIntrinsics["Tactical"]).toBe(0);
});

test("FileStore: setFocus persists and reloads", async () => {
  const filePath = path.join(tmpDir, "stats.json");
  const store = new StatsStore(filePath);

  await store.setFocusInvestment("Zenurik", "maxed");
  await store.setFocusActiveSchool("Zenurik");

  const reloaded = await new StatsStore(filePath).load();
  expect(reloaded.focusInvestment["Zenurik"]).toBe("maxed");
  expect(reloaded.focusActiveSchool).toBe("Zenurik");
  // Untouched schools should still be present at not_invested.
  expect(reloaded.focusInvestment["Madurai"]).toBe("not_invested");
});

test("FileStore: setRailjackComponent and plexus note persist and reload", async () => {
  const filePath = path.join(tmpDir, "stats.json");
  const store = new StatsStore(filePath);

  await store.setRailjackComponent("Reactor", { house: "Vidar", grade: "Mk III" });
  await store.setRailjackPlexusNote("Battle 3x Tactical 1x");

  const reloaded = await new StatsStore(filePath).load();
  expect(reloaded.railjackComponents["Reactor"]).toEqual({ house: "Vidar", grade: "Mk III" });
  expect(reloaded.railjackPlexusNote).toBe("Battle 3x Tactical 1x");
  // Untouched slots should still be present, unset.
  expect(reloaded.railjackComponents["Engines"]).toEqual({ house: "", grade: "" });
});

// Issue #39: Tektolyst Artifacts, one per Focus School.
test("FileStore: Tektolyst owned and mods persist; slots keep their position", async () => {
  const filePath = path.join(tmpDir, "stats.json");
  const store = new StatsStore(filePath);

  await store.setTektolystArtifact("Zenurik", { owned: true });
  await store.setTektolystArtifact("Zenurik", { mods: ["", "Omn-Evi"] }); // slot 1 only

  const reloaded = await new StatsStore(filePath).load();
  expect(reloaded.tektolystArtifacts["Zenurik"]).toEqual({ owned: true, mods: ["", "Omn-Evi", "", "", ""] });
  // Setting mods alone leaves owned as it was, and vice versa.
  await store.setTektolystArtifact("Zenurik", { owned: false });
  expect((await store.load()).tektolystArtifacts["Zenurik"]!.mods[1]).toBe("Omn-Evi");
  // Untouched schools are present, not owned, with empty slots.
  expect(reloaded.tektolystArtifacts["Madurai"]).toEqual({ owned: false, mods: Array(TektolystModSlots).fill("") });
});

test("FileStore: stats saved before #39 load with every Tektolyst entry and the new gating quest backfilled", async () => {
  const filePath = path.join(tmpDir, "stats.json");
  await fs.writeFile(filePath, JSON.stringify({ schemaVersion: 1, questsCleared: { "The Second Dream": true } }), "utf8");

  const d = await new StatsStore(filePath).load();
  expect(Object.keys(d.tektolystArtifacts).sort()).toEqual(Object.keys(TektolystArtifacts).sort());
  expect(d.questsCleared["The Second Dream"]).toBe(true);
  expect(d.questsCleared["The Old Peace"]).toBe(false);
  expect(GatingQuests).toContain("The Old Peace");
});
