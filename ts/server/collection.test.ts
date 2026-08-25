// No Go tests exist for pkg/collection to port 1:1 (checked: no
// pkg/collection/*_test.go). This is a lightweight round-trip smoke test
// following the same beforeEach/afterEach tmpDir pattern as
// standing.test.ts/loadout store tests, covering one representative entity
// per upsert/delete shape rather than all 8 (the 8 types are structurally
// near-identical, see collection.ts's own comment).
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CollectionStore } from "./collection.ts";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wsg-collection-test-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("CollectionStore: upsertRiven persists and reloads", async () => {
  const filePath = path.join(tmpDir, "collections.json");
  const store = new CollectionStore(filePath);

  await store.upsertRiven({
    id: "riven1",
    weaponName: "Dragon Nikana",
    positiveStats: ["Critical Chance", "Attack Speed"],
    positiveValues: [120.5, 15.2],
    fixed: true,
    favorite: false,
  });

  const reloaded = await new CollectionStore(filePath).load();
  expect(reloaded.rivens["riven1"]?.weaponName).toBe("Dragon Nikana");
  expect(reloaded.rivens["riven1"]?.fixed).toBe(true);
});

test("CollectionStore: deleteFrame removes the entry", async () => {
  const filePath = path.join(tmpDir, "collections.json");
  const store = new CollectionStore(filePath);

  await store.upsertFrame({ id: "frame1", name: "Excalibur", owned: true, rankedThirty: false, helminthFed: false });
  let d = await store.load();
  expect(d.frames["frame1"]).toBeDefined();

  await store.deleteFrame("frame1");
  d = await store.load();
  expect(d.frames["frame1"]).toBeUndefined();
});

test("CollectionStore: upsertKuva and upsertIncarnon coexist independently", async () => {
  const filePath = path.join(tmpDir, "collections.json");
  const store = new CollectionStore(filePath);

  await store.upsertKuva({ id: "kuva1", weaponName: "Kuva Nukor", kind: "Kuva", owned: true, favorite: true });
  await store.upsertIncarnon({ id: "inc1", weaponName: "Braton", obtained: true, completed: false });

  const reloaded = await new CollectionStore(filePath).load();
  expect(reloaded.kuva["kuva1"]?.kind).toBe("Kuva");
  expect(reloaded.incarnons["inc1"]?.obtained).toBe(true);
  expect(reloaded.incarnons["inc1"]?.completed).toBe(false);
});
