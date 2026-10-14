// No Go tests exist for pkg/wfcd to port 1:1 (checked: no pkg/wfcd/*_test.go).
// Lightweight unit tests for the pure, network-free helpers added in Phase
// 11 — the network-touching fetchers were smoke-tested manually against the
// live dev server instead (see the migration plan's verification notes).
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { cacheStatus, cachedItemsFull, cachedJSON, cachedSyndicates, findSyndicateWeaponRank, isRelicVaulted, lookupI18nName, refreshCache, syndicatesShrinkReason, WFCD_ITEMS_REF, wfcdItemsURL, type SyndicateEntry } from "./wfcd.ts";

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
  expect(st.ref).toBe(WFCD_ITEMS_REF);
  expect(st.shapeError).toBeNull();
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

// WFCD/warframe-items #992: components[] became bare references and i18n.json
// was split per language. These seed the cache directly so no fetch happens.
async function seed(files: Record<string, unknown>): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  for (const [name, v] of Object.entries(files)) await fs.writeFile(path.join(cacheDir, name), JSON.stringify(v), "utf8");
}

const BP = "/Lotus/Types/Recipes/WarframeRecipes/RhinoBlueprint";
const NEURODE = "/Lotus/Types/Items/MiscItems/Neurode";
const CAPSULE = "/Lotus/Types/Gameplay/InfestedMicroplanet/Resources/Mechs/ThanomechPartSystemsItem";
const CAPSULE_BP = "/Lotus/Types/Recipes/DeimosRecipes/Mechs/ThanotechPartSystemsBlueprint";
const capsuleDrop = { location: "NecraLoid (Loid), Clearance Modus", chance: 100 };

async function seedNewFormat(warframes: unknown[]): Promise<void> {
  await seed({
    "Warframes-full.json": warframes,
    "Components-full.json": [
      { uniqueName: BP, name: "Blueprint", category: "Components", drops: [{ location: "Mars/War (Assassination)", chance: 38.72 }] },
      { uniqueName: CAPSULE_BP, name: "Blueprint", category: "Components", drops: [capsuleDrop] },
    ],
    "Misc-full.json": [{ uniqueName: NEURODE, name: "Neurodes", category: "Misc" }],
    "Resources-full.json": [
      { uniqueName: CAPSULE, name: "Bonewidow Capsule", category: "Resources", components: [{ uniqueName: CAPSULE_BP, itemCount: 1 }] },
    ],
    "Primary-full.json": [],
    "Secondary-full.json": [],
    "Melee-full.json": [],
    "Gear-full.json": [],
  });
}

test("cachedItemsFull: fills name and drops back into bare component references", async () => {
  await seedNewFormat([{ name: "Rhino", components: [{ uniqueName: BP, itemCount: 1 }, { uniqueName: NEURODE, itemCount: 1 }] }]);
  const [rhino] = await cachedItemsFull(cacheDir, "Warframes");
  expect(rhino!.components!.map((c) => c.name)).toEqual(["Blueprint", "Neurodes"]);
  expect(rhino!.components![0]!.drops).toHaveLength(1);
  expect(rhino!.components![0]!.itemCount).toBe(1);
  expect(rhino!.components![1]!.drops).toBeUndefined(); // generic material: no drops of its own
});

test("cachedItemsFull: a material without drops takes its own blueprint's drops", async () => {
  await seedNewFormat([{ name: "Bonewidow", components: [{ uniqueName: CAPSULE, itemCount: 1 }] }]);
  const [bonewidow] = await cachedItemsFull(cacheDir, "Warframes");
  expect(bonewidow!.components![0]!.name).toBe("Bonewidow Capsule");
  expect(bonewidow!.components![0]!.drops).toEqual([capsuleDrop]);
});

test("cachedItemsFull: an unknown reference falls back to the path tail instead of a nameless part", async () => {
  await seedNewFormat([{ name: "X", components: [{ uniqueName: "/Lotus/Types/Unknown/ThingItem", itemCount: 1 }] }]);
  const [x] = await cachedItemsFull(cacheDir, "Warframes");
  expect(x!.components![0]!.name).toBe("ThingItem");
});

test("cachedItemsFull: a pre-#992 cache is returned as is (no other category is read)", async () => {
  const old = [{ name: "Rhino", components: [{ uniqueName: BP, name: "Blueprint", drops: [{ location: "old", chance: 1 }] }] }];
  await seed({ "Warframes-full.json": old }); // no Components-full.json: resolving would try to fetch
  expect(await cachedItemsFull(cacheDir, "Warframes")).toEqual(old);
});

test("lookupI18nName: reads the per-language file shape", async () => {
  await seed({ "i18n-ja.json": { [BP]: { name: "ライノ 設計図", description: "..." } } });
  expect(await lookupI18nName(cacheDir, BP, "ja")).toBe("ライノ 設計図");
  await expect(lookupI18nName(cacheDir, "/nope", "ja")).rejects.toThrow("not found");
});

test("lookupI18nName: rejects a lang that isn't a language code", async () => {
  await expect(lookupI18nName(cacheDir, BP, "../Warframes-full")).rejects.toThrow("invalid lang");
});

test("wfcdItemsURL: pinned to the tag, never master", () => {
  expect(WFCD_ITEMS_REF).toMatch(/^v\d+\.\d+\.\d+$/);
  expect(wfcdItemsURL("Warframes.json")).toBe(`https://raw.githubusercontent.com/WFCD/warframe-items/${WFCD_ITEMS_REF}/data/json/Warframes.json`);
});

test("a file failing its shape check is not cached, and shows in cacheStatus until the next refresh", async () => {
  const realFetch = globalThis.fetch;
  // The pre-#992 i18n shape, served where the per-language file is expected.
  globalThis.fetch = (async () => Response.json({ "/a": { ja: { name: "ライノ" } } })) as unknown as typeof fetch;
  try {
    await expect(lookupI18nName(cacheDir, "/a", "ja")).rejects.toThrow("WFCD i18n/ja.json");
  } finally {
    globalThis.fetch = realFetch;
  }
  const st = await cacheStatus(cacheDir);
  expect(st.shapeError?.file).toBe("i18n/ja.json");
  expect(st.files).toBe(0); // nothing written for the failed file

  await refreshCache(cacheDir);
  expect((await cacheStatus(cacheDir)).shapeError).toBeNull();
});

test("a file missing at the pinned tag (404) counts as a shape error too", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("404: Not Found", { status: 404 })) as unknown as typeof fetch;
  try {
    await expect(lookupI18nName(cacheDir, "/a", "ja")).rejects.toThrow("not found at");
  } finally {
    globalThis.fetch = realFetch;
  }
  expect((await cacheStatus(cacheDir)).shapeError?.file).toBe("i18n/ja.json");
});

// Issue #38: syndicates.json isn't pinned, and upstream breaks it by emptying
// it (2026-10-07: 15 of 18 syndicates empty), which no shape check sees.
function synTable(sizes: Record<string, number>): Record<string, SyndicateEntry[]> {
  const out: Record<string, SyndicateEntry[]> = {};
  for (const [name, n] of Object.entries(sizes)) {
    out[name] = Array.from({ length: n }, (_, i) => ({ item: `${name} item ${i}`, place: `${name}, Rank`, standing: 1000, chance: 1, rarity: "" }));
  }
  return out;
}
const healthy = () => synTable({ A: 10, B: 10, C: 10, D: 10 });
const broken = () => synTable({ A: 10, B: 0, C: 0, D: 0 });

function serveSyndicates(data: () => Record<string, SyndicateEntry[]>): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ syndicates: data() })) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

test("syndicatesShrinkReason: healthy table passes", () => {
  expect(syndicatesShrinkReason(healthy())).toBeNull();
  expect(syndicatesShrinkReason(healthy(), healthy())).toBeNull();
  expect(syndicatesShrinkReason(synTable({ A: 10, B: 10, C: 10, D: 0 }))).toBeNull(); // one empty isn't an outage
});

test("syndicatesShrinkReason: more than half empty, or under half the last good table", () => {
  expect(syndicatesShrinkReason(broken())).toContain("3/4 syndicates empty");
  expect(syndicatesShrinkReason({})).not.toBeNull();
  expect(syndicatesShrinkReason(synTable({ A: 4, B: 4, C: 4, D: 4 }), healthy())).toContain("last good table had 40");
});

test("cachedSyndicates: a broken table is not cached; the last good one is used until upstream recovers", async () => {
  let current = healthy;
  const restore = serveSyndicates(() => current());
  try {
    expect(Object.keys(await cachedSyndicates(cacheDir))).toHaveLength(4);
    expect((await cacheStatus(cacheDir)).dataWarning).toBeNull();

    // Upstream breaks; the user refreshes (which wipes the cache).
    current = broken;
    await refreshCache(cacheDir);
    const got = await cachedSyndicates(cacheDir);
    expect(got.B).toHaveLength(10); // the kept table, not the empty one
    const st = await cacheStatus(cacheDir);
    expect(st.dataWarning?.file).toBe("syndicates.json");
    expect(st.dataWarning?.keptAt).not.toBeNull();
    expect(st.files).toBe(0); // the broken table was not cached

    // Upstream recovers: the next call fetches again on its own, no refresh needed.
    current = healthy;
    expect((await cachedSyndicates(cacheDir)).B).toHaveLength(10);
    expect((await cacheStatus(cacheDir)).dataWarning).toBeNull();
    expect((await cacheStatus(cacheDir)).files).toBe(1);
  } finally {
    restore();
  }
});

test("cachedSyndicates: a broken table with nothing kept throws, so the rank suggestion is skipped", async () => {
  const restore = serveSyndicates(broken);
  try {
    await expect(cachedSyndicates(cacheDir)).rejects.toThrow("looks broken upstream");
  } finally {
    restore();
  }
  const st = await cacheStatus(cacheDir);
  expect(st.dataWarning?.keptAt).toBeNull();
  expect(st.files).toBe(0);
  await refreshCache(cacheDir);
  expect((await cacheStatus(cacheDir)).dataWarning).toBeNull();
});

test("cachedSyndicates: a broken table already in the cache (from before #38) is fetched again", async () => {
  await cachedJSON(cacheDir, "syndicates.json", async () => broken());
  const restore = serveSyndicates(healthy);
  try {
    expect((await cachedSyndicates(cacheDir)).B).toHaveLength(10);
  } finally {
    restore();
  }
});
