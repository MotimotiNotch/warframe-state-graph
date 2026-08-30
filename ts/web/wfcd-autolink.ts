// Port of web/wfcd-autolink.js. Shared cross-page auto-link helper
// (Loadouts <-> Chain View <-> Collections, 2026-08-25 item 27). Backing
// endpoints (/api/wfcd/generate, /api/wfcd/import, /api/collections/*) aren't
// wired into the TS server until Phase 9/11 — see wfcd-wizard.ts's header
// note; this module is ported as UI-independent client logic now so those
// later phases only need to add the backend.

interface WfcdGenerateNode {
  id: string;
  requires?: string[];
  contains?: string[];
  [key: string]: unknown;
}
interface WfcdGenerateResponse {
  root: WfcdGenerateNode;
  parts?: { node: WfcdGenerateNode }[];
  syndicateRank?: { node: WfcdGenerateNode };
  questChain?: WfcdGenerateNode[];
}

// Auto-generates a Chain View node from a WFCD name. Follows the wizard's
// default checkbox state (syndicate rank included; relic candidates left
// unselected, so parts keep no chosen source). There's no "current Build"
// context for this caller, so the root always becomes an independent
// type:"Goal" (matches item 30's consolidation — Build isn't used going
// forward).
export async function autoGenerateChainViewNode(nodeType: string, name: string): Promise<string | null> {
  const res = await fetch(`/api/wfcd/generate?nodeType=${encodeURIComponent(nodeType)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const s = (await res.json()) as WfcdGenerateResponse;
  const nodes: WfcdGenerateNode[] = [];
  const root: WfcdGenerateNode & { type: string } = { ...s.root, type: "Goal" };
  nodes.push(root);

  (s.questChain ?? []).forEach((n) => {
    if (n.id !== root.id) nodes.push({ ...n });
  });

  if (s.syndicateRank) {
    const rankNode = s.syndicateRank.node;
    if (!nodes.find((n) => n.id === rankNode.id)) {
      nodes.push({ ...rankNode, requires: rankNode.requires ?? [], contains: rankNode.contains ?? [] });
    }
    root.requires = [...(root.requires ?? []), rankNode.id];
  }

  (s.parts ?? []).forEach((p) => {
    // Relic candidates need user judgment, so nothing is auto-selected —
    // the crack-source requires stays empty.
    nodes.push({ ...p.node, requires: [] });
  });

  const importRes = await fetch("/api/wfcd/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes }),
  });
  if (!importRes.ok) return null;
  // The server resolves ids by name against the existing graph (2026-08-29
  // — ids are opaque random strings now, not name-derived), so root.id as
  // computed here before import may not be what it actually got saved
  // under; read the real one back from the response.
  const imported = (await importRes.json()) as WfcdGenerateNode[];
  return imported.find((n) => n.name === root.name)?.id ?? root.id;
}

// Loadouts.Item type -> Collections registration API path. CompanionEntry/
// ArchwingEntry/NecramechEntry are shaped like WeaponEntry/FrameEntry
// (owned/rankedThirty/note/chainViewNodeId).
const COLLECTIONS_API_PATH_BY_TYPE: Record<string, string> = {
  Frame: "frames",
  Weapon: "weapons",
  Companion: "companions",
  Archwing: "archwings",
  Necramech: "necramechs",
};

export function autoLinkId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface CollectionsEntry {
  id: string;
  name: string;
  [key: string]: unknown;
}

// Force-registers into Collections (same-name reuses the existing id rather
// than creating a duplicate — shares item 27's name-dedup rule across
// pages). The caller page has no Collections state of its own, so this
// checks the API fresh each time.
export async function forcePushToCollections(itemType: string, name: string, owned: boolean): Promise<string | null> {
  const apiPath = COLLECTIONS_API_PATH_BY_TYPE[itemType];
  if (!apiPath) return null;
  const res = await fetch("/api/collections");
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, Record<string, CollectionsEntry>>;
  const bucket = data[apiPath] ?? {};
  const q = name.trim().toLowerCase();
  const existing = Object.values(bucket).find((e) => e.name.trim().toLowerCase() === q);
  if (existing) return existing.id;

  const entry = { id: autoLinkId(itemType.toLowerCase()), name, owned, rankedThirty: false, note: "" };
  const createRes = await fetch(`/api/collections/${apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!createRes.ok) return null;
  return entry.id;
}

interface LoadoutItemLike {
  id: string;
  name: string;
  [key: string]: unknown;
}

// Force-links a Chain View node onto a Loadouts Item (same-name reuses the
// existing item rather than creating a duplicate — mirrors
// forcePushToCollections()'s dedup rule). Was previously inlined in
// wfcd-wizard.ts's "Loadoutsにも追加する" checkbox handler as an
// unconditional POST /api/loadout-items with a fresh id, which never checked
// for an existing same-named item first — re-running WFCD-generate for an
// already-registered item created a second, duplicate Item every time
// (found 2026-08-30, のっち報告).
export async function forcePushToLoadoutItem(type: "Frame" | "Weapon", name: string, chainViewNodeId: string): Promise<string | null> {
  const res = await fetch("/api/loadouts");
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Record<string, LoadoutItemLike> };
  const items = data.items ?? {};
  const q = name.trim().toLowerCase();
  const existing = Object.values(items).find((it) => it.name.trim().toLowerCase() === q);

  const entry = existing
    ? { ...existing, chainViewNodeId }
    : { id: autoLinkId("item"), name, type, configs: { A: [], B: [], C: [] }, note: "", chainViewNodeId };
  const upsertRes = await fetch("/api/loadout-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!upsertRes.ok) return null;
  return entry.id;
}
