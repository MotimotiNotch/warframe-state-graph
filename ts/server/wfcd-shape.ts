// Shape checks for the WFCD/warframe-items files this app reads (Issue #15).
//
// The data is pinned to a tag (WFCD_ITEMS_REF in wfcd.ts), and a tag's
// contents never change, so these can only fail right after the tag is
// bumped. WFCD #992 showed why that moment needs a check: `components[]`
// lost `name`/`drops` without any error, and parts silently stopped being
// generated. `bun run check:wfcd [tag]` runs these against every file before
// a bump; the fetchers run them too, as a net for a bump made without it.
//
// Only fields this app reads are checked. Mods.json has 14 drops without a
// location, for example, but Mods drops are never read, so that is not a
// failure.

export class ShapeError extends Error {
  constructor(
    readonly file: string,
    detail: string,
  ) {
    super(`WFCD ${file}: ${detail}`);
    this.name = "ShapeError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function where(i: number, entry: Record<string, unknown>): string {
  return typeof entry.uniqueName === "string" ? `[${i}] ${entry.uniqueName}` : `[${i}]`;
}

/** A category file (`Warframes.json`, `Components.json`, ...). `drops` is
 * checked only where it is read: Components.json since #992. */
export function checkItemList(file: string, data: unknown, opts: { drops?: boolean } = {}): void {
  if (!Array.isArray(data)) throw new ShapeError(file, "expected an array of items");
  if (data.length === 0) throw new ShapeError(file, "empty item list");
  data.forEach((entry: unknown, i) => {
    if (!isObject(entry)) throw new ShapeError(file, `[${i}] is not an object`);
    if (typeof entry.name !== "string") throw new ShapeError(file, `${where(i, entry)}: name is not a string`);
    if (typeof entry.uniqueName !== "string") throw new ShapeError(file, `${where(i, entry)}: uniqueName is not a string`);
    if (entry.components !== undefined) {
      if (!Array.isArray(entry.components)) throw new ShapeError(file, `${where(i, entry)}: components is not an array`);
      entry.components.forEach((c: unknown, j) => {
        // cachedItemsFull() resolves a part by uniqueName, or uses its
        // embedded name (the pre-#992 shape); a part with neither can't be named.
        if (!isObject(c) || (typeof c.uniqueName !== "string" && typeof c.name !== "string")) {
          throw new ShapeError(file, `${where(i, entry)}: components[${j}] has neither uniqueName nor name`);
        }
      });
    }
    if (opts.drops && entry.drops !== undefined) {
      if (!Array.isArray(entry.drops)) throw new ShapeError(file, `${where(i, entry)}: drops is not an array`);
      entry.drops.forEach((d: unknown, j) => {
        if (!isObject(d) || typeof d.location !== "string" || typeof d.chance !== "number") {
          throw new ShapeError(file, `${where(i, entry)}: drops[${j}] lacks location/chance`);
        }
      });
    }
  });
}

/** `i18n/<lang>.json`: `{ [uniqueName]: { name, ... } }`. Not every entry
 * has a name (1406 of 19216 in ja at v1.1276.1), so the check is that most
 * do — the pre-#992 shape nested one level deeper (`{ ja: { name } }`), where
 * none would. */
export function checkI18n(file: string, data: unknown): void {
  if (!isObject(data)) throw new ShapeError(file, "expected an object keyed by uniqueName");
  const values = Object.values(data);
  if (values.length === 0) throw new ShapeError(file, "no entries");
  const named = values.filter((v) => isObject(v) && typeof v.name === "string").length;
  if (named < values.length / 2) {
    throw new ShapeError(file, `only ${named} of ${values.length} entries have a string name`);
  }
}
