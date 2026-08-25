// Port of pkg/starchart. Fetches the "denominator" (total node count per
// planet/system, and per Railjack Proxima region) from
// calamity-inc/warframe-public-export-plus's ExportRegions.json. The
// "numerator" (cleared count) is not this package's scope — that's
// pkg/stats/stats.ts's job (current-value-held-directly, like pkg/standing).

const regionsSourceURL =
  "https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/senpai/ExportRegions.json";

// systemName's trailing segment (raw key) -> readable display name. A key
// with no mapping displays as-is (Mercury/Venus/Earth etc. are already fine
// unmapped). The old "DeepSpace" entry ("Deep Space (Empyrean)") was removed
// 2026-08-22 — no real "DeepSpace" (no _SPACE suffix) node exists in the
// data; that key was a dead entry groupPlanets could never reach.
const displayNames: Record<string, string> = {
  SolarMapDeimosName: "Deimos",
  ZarimanRegionName: "Zariman",
  "1999MapName": "1999 (Höllvania)",
  TauRegion: "Albrecht's Labs (Tau)",
  RelayStationSanctuary: "Sanctuary (Cephalon Simaris)",
};

// Systems no longer required for Steel Path as of Hotfix 38.5.3 (The New War
// and later content). Wiki-confirmed.
const steelPathExcluded: Record<string, boolean> = {
  ZarimanRegionName: true,
  TauRegion: true,
  "1999MapName": true,
};

// Systems excluded entirely. Duviri doesn't fit the fixed-node star-chart
// model, so it's out of scope (2026-08-19 design). Duviri-proper clear state
// (Lone Story etc.) isn't tracked anywhere in this tool.
const excludedSystems: Record<string, boolean> = {
  Duviri: true,
};

// A systemName with the _SPACE suffix (Earth_SPACE etc.) is a Railjack
// Proxima. groupPlanets skips these entirely; groupProxima aggregates them
// separately (2026-08-22 split, to avoid double-counting once Railjack got
// its own progress section).
const spaceSuffix = "_SPACE";

// proximaExcluded keys (post-trimSuffix) to drop from groupProxima. Uranus is
// a Jade Shadows: Constellations-gated area (Wiki "Uranus Proxima"), high
// spoiler risk, excluded the same way the star chart excludes Duviri.
const proximaExcluded: Record<string, boolean> = {
  Uranus: true,
};

// Proxima display names. An unmapped key builds "<Key> Proxima" mechanically
// (Earth -> "Earth Proxima", matches real data). DeepSpace is the one
// exception — no bare "DeepSpace" star-chart node exists; "DeepSpace_SPACE"
// is in fact Railjack's endgame area, Veil Proxima.
const proximaDisplayNames: Record<string, string> = {
  DeepSpace: "Veil Proxima",
};

function proximaDisplayNameFor(key: string): string {
  return proximaDisplayNames[key] ?? `${key} Proxima`;
}

export interface Proxima {
  key: string;
  displayName: string;
  nodeCount: number;
}

export interface RegionNode {
  systemName: string;
}

export async function FetchProxima(): Promise<Proxima[]> {
  const res = await fetch(regionsSourceURL);
  if (!res.ok) throw new Error(`fetch ${regionsSourceURL}: status ${res.status}`);
  const raw = (await res.json()) as Record<string, RegionNode>;
  return groupProxima(raw);
}

export function groupProxima(raw: Record<string, RegionNode>): Proxima[] {
  const counts = new Map<string, number>();
  for (const [nodeID, node] of Object.entries(raw)) {
    if (nodeID.startsWith("ClanNode")) continue;
    const segs = node.systemName.split("/");
    let key = segs[segs.length - 1] ?? "";
    if (!key.endsWith(spaceSuffix)) continue;
    key = key.slice(0, -spaceSuffix.length);
    if (key === "" || proximaExcluded[key]) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const proxima: Proxima[] = [];
  for (const [key, count] of counts) {
    proxima.push({ key, displayName: proximaDisplayNameFor(key), nodeCount: count });
  }
  proxima.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return proxima;
}

export interface Planet {
  key: string;
  displayName: string;
  nodeCount: number;
  steelPathApplicable: boolean;
}

function displayNameFor(key: string): string {
  return displayNames[key] ?? key;
}

export async function FetchPlanets(): Promise<Planet[]> {
  const res = await fetch(regionsSourceURL);
  if (!res.ok) throw new Error(`fetch ${regionsSourceURL}: status ${res.status}`);
  const raw = (await res.json()) as Record<string, RegionNode>;
  return groupPlanets(raw);
}

export function groupPlanets(raw: Record<string, RegionNode>): Planet[] {
  const counts = new Map<string, number>();
  for (const [nodeID, node] of Object.entries(raw)) {
    if (nodeID.startsWith("ClanNode")) continue;
    const segs = node.systemName.split("/");
    const key = segs[segs.length - 1] ?? "";
    if (key.endsWith(spaceSuffix)) continue; // Railjack Proxima, handled by groupProxima.
    if (key === "" || excludedSystems[key]) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const planets: Planet[] = [];
  for (const [key, count] of counts) {
    planets.push({
      key,
      displayName: displayNameFor(key),
      nodeCount: count,
      steelPathApplicable: !steelPathExcluded[key],
    });
  }
  planets.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return planets;
}
