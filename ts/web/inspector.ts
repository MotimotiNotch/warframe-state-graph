// Port of web/inspector.js. Right-side node detail panel.

import { el } from "./dom.ts";
import { gameIcon } from "./icons.ts";
import { STATE_COLOR, STATE_LABEL_JA, loadReport, refreshGraph, state } from "./graph-state.ts";
import { NODE_TYPE_LABEL_JA, openNodeModal } from "./node-modal.ts";

interface RelicStatusResponse {
  vaulted?: boolean;
}
interface I18nResponse {
  name?: string;
}
interface ResurgenceInventoryEntry {
  item?: string;
}
interface ResurgenceResponse {
  inventory?: ResurgenceInventoryEntry[];
  expiry?: string;
}

export function renderPanel(): void {
  const panel = el("panel-body");
  if (!state.selected) {
    panel.innerHTML = `<div class="empty">ノードを選択してください</div>`;
    return;
  }
  const node = state.report!.nodes[state.selected]!;
  const isRoot = state.selected === state.report!.buildId;
  const stateLabel = isRoot ? "起点" : (STATE_LABEL_JA[node.state] ?? node.state);
  const badgeColor = isRoot ? STATE_COLOR.ROOT : STATE_COLOR[node.state];

  panel.innerHTML = `
    <div class="ph-name">${node.name} <span id="i18n-name" style="color:var(--muted);font-weight:400;font-size:.85em;"></span></div>
    <div class="ph-row">種別: ${NODE_TYPE_LABEL_JA[node.type] ?? node.type}${node.type === "Relic" ? `<span id="vault-badge"></span>` : ""}</div>
    ${node.evaluation ? `<div class="ph-row">評価: ${node.evaluation}</div>` : ""}
    ${node.note ? `<div class="ph-row">${node.note}</div>` : ""}
    <div class="ph-state" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}">${stateLabel}</div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
      ${isRoot ? "" : `<button class="toggle" id="toggle-btn">${node.satisfied ? "取り消す" : "達成にする"}</button>`}
      ${node.masteryTrack ? `<button class="toggle" id="gild-btn" style="${node.gilded ? "border-color:var(--satisfied);color:var(--satisfied);" : ""}">${node.gilded ? "Gild済み" : "Gildする"}</button>` : ""}
      <button class="toggle" id="edit-btn">編集</button>
    </div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
      <button class="toggle" id="add-requires-btn">前提を追加</button>
      <button class="toggle" id="add-contains-btn">中身を追加</button>
    </div>
    <div id="linked-from-section"></div>
  `;

  const btn = document.getElementById("toggle-btn") as HTMLButtonElement | null;
  if (btn) {
    btn.onclick = async () => {
      btn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/toggle`, { method: "POST" });
      await refreshGraph();
      await loadReport();
    };
  }

  const gildBtn = document.getElementById("gild-btn") as HTMLButtonElement | null;
  if (gildBtn) {
    gildBtn.onclick = async () => {
      gildBtn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/gild-toggle`, { method: "POST" });
      await refreshGraph();
      await loadReport();
    };
  }

  el("edit-btn").onclick = () => openNodeModal("edit", { ...node, id: state.selected! });
  // Creates a new, already-linked node from the selected node (2026-08-25
  // item 28). The user never searches for a connection target by id/name —
  // node-modal.ts wires the new node's id into this node's requires/contains
  // automatically on save.
  el("add-requires-btn").onclick = () =>
    openNodeModal("create", null, { relation: "requires", parentId: state.selected! });
  el("add-contains-btn").onclick = () =>
    openNodeModal("create", null, { relation: "contains", parentId: state.selected! });

  // Relic node: show a Vault-status badge.
  if (node.type === "Relic") {
    fetch(`/api/wfcd/relic-status?name=${encodeURIComponent(node.name)}`)
      .then((r) => (r.ok ? (r.json() as Promise<RelicStatusResponse>) : null))
      .then((res) => {
        const badge = document.getElementById("vault-badge");
        if (badge && res?.vaulted) badge.innerHTML = `<span class="badge-vaulted">${gameIcon("lorc-padlock")}Vault済み</span>`;
      })
      .catch(() => {});
  }

  // WFCD-auto-generated node (has uniqueName): Japanese name + Prime
  // Resurgence inventory match.
  if (node.uniqueName) {
    fetch(`/api/wfcd/i18n?uniqueName=${encodeURIComponent(node.uniqueName)}`)
      .then((r) => (r.ok ? (r.json() as Promise<I18nResponse>) : null))
      .then((res) => {
        const nameEl = document.getElementById("i18n-name");
        if (nameEl && res?.name) nameEl.textContent = `(${res.name})`;
      })
      .catch(() => {});

    fetch("/api/wfcd/resurgence")
      .then((r) => (r.ok ? (r.json() as Promise<ResurgenceResponse>) : null))
      .then((vt) => {
        if (!vt?.inventory) return;
        const hit = vt.inventory.find((e) => e.item?.toLowerCase().includes(node.name.toLowerCase()));
        if (!hit) return;
        const row = panel.querySelector(".ph-row");
        if (row) {
          row.insertAdjacentHTML(
            "beforeend",
            `<span class="badge-resurgence">${gameIcon("lorc-hourglass")}Resurgence在庫あり(〜${(vt.expiry ?? "").slice(0, 10)})</span>`,
          );
        }
      })
      .catch(() => {});
  }

  void renderLinkedFrom(state.selected);
}

interface LoadoutItemLike {
  name: string;
  chainViewNodeId?: string;
}
interface BuildSetLike {
  name: string;
  chainViewBuildId?: string;
}
interface LoadoutsResponse {
  items?: Record<string, LoadoutItemLike>;
  buildSets?: Record<string, BuildSetLike>;
}
interface CollectionEntryLike {
  name?: string;
  weaponName?: string;
  chainViewNodeId?: string;
}
type CollectionsResponse = Record<string, Record<string, CollectionEntryLike> | number | undefined>;

const COLLECTION_CATEGORIES_JA: Record<string, string> = {
  rivens: "Riven",
  kuva: "Kuva/Tenet/Coda",
  frames: "フレーム",
  weapons: "武器",
  companions: "コンパニオン",
  archwings: "Archwing",
  necramechs: "Necramech",
  incarnons: "インカーノン",
};

// Reverse of Loadouts/Collections' minigraph "click a dot to jump here"
// (2026-08-26) — this node may itself be linked *from* one or more
// Items/BuildSets/collection entries; list them so a normal "I'm looking at
// this node, where's it actually used" question doesn't require manually
// hunting through both other pages. Fetches the same full documents those
// pages load themselves (small personal-tool-sized data, a full scan is
// cheap) rather than adding a dedicated reverse-index endpoint.
async function renderLinkedFrom(forNodeId: string): Promise<void> {
  const [loadouts, collections] = await Promise.all([
    fetch("/api/loadouts").then((r) => (r.ok ? (r.json() as Promise<LoadoutsResponse>) : null)),
    fetch("/api/collections").then((r) => (r.ok ? (r.json() as Promise<CollectionsResponse>) : null)),
  ]).catch(() => [null, null]);
  // The user may have selected a different node (or none) by the time these
  // two fetches resolve — a stale result must not overwrite whatever's
  // actually showing now.
  if (state.selected !== forNodeId) return;
  const section = document.getElementById("linked-from-section");
  if (!section) return;

  const links: { label: string; href: string }[] = [];
  for (const item of Object.values(loadouts?.items ?? {})) {
    if (item.chainViewNodeId === forNodeId) links.push({ label: `${item.name}（Loadouts Item）`, href: "/loadouts.html" });
  }
  for (const set of Object.values(loadouts?.buildSets ?? {})) {
    if (set.chainViewBuildId === forNodeId) links.push({ label: `${set.name}（Loadouts BuildSet）`, href: "/loadouts.html" });
  }
  for (const [key, jaLabel] of Object.entries(COLLECTION_CATEGORIES_JA)) {
    const bucket = collections?.[key];
    if (!bucket || typeof bucket !== "object") continue;
    for (const entry of Object.values(bucket)) {
      if (entry.chainViewNodeId === forNodeId) {
        links.push({ label: `${entry.name ?? entry.weaponName ?? "?"}（Collections ${jaLabel}）`, href: "/collections.html" });
      }
    }
  }

  if (!links.length) {
    section.innerHTML = "";
    return;
  }
  section.innerHTML = `
    <div class="ph-row" style="margin-top:10px;color:var(--muted);font-size:0.78rem;">連携元</div>
    <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">
      ${links.map((l, i) => `<button class="toggle" style="text-align:left;margin-top:0;" data-linked-from-idx="${i}">${l.label}</button>`).join("")}
    </div>
  `;
  section.querySelectorAll<HTMLButtonElement>("[data-linked-from-idx]").forEach((btn) => {
    const href = links[Number(btn.dataset.linkedFromIdx)]!.href;
    btn.onclick = () => {
      window.location.href = href;
    };
  });
}
