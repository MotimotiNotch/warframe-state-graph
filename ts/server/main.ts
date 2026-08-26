// Warframe State Graph — TypeScript port, entry point.
// Phase 8: questchain/starchart/stats (pkg/questchain, pkg/starchart,
// pkg/stats, stats.html). Loadouts landed in Phase 9 (out of plan order —
// Phase 9 was implemented first); Chain View/Standing/Glossary in 4/6/6.
// See the migration plan for the full phase order.
//
// Dev/test only — never point DATA_DIR at the real, git-tracked data/
// directory (see CONTRIBUTING.md's isolated-test discipline, which this
// server extends). Defaults to ./scratch-data next to this file.

import * as path from "node:path";
import {
  ArchwingEntrySchema,
  CollectionStore,
  CompanionEntrySchema,
  FrameEntrySchema,
  IncarnonEntrySchema,
  KuvaEntrySchema,
  NecramechEntrySchema,
  RivenEntrySchema,
  WeaponEntrySchema,
} from "./collection.ts";
import { deriveNextActions } from "./engine.ts";
import { EntrySchema, GlossaryStore } from "./glossary.ts";
import { BuildSetSchema, ItemSchema, LoadoutStore } from "./loadout.ts";
import type { NodeType } from "./model.ts";
import { NodeSchema } from "./model.ts";
import { MainQuestNames, ResolveChain } from "./questchain.ts";
import { CounterSchema, ScratchStore } from "./scratch.ts";
import { FetchPlanets, FetchProxima } from "./starchart.ts";
import { ALL_SYNDICATES, findSyndicate, maxRank, minRank, StandingStore } from "./standing.ts";
import {
  FocusInvestment,
  FocusSchools,
  IntrinsicMaxRank,
  IntrinsicMinRank,
  IsValidFocusInvestment,
  IsValidRailjackValue,
  PlanetProgressSchema,
  RailjackComponentSchema,
  StatsStore,
  ValidRailjackGrades,
  ValidRailjackHouses,
} from "./stats.ts";
import { GraphStore } from "./store.ts";
import {
  cachedActiveRelicNames,
  cachedItemsFull,
  cachedJSON,
  cachedNames,
  cachedSyndicates,
  cachedVaultTrader,
  CategoryWarframes,
  fetchArchwingNames,
  fetchCompanionNames,
  fetchFrameNames,
  fetchModNames,
  fetchNecramechNames,
  fetchQuestNames,
  fetchWeaponNames,
  findItemByName,
  isRelicVaulted,
  lookupI18nName,
  refreshCache,
  weaponCategories,
  type Item,
} from "./wfcd.ts";
import { BuildQuestSuggestion, BuildSuggestion, checkRiven, RivenStatChoices } from "./wfcdgen.ts";

// Compiled-binary fallback assets. A `bun build --compile` executable's
// `import.meta.dir` resolves to a virtual embedded path (verified
// empirically 2026-08-25 — a real disk read off it throws ENOENT even for
// files sitting right next to the exe), so the normal disk-reading code
// paths below (buildBundle, pageRoutes, the legacy static passthrough) can't
// find `web/*` when running compiled. A static `with { type: "text" }`
// import is the one thing `--compile` actually embeds, so every asset that
// must survive compilation is imported here and used only as a fallback when
// the live disk read fails — `bun run dev` never touches these (its
// import.meta.dir is a real path, so the disk read always succeeds there).
// The `.embed/*.js` bundles are pre-built by `scripts/prebuild-embed.ts`
// (run automatically by the `dev`/`typecheck`/`test`/`compile` package.json
// scripts) since `Bun.build()` itself can't run against embedded content —
// see that script's header comment.
import embeddedIndexHtml from "../web/.embed/index.html.txt" with { type: "text" };
import embeddedGlossaryHtml from "../web/.embed/glossary.html.txt" with { type: "text" };
import embeddedStandingHtml from "../web/.embed/standing.html.txt" with { type: "text" };
import embeddedLoadoutsHtml from "../web/.embed/loadouts.html.txt" with { type: "text" };
import embeddedStatsHtml from "../web/.embed/stats.html.txt" with { type: "text" };
import embeddedCollectionsHtml from "../web/.embed/collections.html.txt" with { type: "text" };
import embeddedIndexJs from "../web/.embed/index.js.txt" with { type: "text" };
import embeddedGlossaryJs from "../web/.embed/glossary.js.txt" with { type: "text" };
import embeddedStandingJs from "../web/.embed/standing.js.txt" with { type: "text" };
import embeddedLoadoutsJs from "../web/.embed/loadouts.js.txt" with { type: "text" };
import embeddedStatsJs from "../web/.embed/stats.js.txt" with { type: "text" };
import embeddedCollectionsJs from "../web/.embed/collections.js.txt" with { type: "text" };
import embeddedFaviconSvg from "../web/.embed/favicon.svg.txt" with { type: "text" };
import embeddedNotemdJs from "../web/.embed/notemd.js.txt" with { type: "text" };
import embeddedWallpaperJs from "../web/.embed/wallpaper.js.txt" with { type: "text" };
import embeddedThemeJs from "../web/.embed/theme.js.txt" with { type: "text" };
import embeddedScrollTopJs from "../web/.embed/scroll-top.js.txt" with { type: "text" };
import embeddedSpoilerWarningJs from "../web/.embed/spoiler-warning.js.txt" with { type: "text" };
import embeddedQuestOnboardingJs from "../web/.embed/quest-onboarding.js.txt" with { type: "text" };
import embeddedDebugGridJs from "../web/.embed/debug-grid.js.txt" with { type: "text" };

const embeddedHtmlByEntry: Record<string, string> = {
  index: embeddedIndexHtml,
  glossary: embeddedGlossaryHtml,
  standing: embeddedStandingHtml,
  loadouts: embeddedLoadoutsHtml,
  stats: embeddedStatsHtml,
  collections: embeddedCollectionsHtml,
};
const embeddedJsByEntry: Record<string, string> = {
  index: embeddedIndexJs,
  glossary: embeddedGlossaryJs,
  standing: embeddedStandingJs,
  loadouts: embeddedLoadoutsJs,
  stats: embeddedStatsJs,
  collections: embeddedCollectionsJs,
};
// Keyed by the same URL-pathname basename the legacy passthrough serves
// (e.g. "favicon.svg", "notemd.js") — see the catch-all `fetch()` handler below.
const embeddedLegacyByBasename: Record<string, string> = {
  "favicon.svg": embeddedFaviconSvg,
  "notemd.js": embeddedNotemdJs,
  "wallpaper.js": embeddedWallpaperJs,
  "theme.js": embeddedThemeJs,
  "scroll-top.js": embeddedScrollTopJs,
  "spoiler-warning.js": embeddedSpoilerWarningJs,
  "quest-onboarding.js": embeddedQuestOnboardingJs,
  "debug-grid.js": embeddedDebugGridJs,
};

const dataDir = process.env.DATA_DIR ?? path.join(import.meta.dir, "..", "scratch-data");
const graphStore = new GraphStore(path.join(dataDir, "graph.json"));
const glossaryStore = new GlossaryStore(path.join(dataDir, "glossary.json"));
const standingStore = new StandingStore(path.join(dataDir, "standing.json"));
const scratchStore = new ScratchStore(path.join(dataDir, "scratch.json"));
const loadoutStore = new LoadoutStore(path.join(dataDir, "loadouts.json"));
const statsStore = new StatsStore(path.join(dataDir, "stats.json"));
const collectionStore = new CollectionStore(path.join(dataDir, "collections.json"));
const wfcdCacheDir = path.join(dataDir, "wfcd-cache");

async function findItemInCategories(categories: string[], name: string): Promise<Item | undefined> {
  for (const cat of categories) {
    const items = await cachedItemsFull(wfcdCacheDir, cat);
    const hit = findItemByName(items, name);
    if (hit) return hit;
  }
  return undefined;
}

// Union of WFCD's full quest list (46 entries, includes side quests missing
// a prerequisite entry, e.g. "Prelude to War"/"The Maker" per the 2026-08-22
// finding) and questchain's main-story names — the authoritative "every
// quest" list for Stats' quest checklist. Dropping the WFCD-missing mains
// would leave them permanently absent from the checklist yet still
// writable-to via the prerequisite cascade, an orphaned key nothing displays.
async function mergedQuestNames(): Promise<string[]> {
  const wfcdNames = await cachedNames(wfcdCacheDir, "quests.json", fetchQuestNames);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const n of wfcdNames) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(n);
    }
  }
  for (const n of MainQuestNames()) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(n);
    }
  }
  merged.sort();
  return merged;
}

const webDir = path.join(import.meta.dir, "..", "web");
// Shared page-chrome scripts (notemd/booster/scratch/wallpaper/theme/...) are
// Phase 7 scope. Until then, serve them straight from the original Go
// project's web/ directory so the ported page still looks and behaves like
// the real app for browser verification.
const legacyWebDir = path.join(import.meta.dir, "..", "..", "web");

function json(v: unknown, init?: ResponseInit): Response {
  return Response.json(v, init);
}

function errorResponse(err: unknown, status: number): Response {
  const message = err instanceof Error ? err.message : String(err);
  return new Response(message, { status });
}

// Bundles a web/<entry>.ts fresh on every request instead of requiring a
// manual `bun build` step before each reload — matches the no-compile-step
// feel of `go run` that motivated picking Bun. Fine for a single-user local
// tool. `entry` is a bare module name (e.g. "index", "glossary"), never
// user-controlled — see the fixed `pages` table below.
async function buildBundle(entry: string): Promise<Response> {
  const entryPath = path.join(webDir, `${entry}.ts`);
  if (await Bun.file(entryPath).exists()) {
    const result = await Bun.build({ entrypoints: [entryPath], target: "browser", format: "esm" });
    if (!result.success) {
      const message = result.logs.map((l) => l.message).join("\n");
      return new Response(message, { status: 500 });
    }
    const output = result.outputs[0];
    if (!output) return new Response("bundle produced no output", { status: 500 });
    return new Response(output, {
      headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" },
    });
  }
  // entryPath doesn't exist on real disk — running as a compiled binary
  // (see this file's embedded-assets import block above). Serve the
  // pre-built snapshot instead.
  const embedded = embeddedJsByEntry[entry];
  if (!embedded) return new Response(`no bundle available for ${entry}`, { status: 500 });
  return new Response(embedded, { headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" } });
}

// Each ported page gets an HTML route plus a matching bundled-JS route.
// `path` is "/" for Chain View (kept at root, matching the Go server's
// index.html-at-/ convention) and "/<entry>.html" for every other page.
const pages: { path: string; entry: string }[] = [
  { path: "/", entry: "index" },
  { path: "/glossary.html", entry: "glossary" },
  { path: "/standing.html", entry: "standing" },
  { path: "/loadouts.html", entry: "loadouts" },
  { path: "/stats.html", entry: "stats" },
  { path: "/collections.html", entry: "collections" },
];

async function servePageHtml(entry: string): Promise<Response> {
  const filePath = path.join(webDir, `${entry}.html`);
  const file = Bun.file(filePath);
  if (await file.exists()) return new Response(file);
  // Compiled-binary fallback (see the embedded-assets import block above).
  const embedded = embeddedHtmlByEntry[entry];
  if (!embedded) return new Response(`no page available for ${entry}`, { status: 500 });
  return new Response(embedded, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

const pageRoutes: Record<string, { GET: () => Response | Promise<Response> }> = {};
for (const { path: routePath, entry } of pages) {
  pageRoutes[routePath] = { GET: () => servePageHtml(entry) };
  pageRoutes[`/${entry}.js`] = { GET: () => buildBundle(entry) };
}

const server = Bun.serve({
  port: 8788,
  // Bun's default idle timeout (10s) was killing the browser-facing
  // connection while /api/reference/* was still waiting on a slow upstream
  // fetch — this host's TLS-inspecting security software throttles larger
  // raw.githubusercontent.com responses severely (Mods.json: ~7MB decoded,
  // ~50s observed) even though it does eventually complete. Go's net/http
  // has no such default and was never affected by this. 180s covers the
  // slowest observed WFCD fetch (Warframes.json) with margin.
  idleTimeout: 180,
  routes: {
    ...pageRoutes,

    "/api/ping": {
      GET: () => json({ ok: true, phase: 8 }),
    },

    "/api/glossary": {
      GET: async () => json(await glossaryStore.load()),
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = EntrySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(parsed.error.message, { status: 400 });
        }
        return json(await glossaryStore.upsert(parsed.data));
      },
    },

    "/api/glossary/:key": {
      DELETE: async (req) => json(await glossaryStore.delete(req.params.key)),
    },

    "/api/standing": {
      GET: async () => json({ data: await standingStore.load(), syndicates: ALL_SYNDICATES }),
    },

    "/api/standing/:syndicate": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const rank = (body as { rank?: unknown } | null)?.rank;
        if (typeof rank !== "number" || !Number.isInteger(rank)) {
          return new Response("rank must be an integer", { status: 400 });
        }
        const syn = findSyndicate(req.params.syndicate);
        if (!syn) return new Response("unknown syndicate", { status: 404 });
        if (rank < minRank(syn) || rank > maxRank(syn)) {
          return new Response(`rank must be between ${minRank(syn)} and ${maxRank(syn)} for this syndicate`, {
            status: 400,
          });
        }
        return json(await standingStore.setRank(req.params.syndicate, rank));
      },
    },

    "/api/standing/:syndicate/highest": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const rank = (body as { rank?: unknown } | null)?.rank;
        if (typeof rank !== "number" || !Number.isInteger(rank)) {
          return new Response("rank must be an integer", { status: 400 });
        }
        const syn = findSyndicate(req.params.syndicate);
        if (!syn) return new Response("unknown syndicate", { status: 404 });
        if (rank < 0 || rank > maxRank(syn)) {
          return new Response(`rank must be between 0 and ${maxRank(syn)} for this syndicate`, { status: 400 });
        }
        return json(await standingStore.setHighestRankReached(req.params.syndicate, rank));
      },
    },

    "/api/scratch": {
      GET: async () => json(await scratchStore.load()),
    },

    "/api/scratch/note": {
      PUT: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const note = (body as { note?: unknown } | null)?.note;
        if (typeof note !== "string") return new Response("note must be a string", { status: 400 });
        return json(await scratchStore.setNote(note));
      },
    },

    "/api/scratch/counters": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = CounterSchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        if (!parsed.data.id) return new Response("id is required", { status: 400 });
        return json(await scratchStore.addCounter(parsed.data));
      },
    },

    "/api/scratch/counters/:id/increment": {
      POST: async (req) => {
        try {
          return json(await scratchStore.incrementCounter(req.params.id));
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
    },

    "/api/scratch/counters/:id/decrement": {
      POST: async (req) => {
        try {
          return json(await scratchStore.decrementCounter(req.params.id));
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
    },

    "/api/scratch/counters/:id": {
      PUT: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const label = (body as { label?: unknown } | null)?.label;
        if (typeof label !== "string") return new Response("label must be a string", { status: 400 });
        try {
          return json(await scratchStore.renameCounter(req.params.id, label));
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
      DELETE: async (req) => {
        await scratchStore.deleteCounter(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/scratch/counters/:id/value": {
      PUT: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const value = (body as { value?: unknown } | null)?.value;
        if (typeof value !== "number") return new Response("value must be a number", { status: 400 });
        try {
          return json(await scratchStore.setCounterValue(req.params.id, value));
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
    },

    "/api/graph": {
      GET: async () => {
        const g = await graphStore.load();
        return json(g);
      },
    },

    "/api/next-actions": {
      GET: async (req) => {
        const url = new URL(req.url);
        const buildId = url.searchParams.get("build");
        if (!buildId) {
          return new Response("missing ?build=<nodeId>", { status: 400 });
        }
        const g = await graphStore.load();
        if (!g.nodes[buildId]) {
          return new Response(`build not found: ${buildId}`, { status: 404 });
        }
        return json(deriveNextActions(g, buildId));
      },
    },

    "/api/nodes/:id/toggle": {
      POST: async (req) => {
        try {
          const n = await graphStore.toggleSatisfied(req.params.id);
          return json(n);
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
    },

    "/api/nodes/:id/gild-toggle": {
      POST: async (req) => {
        try {
          const n = await graphStore.toggleGilded(req.params.id);
          return json(n);
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
    },

    "/api/nodes/:id": {
      DELETE: async (req) => {
        await graphStore.deleteNode(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/nodes": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = NodeSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(parsed.error.message, { status: 400 });
        }
        await graphStore.upsertNode(parsed.data);
        return json(parsed.data);
      },
    },

    "/api/loadouts": {
      GET: async () => json(await loadoutStore.load()),
    },

    "/api/loadout-items": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = ItemSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(parsed.error.message, { status: 400 });
        }
        return json(await loadoutStore.upsertItem(parsed.data));
      },
    },

    "/api/loadout-items/:id": {
      DELETE: async (req) => {
        await loadoutStore.deleteItem(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/loadout-items/:id/configs/:slot": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const mods = (body as { mods?: unknown } | null)?.mods;
        if (!Array.isArray(mods) || !mods.every((m) => typeof m === "string")) {
          return new Response("mods must be a string array", { status: 400 });
        }
        try {
          const item = await loadoutStore.setConfig(req.params.id, req.params.slot as "A" | "B" | "C", mods);
          return json(item);
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
    },

    "/api/build-sets": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = BuildSetSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(parsed.error.message, { status: 400 });
        }
        return json(await loadoutStore.upsertBuildSet(parsed.data));
      },
    },

    "/api/build-sets/:id": {
      DELETE: async (req) => {
        await loadoutStore.deleteBuildSet(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    // Star chart planet/system node totals (denominator). Rides the existing
    // wfcd cache dir + refresh button (2026-08-19, Stats page).
    "/api/starchart/planets": {
      GET: async () => {
        try {
          return json(await cachedJSON(wfcdCacheDir, "starchart-planets.json", FetchPlanets));
        } catch (err) {
          return errorResponse(err, 500);
        }
      },
    },

    // Railjack Proxima (split from the star chart, 2026-08-22). Spoiler-gated
    // section, display timing is controlled by the caller.
    "/api/starchart/proxima": {
      GET: async () => {
        try {
          return json(await cachedJSON(wfcdCacheDir, "starchart-proxima.json", FetchProxima));
        } catch (err) {
          return errorResponse(err, 500);
        }
      },
    },

    // Stats: star chart/Steel Path progress (numerator) and Intrinsics ranks.
    "/api/stats": {
      GET: async () => json(await statsStore.load()),
    },

    "/api/stats/planets/:key": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = PlanetProgressSchema.safeParse(body);
        if (!parsed.success || parsed.data.cleared < 0 || parsed.data.steelPathCleared < 0) {
          return new Response("cleared and steelPathCleared must be >= 0", { status: 400 });
        }
        return json(await statsStore.setPlanetProgress(req.params.key, parsed.data));
      },
    },

    // "星図全部クリア/未クリア" / "鋼の道のり全部クリア/未クリア" (2026-08-26)
    // — mirrors /api/stats/quests/main's "re-derive the authoritative list
    // server-side" rule rather than trusting a client-submitted planet list.
    "/api/stats/planets/mark-all-star-chart": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const cleared = (body as { cleared?: unknown } | null)?.cleared;
        if (typeof cleared !== "boolean") return new Response("cleared must be a boolean", { status: 400 });
        try {
          const planets = await cachedJSON(wfcdCacheDir, "starchart-planets.json", FetchPlanets);
          return json(await statsStore.setAllPlanetsField(planets, "cleared", cleared));
        } catch (err) {
          return errorResponse(err, 500);
        }
      },
    },
    "/api/stats/planets/mark-all-steel-path": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const cleared = (body as { cleared?: unknown } | null)?.cleared;
        if (typeof cleared !== "boolean") return new Response("cleared must be a boolean", { status: 400 });
        try {
          const planets = await cachedJSON(wfcdCacheDir, "starchart-planets.json", FetchPlanets);
          return json(await statsStore.setAllPlanetsField(planets.filter((p) => p.steelPathApplicable), "steelPathCleared", cleared));
        } catch (err) {
          return errorResponse(err, 500);
        }
      },
    },

    "/api/stats/railjack-proxima/:key": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = PlanetProgressSchema.safeParse(body);
        if (!parsed.success || parsed.data.cleared < 0 || parsed.data.steelPathCleared < 0) {
          return new Response("cleared and steelPathCleared must be >= 0", { status: 400 });
        }
        return json(await statsStore.setProximaProgress(req.params.key, parsed.data));
      },
    },

    // "通常全部クリア/未クリア" / "鋼の道のり全部クリア/未クリア" for Proxima
    // (2026-08-26) — same rule and URL-per-field convention as the star
    // chart's mark-all routes above; no steelPathApplicable filter needed
    // since every Proxima supports Steel Path.
    "/api/stats/railjack-proxima/mark-all-normal": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const cleared = (body as { cleared?: unknown } | null)?.cleared;
        if (typeof cleared !== "boolean") return new Response("cleared must be a boolean", { status: 400 });
        try {
          const proxima = await cachedJSON(wfcdCacheDir, "starchart-proxima.json", FetchProxima);
          return json(await statsStore.setAllProximaField(proxima, "cleared", cleared));
        } catch (err) {
          return errorResponse(err, 500);
        }
      },
    },
    "/api/stats/railjack-proxima/mark-all-steel-path": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const cleared = (body as { cleared?: unknown } | null)?.cleared;
        if (typeof cleared !== "boolean") return new Response("cleared must be a boolean", { status: 400 });
        try {
          const proxima = await cachedJSON(wfcdCacheDir, "starchart-proxima.json", FetchProxima);
          return json(await statsStore.setAllProximaField(proxima, "steelPathCleared", cleared));
        } catch (err) {
          return errorResponse(err, 500);
        }
      },
    },

    "/api/stats/railjack/:category": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const rank = (body as { rank?: unknown } | null)?.rank;
        if (typeof rank !== "number" || rank < IntrinsicMinRank || rank > IntrinsicMaxRank) {
          return new Response("rank must be between 0 and 10", { status: 400 });
        }
        return json(await statsStore.setRailjackIntrinsic(req.params.category, rank));
      },
    },

    "/api/stats/drifter/:category": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const rank = (body as { rank?: unknown } | null)?.rank;
        if (typeof rank !== "number" || rank < IntrinsicMinRank || rank > IntrinsicMaxRank) {
          return new Response("rank must be between 0 and 10", { status: 400 });
        }
        return json(await statsStore.setDrifterIntrinsic(req.params.category, rank));
      },
    },

    // Stats' own quest-cleared state (independent of Chain View node
    // registration, 2026-08-22). Covers every main/side quest
    // (/api/reference/quests) — only GatingQuests' 3 entries also drive the
    // Focus/Railjack/Drifter section collapse.
    "/api/stats/quest/:quest": {
      POST: async (req) => {
        const quest = req.params.quest;
        if (!quest) return new Response("quest name is required", { status: 400 });
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const cleared = (body as { cleared?: unknown } | null)?.cleared;
        if (typeof cleared !== "boolean") return new Response("cleared must be a boolean", { status: 400 });
        // Cascade-clears a main quest's prerequisite chain (clearing a later
        // quest implies every earlier one is also cleared, matching how the
        // game actually gates progression) — un-clearing only touches the
        // single quest. Side quests absent from MainStoryChain resolve to
        // just themselves, so this is safe as a plain single-quest clear too.
        const d = cleared ? await statsStore.setQuestsCleared(ResolveChain(quest), true) : await statsStore.setQuestCleared(quest, false);
        return json(d);
      },
    },

    // "Mark all main/sub cleared/uncleared" buttons (2026-08-22, split from a
    // single /all after "main and sub should be separate" feedback). Always
    // re-derives the authoritative list server-side rather than trusting a
    // client-submitted list, so nothing gets left behind by a stale list.
    "/api/stats/quests/main": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const cleared = (body as { cleared?: unknown } | null)?.cleared;
        if (typeof cleared !== "boolean") return new Response("cleared must be a boolean", { status: 400 });
        return json(await statsStore.setQuestsCleared(MainQuestNames(), cleared));
      },
    },
    "/api/stats/quests/sub": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const cleared = (body as { cleared?: unknown } | null)?.cleared;
        if (typeof cleared !== "boolean") return new Response("cleared must be a boolean", { status: 400 });
        let all: string[];
        try {
          all = await mergedQuestNames();
        } catch (err) {
          return errorResponse(err, 502);
        }
        const isMain = new Set(MainQuestNames().map((n) => n.toLowerCase()));
        const subNames = all.filter((n) => !isMain.has(n.toLowerCase()));
        return json(await statsStore.setQuestsCleared(subNames, cleared));
      },
    },

    // Focus School: 5 schools' investment stage (3-value aggregate) + the
    // currently active school (2026-08-20, item 23).
    "/api/stats/focus/:school": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const investment = (body as { investment?: unknown } | null)?.investment;
        if (typeof investment !== "string" || !IsValidFocusInvestment(investment)) {
          return new Response("investment must be one of: not_invested, in_progress, maxed", { status: 400 });
        }
        return json(await statsStore.setFocusInvestment(req.params.school, investment as FocusInvestment));
      },
    },

    "/api/stats/focus-active": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const school = (body as { school?: unknown } | null)?.school;
        if (typeof school !== "string" || (school !== "" && !IsValidRailjackValue(school, FocusSchools))) {
          return new Response("school must be a valid Focus School name, or empty to unset", { status: 400 });
        }
        return json(await statsStore.setFocusActiveSchool(school));
      },
    },

    // Railjack hull: 4 components' coarse current fit (House x Grade) + a
    // free-text Plexus mod note (2026-08-20, item 23).
    "/api/stats/railjack-component/:slot": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = RailjackComponentSchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        if (!IsValidRailjackValue(parsed.data.house, ValidRailjackHouses)) {
          return new Response("house must be one of: (empty), Zetki, Lavan, Vidar", { status: 400 });
        }
        if (!IsValidRailjackValue(parsed.data.grade, ValidRailjackGrades)) {
          return new Response("grade must be one of: (empty), Mk I, Mk II, Mk III", { status: 400 });
        }
        return json(await statsStore.setRailjackComponent(req.params.slot, parsed.data));
      },
    },

    "/api/stats/railjack-plexus-note": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const note = (body as { note?: unknown } | null)?.note;
        if (typeof note !== "string") return new Response("note must be a string", { status: 400 });
        return json(await statsStore.setRailjackPlexusNote(note));
      },
    },

    // Collections (an acquisition log independent of Chain View/Loadouts).
    "/api/collections": {
      GET: async () => json(await collectionStore.load()),
    },

    "/api/collections/rivens": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = RivenEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertRiven(parsed.data));
      },
    },
    "/api/collections/rivens/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteRiven(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/collections/kuva": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = KuvaEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertKuva(parsed.data));
      },
    },
    "/api/collections/kuva/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteKuva(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/collections/frames": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = FrameEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertFrame(parsed.data));
      },
    },
    "/api/collections/frames/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteFrame(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/collections/weapons": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = WeaponEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertWeapon(parsed.data));
      },
    },
    "/api/collections/weapons/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteWeapon(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/collections/companions": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = CompanionEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertCompanion(parsed.data));
      },
    },
    "/api/collections/companions/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteCompanion(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/collections/archwings": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = ArchwingEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertArchwing(parsed.data));
      },
    },
    "/api/collections/archwings/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteArchwing(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/collections/necramechs": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = NecramechEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertNecramech(parsed.data));
      },
    },
    "/api/collections/necramechs/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteNecramech(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    "/api/collections/incarnons": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const parsed = IncarnonEntrySchema.safeParse(body);
        if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
        return json(await collectionStore.upsertIncarnon(parsed.data));
      },
    },
    "/api/collections/incarnons/:id": {
      DELETE: async (req) => {
        await collectionStore.deleteIncarnon(req.params.id);
        return new Response(null, { status: 204 });
      },
    },

    // Frame/weapon/etc. names from WFCD's public data (fetched once, then
    // cached locally) — backs Loadouts' "add item" free-text-vs-pick-from-real-data UI.
    "/api/reference/frames": {
      GET: async () => {
        try {
          return json(await cachedNames(wfcdCacheDir, "frames.json", fetchFrameNames));
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },
    "/api/reference/archwings": {
      GET: async () => {
        try {
          return json(await cachedNames(wfcdCacheDir, "archwings.json", fetchArchwingNames));
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },
    "/api/reference/necramechs": {
      GET: async () => {
        try {
          return json(await cachedNames(wfcdCacheDir, "necramechs.json", fetchNecramechNames));
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },
    "/api/reference/weapons": {
      GET: async () => {
        try {
          return json(await cachedNames(wfcdCacheDir, "weapons.json", fetchWeaponNames));
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },
    "/api/reference/companions": {
      GET: async () => {
        try {
          return json(await cachedNames(wfcdCacheDir, "companions.json", fetchCompanionNames));
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },
    "/api/reference/mods": {
      GET: async () => {
        try {
          return json(await cachedNames(wfcdCacheDir, "mods.json", fetchModNames));
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },

    // Stats page "quest progress", full main+side quest list (2026-08-22).
    "/api/reference/quests": {
      GET: async () => {
        try {
          return json(await mergedQuestNames());
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },

    // Main-story quest names (questchain.MainStoryChain-derived, static so no
    // caching needed). Backs the frontend's main/side classification and
    // prerequisite-cascade check.
    "/api/reference/main-quests": {
      GET: () => json(MainQuestNames()),
    },

    // Node-generation candidates (paradigm/rich-lich detection/archetype/
    // part->relic candidates) derived from WFCD data for the given item.
    // Whether these actually land in the graph happens later, at /api/wfcd/import.
    "/api/wfcd/generate": {
      GET: async (req) => {
        const url = new URL(req.url);
        const name = url.searchParams.get("name") ?? "";
        const nodeType = url.searchParams.get("nodeType") ?? "";
        if (!name || (nodeType !== "Frame" && nodeType !== "Weapon" && nodeType !== "Quest")) {
          return new Response("name and nodeType (Frame|Weapon|Quest) are required", { status: 400 });
        }

        // Quests skip WFCD item data entirely and resolve purely from
        // questchain's static table (prerequisite relationships exist in
        // neither WFCD nor Public Export static data, per
        // 03_Data_Source_Research.md).
        if (nodeType === "Quest") {
          return json(BuildQuestSuggestion(name));
        }

        const categories = nodeType === "Weapon" ? weaponCategories : [CategoryWarframes];
        const found = await findItemInCategories(categories, name);
        if (!found) return new Response(`item not found in WFCD data: ${name}`, { status: 404 });

        // Relic-vault detection is best-effort: the suggestion still stands
        // even if it's unavailable.
        let activeRelics: Set<string> | undefined;
        try {
          activeRelics = await cachedActiveRelicNames(wfcdCacheDir);
        } catch (err) {
          console.warn(`active relics unavailable, vault status will be omitted: ${err}`);
        }

        // Syndicate rank suggestion is likewise best-effort.
        let syndicates: Record<string, import("./wfcd.ts").SyndicateEntry[]> | undefined;
        try {
          syndicates = await cachedSyndicates(wfcdCacheDir);
        } catch (err) {
          console.warn(`syndicate data unavailable, rank suggestion will be omitted: ${err}`);
        }

        return json(BuildSuggestion(found, nodeType as NodeType, activeRelics, syndicates));
      },
    },

    // Bulk-imports the auto-generated candidates (after the user finished
    // picking relic candidates) into the graph.
    "/api/wfcd/import": {
      POST: async (req) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch (err) {
          return errorResponse(err, 400);
        }
        const nodes = (body as { nodes?: unknown } | null)?.nodes;
        if (!Array.isArray(nodes) || nodes.length === 0) {
          return new Response("nodes must not be empty", { status: 400 });
        }
        const parsed = nodes.map((n) => NodeSchema.parse(n));
        await graphStore.upsertNodes(parsed);
        return json(parsed);
      },
    },

    // Choices for the dedicated Riven input UI (positive-stat names worth having).
    "/api/wfcd/riven-stats": {
      GET: () => json(RivenStatChoices),
    },

    // Whether the target weapon's archetype lines up with the Riven's
    // positive stats (item 2's confirmed scope: no theoretical-range calculation).
    "/api/wfcd/riven-check": {
      GET: async (req) => {
        const url = new URL(req.url);
        const weaponName = url.searchParams.get("weapon") ?? "";
        if (!weaponName) return new Response("missing ?weapon=", { status: 400 });
        const positive = (url.searchParams.get("positive") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "");

        const item = await findItemInCategories(weaponCategories, weaponName);
        if (!item) return new Response(`weapon not found in WFCD data: ${weaponName}`, { status: 404 });
        return json(checkRiven(item, positive));
      },
    },

    // Whether a relic is Vaulted (outside the current drop table).
    "/api/wfcd/relic-status": {
      GET: async (req) => {
        const url = new URL(req.url);
        const name = url.searchParams.get("name") ?? "";
        if (!name) return new Response("missing ?name=", { status: 400 });
        try {
          const activeRelics = await cachedActiveRelicNames(wfcdCacheDir);
          return json({ vaulted: isRelicVaulted(activeRelics, name) });
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },

    // Prime Resurgence (Varzia)'s current rotation. Even a Vaulted frame/
    // weapon may be time-limited-available this way; the Inspector cross-
    // references this against the node name.
    "/api/wfcd/resurgence": {
      GET: async () => {
        try {
          return json(await cachedVaultTrader(wfcdCacheDir));
        } catch (err) {
          return errorResponse(err, 502);
        }
      },
    },

    // Item's Japanese name (i18n.json).
    "/api/wfcd/i18n": {
      GET: async (req) => {
        const url = new URL(req.url);
        const uniqueName = url.searchParams.get("uniqueName") ?? "";
        const lang = url.searchParams.get("lang") || "ja";
        if (!uniqueName) return new Response("missing ?uniqueName=", { status: 400 });
        try {
          return json({ name: await lookupI18nName(wfcdCacheDir, uniqueName, lang) });
        } catch (err) {
          return errorResponse(err, 404);
        }
      },
    },

    // Wipes the whole WFCD cache; every endpoint above re-fetches lazily on next access.
    "/api/wfcd/refresh": {
      POST: async () => {
        try {
          await refreshCache(wfcdCacheDir);
          return json({ ok: true });
        } catch (err) {
          return errorResponse(err, 500);
        }
      },
    },
  },

  async fetch(req) {
    const url = new URL(req.url);
    // Legacy static passthrough: any other GET is checked against the
    // original Go project's web/ directory (favicon.svg, and the
    // not-yet-ported shared scripts referenced from index.html).
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      const filePath = path.join(legacyWebDir, url.pathname);
      if (filePath.startsWith(legacyWebDir)) {
        const file = Bun.file(filePath);
        if (await file.exists()) return new Response(file);
      }
      // Compiled-binary fallback (see the embedded-assets import block
      // above) — only the known 9 shared scripts + favicon.svg are embedded,
      // matching what this passthrough is actually ever asked for.
      const basename = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
      const embedded = embeddedLegacyByBasename[basename];
      if (embedded) {
        const contentType = basename.endsWith(".svg") ? "image/svg+xml" : "text/javascript";
        return new Response(embedded, { headers: { "Content-Type": contentType } });
      }
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`listening on http://127.0.0.1:${server.port} (data: ${dataDir})`);
