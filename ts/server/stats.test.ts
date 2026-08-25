// Ported 1:1 from pkg/stats/store_test.go.
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { StatsStore } from "./stats.ts";

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
