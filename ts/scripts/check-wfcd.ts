// Checks a warframe-items tag before WFCD_ITEMS_REF is bumped (Issue #15).
//
//   bun run check:wfcd              # the pinned tag only (shape check)
//   bun run check:wfcd v1.1277.0    # the new tag: shape check + what changes
//
// A shape check alone would not have caught all of WFCD #992: parts made of
// Misc items lost their drops, which is a valid shape. So with a new tag this
// also builds both tags' items the way the app does (cachedItemsFull() +
// classifyParadigm(), from seeded temporary caches) and lists every item
// whose paradigm or part names change. Read that list before bumping.
//
// Exit codes (the wfcd-watch workflow opens an Issue on 1 or 2):
//   0  nothing that affects this app — at most new items
//   1  a file failed its shape check
//   2  existing items would be generated differently (paradigm / part
//      names) or disappeared
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  CategoryComponents,
  CategoryGear,
  CategoryMelee,
  CategoryMisc,
  CategoryPrimary,
  CategoryResources,
  CategorySecondary,
  CategoryWarframes,
  WFCD_ITEMS_FILES,
  WFCD_ITEMS_REF,
  cachedItemsFull,
  wfcdItemsURL,
  type Item,
} from "../server/wfcd.ts";
import { checkI18n, checkItemList } from "../server/wfcd-shape.ts";
import { classifyParadigm } from "../server/wfcdgen.ts";

// What the WFCD wizard can generate from (main.ts: Frame -> Warframes,
// Weapon -> weaponCategories), and what cachedItemsFull() resolves parts from.
const WIZARD_CATEGORIES = [CategoryWarframes, CategoryPrimary, CategorySecondary, CategoryMelee];
const COMPONENT_SOURCES = [CategoryComponents, CategoryMisc, CategoryResources, CategoryPrimary, CategorySecondary, CategoryMelee, CategoryGear];

const newRef = process.argv[2];
const oldRef = WFCD_ITEMS_REF;

async function download(ref: string, file: string): Promise<unknown> {
  const url = wfcdItemsURL(file, ref);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: status ${res.status}`);
  return res.json();
}

/** Shape-checks every file at ref; returns the item files by category name. */
async function checkRef(ref: string): Promise<{ failed: number; items: Map<string, unknown> }> {
  let failed = 0;
  const items = new Map<string, unknown>();
  for (const f of WFCD_ITEMS_FILES) {
    try {
      const data = await download(ref, f.file);
      if (f.kind === "i18n") checkI18n(f.file, data);
      else checkItemList(f.file, data, { drops: f.drops });
      if (f.kind === "items") items.set(f.file.replace(/\.json$/, ""), data);
      console.log(`  ok    ${f.file}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${f.file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { failed, items };
}

interface Built {
  name: string;
  paradigm: string;
  parts: string;
}

/** Seeds a temporary cache with ref's files so cachedItemsFull() runs exactly
 * as in the app, without fetching. */
async function build(items: Map<string, unknown>): Promise<Map<string, Built>> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wsg-check-wfcd-"));
  try {
    for (const cat of new Set([...WIZARD_CATEGORIES, ...COMPONENT_SOURCES])) {
      const data = items.get(cat);
      if (data !== undefined) await fs.writeFile(path.join(dir, `${cat}-full.json`), JSON.stringify(data), "utf8");
    }
    const out = new Map<string, Built>();
    for (const cat of WIZARD_CATEGORIES) {
      for (const it of (await cachedItemsFull(dir, cat)) as Item[]) {
        const parts = (it.components ?? []).map((c) => c.name).join(", ");
        out.set(it.uniqueName ?? `${cat}/${it.name}`, { name: `${cat}/${it.name}`, paradigm: classifyParadigm(it), parts });
      }
    }
    return out;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

console.log(`shape check: ${newRef ?? oldRef}`);
const target = await checkRef(newRef ?? oldRef);
if (target.failed > 0) {
  console.log(`\n${target.failed} file(s) failed. Do not bump to ${newRef ?? oldRef} until the app handles the new shape.`);
  process.exit(1);
}
if (!newRef || newRef === oldRef) process.exit(0);

console.log(`\nwhat changes: ${oldRef} -> ${newRef}`);
const before = await build((await checkRef(oldRef)).items);
const after = await build(target.items);

console.log(`\ncompared ${before.size} -> ${after.size} items (${WIZARD_CATEGORIES.join(", ")})`);
const added = [...after.keys()].filter((k) => !before.has(k)).map((k) => after.get(k)!.name);
const removed = [...before.keys()].filter((k) => !after.has(k)).map((k) => before.get(k)!.name);
const paradigm: string[] = [];
const parts: string[] = [];
for (const [k, a] of after) {
  const b = before.get(k);
  if (!b) continue;
  if (a.paradigm !== b.paradigm) paradigm.push(`${a.name}: ${b.paradigm} -> ${a.paradigm}`);
  if (a.parts !== b.parts) parts.push(`${a.name}: [${b.parts}] -> [${a.parts}]`);
}
const section = (title: string, lines: string[]): void => {
  console.log(`\n${title} (${lines.length})`);
  for (const l of lines) console.log(`  ${l}`);
};
section("new items", added);
section("removed items", removed);
section("paradigm changed (these would be generated differently)", paradigm);
section("part names changed (existing nodes are matched by name)", parts);

// New items alone are what a bump is for; anything touching existing items
// is the kind of upstream change #992 was.
if (removed.length > 0 || paradigm.length > 0 || parts.length > 0) {
  console.log(`\nexisting items change: read the lists above before bumping to ${newRef}.`);
  process.exit(2);
}
