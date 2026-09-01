// Port of pkg/wfcd. Started as the on-demand name-list fetchers backing
// /api/reference/* (Loadouts item-add autocomplete); Phase 11 added the
// remaining pieces wfcdgen.ts needs: full-item fetch/cache (items.go),
// relic-vault detection (relics.go), syndicate weapon-rank lookup
// (syndicates.go), and i18n name lookup (i18n.go — ported as a plain
// cachedJSON<Record<...>> read rather than Go's streaming token decoder; a
// spike test on this host (2026-08-25) measured fetch 3.8s + body-read 1.9s
// + JSON.parse 99ms + ~106MB heap delta for the real 52MB i18n.json, well
// within budget for a single-user local tool — the streaming approach was a
// Go-specific mitigation for encoding/json.Decoder's allocation behavior,
// not a hard requirement V8's JSON.parse shares).
//
// Note this host has a known curl/schannel TLS quirk; Go's net/http and (per
// the same finding) undici/Bun's fetch are both unaffected — see the Go
// package doc comment.

import * as fs from "node:fs/promises";
import * as path from "node:path";

// warframe-items stays on GitHub raw: warframestat.us serves its own merged
// item API (api.warframestat.us/items, one 40MB array in a different shape),
// not the per-category files this code reads, so there is no drop-in mirror
// for these the way there is for warframe-drop-data below (checked
// 2026-09-01).
const MOD_SOURCE_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Mods.json";
const QUEST_SOURCE_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Quests.json";
const ARCHWING_SOURCE_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Archwing.json";
const WEAPON_SOURCE_URLS = [
  "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Primary.json",
  "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Secondary.json",
  "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Melee.json",
];

// Category file names under warframe-items/data/json/ (items.go's constants).
export const CategoryWarframes = "Warframes";
export const CategoryPrimary = "Primary";
export const CategorySecondary = "Secondary";
export const CategoryMelee = "Melee";
export const CategoryArchwing = "Archwing";
export const CategoryArchGun = "Arch-Gun";
export const CategoryArchMelee = "Arch-Melee";
export const CategorySentinels = "Sentinels";
export const CategorySentinelWeapons = "SentinelWeapons";
export const CategoryPets = "Pets";
export const CategoryMods = "Mods";
export const CategoryArcanes = "Arcanes";
export const CategoryRelics = "Relics";
export const CategoryResources = "Resources";
export const CategoryMisc = "Misc";

export const weaponCategories = [CategoryPrimary, CategorySecondary, CategoryMelee];

function itemsCategoryURL(category: string): string {
  return `https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/${category}.json`;
}

interface NameEntry {
  name?: string;
}

async function fetchNames(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: status ${res.status}`);
  const entries = (await res.json()) as NameEntry[];
  return entries.filter((e) => e.name).map((e) => e.name!);
}

export interface Drop {
  location: string;
  chance: number;
}

export interface Component {
  name: string;
  itemCount?: number;
  drops?: Drop[];
}

// Item is a subset of a warframe-items entry — only what node-generation
// (wfcdgen.ts) plus the frame/necramech split (productCategory) and
// companion Type filter need. Other schema fields are ignored (parsing
// extra JSON keys into an object is harmless).
export interface Item {
  uniqueName?: string;
  name: string;
  category?: string;
  type?: string; // Misc.json's "Zaw Component" / "Kitgun Component" / "Amp" etc.
  tags?: string[];
  components?: Component[];
  productCategory?: string;
  // Riven weapon-archetype detection (item 2 scope, added 2026-08-17).
  disposition?: number;
  criticalChance?: number;
  criticalMultiplier?: number;
  procChance?: number;
}

export async function fetchItemsFull(category: string): Promise<Item[]> {
  const url = itemsCategoryURL(category);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: status ${res.status}`);
  return (await res.json()) as Item[];
}

/** Per-category full-item fetch with caching (unlike CachedNames, keeps
 * components/drops/disposition etc. that node generation needs). */
export async function cachedItemsFull(cacheDir: string, category: string): Promise<Item[]> {
  return cachedJSON(cacheDir, `${category}-full.json`, () => fetchItemsFull(category));
}

/** Exact-name (case-insensitive) lookup within an already-fetched item list. */
export function findItemByName(items: Item[], name: string): Item | undefined {
  const key = name.toLowerCase();
  return items.find((it) => it.name.toLowerCase() === key);
}

/** Reads cacheDir/cacheFile as JSON if present, else calls fetch() and writes it there. */
export async function cachedJSON<T>(cacheDir: string, cacheFile: string, fetchFn: () => Promise<T>): Promise<T> {
  const p = path.join(cacheDir, cacheFile);
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T;
  } catch {
    // missing, unreadable, or corrupt cache entry: fall through to re-fetch
  }
  const v = await fetchFn();
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(p, JSON.stringify(v, null, 2), "utf8");
  } catch {
    // best-effort cache write; the fetched value is still returned either way
  }
  return v;
}

/** Same as cachedJSON, but sorts the name list before caching (name lists only). */
export async function cachedNames(cacheDir: string, cacheFile: string, fetchFn: () => Promise<string[]>): Promise<string[]> {
  return cachedJSON(cacheDir, cacheFile, async () => {
    const names = await fetchFn();
    names.sort();
    return names;
  });
}

// Written by refreshCache() and read by cacheStatus(); excluded from the
// status scan itself so it never counts as cached data. Without it, the
// moment right after a refresh (cache emptied, nothing re-fetched yet) has
// no timestamp to report at all, and the UI would have to say "not fetched"
// about data that is in fact about to be fetched fresh.
const REFRESH_MARKER = "refreshed-at.txt";

/** Deletes the whole cache directory; every endpoint re-fetches lazily on next access. */
export async function refreshCache(cacheDir: string): Promise<void> {
  await fs.rm(cacheDir, { recursive: true, force: true });
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, REFRESH_MARKER), new Date().toISOString(), "utf8");
  } catch {
    // best-effort: losing the marker only costs the "as of" display its
    // reading between the refresh and the first re-fetch, not the refresh
  }
}

export interface CacheStatus {
  /** Oldest cached file's fetch time, or the last refresh when nothing is
   * cached yet — i.e. "no data shown here was fetched before this". */
  asOf: string | null;
  /** Newest cached file's fetch time. null when nothing is cached. */
  newest: string | null;
  /** Number of cached data files (the refresh marker isn't one). */
  files: number;
}

/** How stale the WFCD data can be, from the cache's own mtimes — each file
 * is fetched on first use and then kept until a refresh, so the oldest one
 * bounds the whole set. Anything not cached yet gets fetched fresh on next
 * access, which is why an empty cache reports the refresh time rather than
 * "unknown". */
export async function cacheStatus(cacheDir: string): Promise<CacheStatus> {
  let names: string[];
  try {
    names = await fs.readdir(cacheDir);
  } catch {
    return { asOf: null, newest: null, files: 0 }; // never fetched (fresh install)
  }
  let oldestMs = Infinity;
  let newestMs = -Infinity;
  let files = 0;
  for (const name of names) {
    if (name === REFRESH_MARKER) continue;
    let st;
    try {
      st = await fs.stat(path.join(cacheDir, name));
    } catch {
      continue; // deleted between readdir and stat
    }
    if (!st.isFile()) continue;
    files++;
    oldestMs = Math.min(oldestMs, st.mtimeMs);
    newestMs = Math.max(newestMs, st.mtimeMs);
  }
  if (files > 0) {
    return { asOf: new Date(oldestMs).toISOString(), newest: new Date(newestMs).toISOString(), files };
  }
  let refreshedAt: string | null = null;
  try {
    refreshedAt = (await fs.readFile(path.join(cacheDir, REFRESH_MARKER), "utf8")).trim() || null;
  } catch {
    // no marker: cache directory exists but was never populated or refreshed
  }
  return { asOf: refreshedAt, newest: null, files: 0 };
}

// Warframes.json holds warframe bodies (productCategory "Suits") alongside
// Necramechs ("MechSuits", Voidrig/Bonewidow) and special units
// ("SpecialItems", Orion & Sirius) — filtered here (2026-08-23 finding, was
// previously unfiltered).
export async function fetchFrameNames(): Promise<string[]> {
  const items = await fetchItemsFull(CategoryWarframes);
  return items.filter((it) => it.productCategory === "Suits").map((it) => it.name);
}

/** No standalone Necramechs.json exists on WFCD (confirmed 404); they live in Warframes.json. */
export async function fetchNecramechNames(): Promise<string[]> {
  const items = await fetchItemsFull(CategoryWarframes);
  return items.filter((it) => it.productCategory === "MechSuits").map((it) => it.name);
}

export async function fetchArchwingNames(): Promise<string[]> {
  return fetchNames(ARCHWING_SOURCE_URL);
}

/** Mods.json has rarity-variant duplicates under the same name; deduped. */
export async function fetchModNames(): Promise<string[]> {
  const names = await fetchNames(MOD_SOURCE_URL);
  return [...new Set(names)];
}

// Main + side quests (Quests.json, 46 entries confirmed 2026-08-22). Unlike
// questchain.MainStoryChain (the prerequisite-carrying main-story subset),
// this backs Stats "quest progress" where only "did I actually clear this"
// matters, so it uses the full list including side quests.
export async function fetchQuestNames(): Promise<string[]> {
  return fetchNames(QUEST_SOURCE_URL);
}

export async function fetchWeaponNames(): Promise<string[]> {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const url of WEAPON_SOURCE_URLS) {
    for (const n of await fetchNames(url)) {
      if (!seen.has(n)) {
        seen.add(n);
        names.push(n);
      }
    }
  }
  return names;
}

// Pets.json mixes companion bodies (Type "Pets") with Pet Parts/Pet Resource
// (breeding materials); MOAs live in Pets.json too, Sentinels are a separate
// all-Sentinel-type file, combined here.
export async function fetchCompanionNames(): Promise<string[]> {
  const [pets, sentinels] = await Promise.all([fetchItemsFull(CategoryPets), fetchItemsFull(CategorySentinels)]);
  const names = pets.filter((it) => it.type === "Pets").map((it) => it.name);
  names.push(...sentinels.map((it) => it.name));
  return names;
}

/** Resources.json (241 entries, Resource/Gem/Plant mixed, unfiltered) alone
 * is missing the common basic-crafting resources (Rubedo, Salvage, Circuits,
 * Plastids, Orokin Cell, ...) — WFCD files those under Misc.json instead,
 * type:"Resource" among ~1250 unrelated Zaw/Kitgun/Amp components (confirmed
 * 2026-08-28), so merged in filtered to that type. */
export async function fetchResourceNames(): Promise<string[]> {
  const [resources, misc] = await Promise.all([
    fetchNames(itemsCategoryURL(CategoryResources)),
    fetchItemsFull(CategoryMisc),
  ]);
  const names = new Set(resources);
  for (const it of misc) if (it.type === "Resource") names.add(it.name);
  return [...names];
}

// Relics.json (3120 entries confirmed 2026-08-28) has 4 refinement-tier rows
// per base relic ("Axi A1 Intact/Exceptional/Flawless/Radiant"), unlike
// missionRewards.json's drop-table strings this suffix is a plain trailing
// word (no parens) — dedupe strips it directly rather than reusing
// normalizeRelicName(), which targets the other format.
const RELIC_TIER_SUFFIX = / (Intact|Exceptional|Flawless|Radiant)$/;

/** Base relic names (era+tier code only, e.g. "Axi A1") deduped across
 * refinement rows. Sourced from Relics.json rather than
 * fetchActiveRelicNames()'s missionRewards.json walk so vaulted relics are
 * included too — a node candidate list should cover things worth tracking
 * as a goal, not just currently-farmable ones. */
export async function fetchRelicNames(): Promise<string[]> {
  const items = await fetchItemsFull(CategoryRelics);
  return [...new Set(items.map((it) => it.name.replace(RELIC_TIER_SUFFIX, "")))];
}

// ---------------------------------------------------------------------------
// relics.go: relic-vault detection + Prime Resurgence (Varzia) rotation.

// drops.warframestat.us is WFCD's own delivery host for warframe-drop-data;
// GitHub raw is the development host (rate-limited, not a CDN, and pinned to
// whatever `master` happens to look like). Both bodies verified
// byte-identical (sha256 over the full response, 2026-09-01) before the
// switch, so this is a delivery change only.
const MISSION_REWARDS_URL = "https://drops.warframestat.us/data/missionRewards.json";

// Recognized relic era prefixes. "Vanguard" (2026-08-27) is a special-named
// Axi-tier relic series from Prime Resurgence — wiki.warframe.com/w/Vanguard_Relic:
// "a series of Axi Void Relics released through Prime Resurgence shortly
// after Update 41" (C1/E1/M1/P1) — not a genuine 5th era; its WFCD-side drop
// names just don't literally start with "Axi". Exported so wfcdgen.ts's
// separate extraction regex builds from this same list instead of
// hardcoding its own copy — a second hardcoded copy is exactly how this
// omission (Vanguard mis-classified as a non-relic mission drop, vault
// status never checked) went unnoticed until now.
export const RELIC_ERA_PREFIX = "Lith|Meso|Neo|Axi|Vanguard";

// Matches a bare relic name value in the mission-rewards tree (e.g. "Axi A22
// Relic (Radiant)"). missionRewards.json's exact nesting (planet -> node ->
// rotation -> reward) can change between versions, so this scans every
// string value structure-agnostically rather than depending on the shape.
const RELIC_NAME_PATTERN = new RegExp(`^(${RELIC_ERA_PREFIX}) [A-Z]\\d{1,2}(?: Relic)?(?: \\([^)]*\\))?$`);

// "Axi A22 Relic (Radiant)" -> "Axi A22" (missionRewards.json's format), and
// "Lith T13 Intact" -> "Lith T13" (Relics.json's own `name` field format —
// refinement as a bare trailing word, not a parenthetical). Refinement state
// doesn't affect vault status; a real relic base name never ends with one of
// these 4 words, so stripping it is always safe.
const REFINEMENT_SUFFIX = / (Intact|Exceptional|Flawless|Radiant)$/;
function normalizeRelicName(name: string): string {
  let n = name.trim();
  const parenIdx = n.indexOf(" (");
  if (parenIdx >= 0) n = n.slice(0, parenIdx);
  n = n.replace(/ Relic$/, "");
  n = n.replace(REFINEMENT_SUFFIX, "");
  return n.trim();
}

/** Scans missionRewards.json once and returns the set of every relic name
 * currently in the drop table (2026-08-19-verified approach). A relic not
 * in this set is presumed Vaulted. */
export async function fetchActiveRelicNames(): Promise<Set<string>> {
  const res = await fetch(MISSION_REWARDS_URL);
  if (!res.ok) throw new Error(`fetch ${MISSION_REWARDS_URL}: status ${res.status}`);
  const raw: unknown = await res.json();

  const active = new Set<string>();
  function walk(v: unknown): void {
    if (typeof v === "string") {
      if (RELIC_NAME_PATTERN.test(v)) active.add(normalizeRelicName(v));
    } else if (Array.isArray(v)) {
      for (const e of v) walk(e);
    } else if (v && typeof v === "object") {
      for (const e of Object.values(v)) walk(e);
    }
  }
  walk(raw);
  return active;
}

export async function cachedActiveRelicNames(cacheDir: string): Promise<Set<string>> {
  const list = await cachedJSON(cacheDir, "active-relics.json", async () => [...(await fetchActiveRelicNames())]);
  return new Set(list);
}

/** relicName (normalized) -> count of distinct mission/rotation reward slots
 * currently dropping it (2026-08-28, wfcd-wizard.ts's 入手先 selection —
 * のっち wanted to see how many missions a chosen relic drops from, but a
 * full location list turned out huge — 8〜127 slots per relic, median 80 —
 * so just the count). A relic absent from missionRewards.json (same signal
 * fetchActiveRelicNames() uses for Vaulted) simply has no entry / count 0.
 *
 * `path.slice(0, -1).join("/")` (everything above the leaf itemName key,
 * array indices included) is used as the per-slot uniqueness key rather
 * than reconstructing a human-readable "planet/node, Rotation X" string —
 * the count is all that's displayed, so the key only needs to be unique per
 * JSON location, not readable, which keeps this robust to missionRewards.json's
 * nesting shifting between versions (same reasoning as the structure-agnostic
 * walk above). */
export async function fetchRelicMissionCounts(): Promise<Map<string, number>> {
  const res = await fetch(MISSION_REWARDS_URL);
  if (!res.ok) throw new Error(`fetch ${MISSION_REWARDS_URL}: status ${res.status}`);
  const raw: unknown = await res.json();

  const slotsByRelic = new Map<string, Set<string>>();
  function walk(v: unknown, path: string[]): void {
    if (typeof v === "string") {
      if (RELIC_NAME_PATTERN.test(v)) {
        const name = normalizeRelicName(v);
        const slotKey = path.slice(0, -1).join("/");
        const slots = slotsByRelic.get(name);
        if (slots) slots.add(slotKey);
        else slotsByRelic.set(name, new Set([slotKey]));
      }
    } else if (Array.isArray(v)) {
      v.forEach((e, i) => walk(e, path.concat(String(i))));
    } else if (v && typeof v === "object") {
      for (const [k, e] of Object.entries(v)) walk(e, path.concat(k));
    }
  }
  walk(raw, []);

  const counts = new Map<string, number>();
  for (const [name, slots] of slotsByRelic) counts.set(name, slots.size);
  return counts;
}

export async function cachedRelicMissionCounts(cacheDir: string): Promise<Map<string, number>> {
  const entries = await cachedJSON(cacheDir, "relic-mission-counts.json", async () => [...(await fetchRelicMissionCounts()).entries()]);
  return new Map(entries);
}

/** relicName may carry a refinement suffix or "Relic" suffix; normalized before the lookup. */
export function isRelicVaulted(activeRelics: Set<string>, relicName: string): boolean {
  return !activeRelics.has(normalizeRelicName(relicName));
}

/** relicName may carry a refinement suffix or "Relic" suffix; normalized
 * before the lookup, same as isRelicVaulted. 0 for a relic missing from the
 * map — Vaulted relics never appear in missionRewards.json in the first
 * place, so this is already the correct "not currently mission-droppable"
 * answer rather than a fallback needing special-casing. */
export function relicMissionCount(counts: Map<string, number>, relicName: string): number {
  return counts.get(normalizeRelicName(relicName)) ?? 0;
}

const VAULT_TRADER_URL = "https://api.warframestat.us/pc/vaultTrader";

export interface VaultTraderEntry {
  item: string;
  ducats: number;
  credits: number;
}

export interface VaultTrader {
  activation: string;
  expiry: string;
  character: string;
  inventory: VaultTraderEntry[];
}

export async function fetchVaultTrader(): Promise<VaultTrader> {
  const res = await fetch(VAULT_TRADER_URL);
  if (!res.ok) throw new Error(`fetch ${VAULT_TRADER_URL}: status ${res.status}`);
  return (await res.json()) as VaultTrader;
}

/** Varzia's monthly rotation is time-limited, but per the "cache + manual
 * refresh, no auto-polling" policy it's still cached like everything else. */
export async function cachedVaultTrader(cacheDir: string): Promise<VaultTrader> {
  return cachedJSON(cacheDir, "vault-trader.json", fetchVaultTrader);
}

/** Which relics are currently purchasable via Prime Resurgence (Varzia), and
 * until when. Varzia's inventory items are "Void Projection" bundles (e.g.
 * "T1 Void Projection Revenant Baruuk Vault A Bronze"), which share no
 * substring with the relic's own display name ("Lith T13") — but each
 * relic's WFCD `uniqueName` encodes that exact bundle name as its path tail
 * (".../T1VoidProjectionRevenantBaruukVaultABronze"), spaces stripped. That
 * gives an exact join between the two, found 2026-08-30 while tracking down
 * why a relic on Varzia's active rotation still only showed a plain Vaulted
 * badge with no Resurgence indicator — Relic nodes never attempted this
 * check at all (only frame/weapon nodes did, via a substring match against
 * their own name, which relics can't match either). */
export async function resurgenceRelicNames(cacheDir: string): Promise<Map<string, string>> {
  const [vaultTrader, relics] = await Promise.all([cachedVaultTrader(cacheDir), cachedItemsFull(cacheDir, CategoryRelics)]);
  const byUniqueTail = new Map<string, string>();
  for (const r of relics) {
    if (!r.uniqueName) continue;
    const tail = r.uniqueName.slice(r.uniqueName.lastIndexOf("/") + 1);
    byUniqueTail.set(tail, normalizeRelicName(r.name));
  }
  const result = new Map<string, string>();
  for (const entry of vaultTrader.inventory) {
    const relicName = byUniqueTail.get(entry.item.replace(/\s+/g, ""));
    if (relicName) result.set(relicName, vaultTrader.expiry);
  }
  return result;
}

// ---------------------------------------------------------------------------
// syndicates.go: syndicate weapon reward tables + weapon->rank reverse lookup.

// Same mirror as MISSION_REWARDS_URL above (also verified byte-identical
// against GitHub raw on 2026-09-01).
const SYNDICATES_URL = "https://drops.warframestat.us/data/syndicates.json";

// Standing here is the cost spent to buy at that rank, not the cumulative
// standing needed to reach it (verified against real data — an important
// distinction not covered in prior docs).
export interface SyndicateEntry {
  item: string;
  chance: number;
  rarity: string;
  place: string; // "<Syndicate Name>, <Rank Name>"
  standing: number;
}

export async function fetchSyndicates(): Promise<Record<string, SyndicateEntry[]>> {
  const res = await fetch(SYNDICATES_URL);
  if (!res.ok) throw new Error(`fetch ${SYNDICATES_URL}: status ${res.status}`);
  const wrapped = (await res.json()) as { syndicates: Record<string, SyndicateEntry[]> };
  return wrapped.syndicates;
}

export async function cachedSyndicates(cacheDir: string): Promise<Record<string, SyndicateEntry[]>> {
  return cachedJSON(cacheDir, "syndicates.json", fetchSyndicates);
}

export interface SyndicateRank {
  syndicate: string;
  rankLabel: string;
  standing: number;
}

/** Exact (case-insensitive) weapon-name reverse lookup. Assumes no weapon
 * name spans multiple syndicates (true for Vaykor/Secura/Rakta/Synoid/
 * Telos/Sancti — each is exclusive to one syndicate). */
export function findSyndicateWeaponRank(data: Record<string, SyndicateEntry[]>, weaponName: string): SyndicateRank | undefined {
  const key = weaponName.toLowerCase();
  for (const [syndicate, entries] of Object.entries(data)) {
    for (const e of entries) {
      if (e.item.toLowerCase() !== key) continue;
      // place is "<Syndicate>, <Rank>" — take everything after the last ", ".
      const idx = e.place.lastIndexOf(", ");
      const rank = idx >= 0 ? e.place.slice(idx + 2).trim() : e.place;
      return { syndicate, rankLabel: rank, standing: e.standing };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// i18n.go: item-name Japanese (or other language) translations.

const I18N_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/i18n.json";

interface I18nEntry {
  name?: string;
}
type I18nData = Record<string, Record<string, I18nEntry>>;

async function fetchI18nData(): Promise<I18nData> {
  const res = await fetch(I18N_URL);
  if (!res.ok) throw new Error(`fetch ${I18N_URL}: status ${res.status}`);
  return (await res.json()) as I18nData;
}

/** uniqueName's translated name for lang (e.g. "ja"). Unlike the Go original
 * (which streams i18n.json token-by-token to avoid holding all ~52MB in
 * memory), this just JSON.parses the whole cached file — see this file's
 * header comment for the spike-test numbers that justified the simpler
 * approach for a single-user local tool. */
export async function lookupI18nName(cacheDir: string, uniqueName: string, lang: string): Promise<string> {
  const data = await cachedJSON(cacheDir, "i18n.json", fetchI18nData);
  const name = data[uniqueName]?.[lang]?.name;
  if (!name) throw new Error(`lang ${JSON.stringify(lang)} not found for ${JSON.stringify(uniqueName)}`);
  return name;
}
