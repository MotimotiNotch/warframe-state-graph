// Port of web/inspector.js. Right-side node detail panel.

import { el } from "./dom.ts";
import { gameIcon, icon, iconLabel } from "./icons.ts";
import { STATE_COLOR, loadReport, refreshGraph, state, stateLabel } from "./graph-state.ts";
import { refreshSidebar } from "./build-sidebar.ts";
import { nodeTypeLabel, openNodeModal } from "./node-modal.ts";
import type { Counter } from "../server/model.ts";
import { createLiveEditor } from "./notemd.ts";
import { nodeDisplayName } from "./quest-i18n.ts";
import { showToast } from "./toast.ts";
import { effective } from "./locale.ts";

interface InspectorStrings {
  selectNodePrompt: string;
  rootLabel: string;
  nodeIdTitle: string;
  typeLabel: string;
  undo: string;
  markSatisfied: string;
  gilded: string;
  gild: string;
  edit: string;
  unarchive: string;
  archive: string;
  addRequires: string;
  addContains: string;
  reparent: string;
  reparentHint: string;
  asContains: string;
  asRequires: string;
  reparentTargetPlaceholder: string;
  run: string;
  cancel: string;
  memo: string;
  countUp: string;
  addCountUp: string;
  cannotReparentToSelf: string;
  reparentFailed: (what: string, detail: string) => string;
  reparentWord: string;
  detachWord: string;
  reparented: (relation: string) => string;
  detached: string;
  containsWord: string;
  requiresWord: string;
  vaulted: string;
  resurgenceStock: (date: string) => string;
  noCountersYet: string;
  counterLabelPlaceholder: string;
  delete: string;
  linkedFrom: string;
  collectionCategories: Record<string, string>;
  loadoutsItemSuffix: (name: string) => string;
  loadoutsBuildSetSuffix: (name: string) => string;
  collectionsSuffix: (name: string, category: string) => string;
}

const STRINGS: Record<"ja" | "en", InspectorStrings> = {
  ja: {
    selectNodePrompt: "ノードを選択してください",
    rootLabel: "起点",
    nodeIdTitle: "ノードID",
    typeLabel: "種別",
    undo: "取り消す",
    markSatisfied: "達成にする",
    gilded: "メッキ済み",
    gild: "メッキする",
    edit: "編集",
    unarchive: "アーカイブ解除",
    archive: "アーカイブする",
    addRequires: "前提を追加",
    addContains: "中身を追加",
    reparent: "付け替え",
    reparentHint:
      "指定したIDのノードの下へ、このノード（中身も含めて丸ごと）を移動します。現在の繋がりからは外れます。IDを空欄のまま実行すると、繋がりを外すだけで独立した探索起点に戻します。",
    asContains: "中身（contains）として",
    asRequires: "前提（requires）として",
    reparentTargetPlaceholder: "移動先ノードのID（空欄なら独立させる）",
    run: "実行",
    cancel: "キャンセル",
    memo: "メモ",
    countUp: "カウントアップ",
    addCountUp: "カウントアップを追加",
    cannotReparentToSelf: "自分自身へは付け替えできません",
    reparentFailed: (what, detail) => `${what}のに失敗しました${detail ? `：${detail}` : ""}`,
    reparentWord: "付け替え",
    detachWord: "独立させる",
    reparented: (relation) => `付け替えました（${relation}として）`,
    detached: "独立させました",
    containsWord: "中身",
    requiresWord: "前提",
    vaulted: "Vault済み",
    resurgenceStock: (date) => `Resurgence在庫あり(〜${date})`,
    noCountersYet: "まだありません",
    counterLabelPlaceholder: "メモ",
    delete: "削除",
    linkedFrom: "連携元",
    collectionCategories: {
      rivens: "Riven",
      kuva: "Kuva/Tenet/Coda",
      frames: "フレーム",
      weapons: "武器",
      companions: "コンパニオン",
      archwings: "Archwing",
      necramechs: "Necramech",
      incarnons: "インカーノン",
    },
    loadoutsItemSuffix: (name) => `${name}（Loadouts Item）`,
    loadoutsBuildSetSuffix: (name) => `${name}（Loadouts BuildSet）`,
    collectionsSuffix: (name, category) => `${name}（Collections ${category}）`,
  },
  en: {
    selectNodePrompt: "Select a node",
    rootLabel: "Entry point",
    nodeIdTitle: "Node ID",
    typeLabel: "Type",
    undo: "Undo",
    markSatisfied: "Mark satisfied",
    gilded: "Gilded",
    gild: "Gild",
    edit: "Edit",
    unarchive: "Unarchive",
    archive: "Archive",
    addRequires: "Add a prerequisite",
    addContains: "Add contents",
    reparent: "Re-link",
    reparentHint:
      "Moves this node (and everything nested under it) under the node with the given ID, detaching it from its current links. Run it with the ID left blank to simply detach it and turn it back into a standalone entry point.",
    asContains: "as contents (contains)",
    asRequires: "as a prerequisite (requires)",
    reparentTargetPlaceholder: "Target node ID (blank = detach)",
    run: "Run",
    cancel: "Cancel",
    memo: "Memo",
    countUp: "Counters",
    addCountUp: "Add a counter",
    cannotReparentToSelf: "A node can't be re-linked to itself",
    reparentFailed: (what, detail) => `Failed to ${what}${detail ? `: ${detail}` : ""}`,
    reparentWord: "re-link",
    detachWord: "detach",
    reparented: (relation) => `Re-linked (as ${relation})`,
    detached: "Detached",
    containsWord: "contents",
    requiresWord: "a prerequisite",
    vaulted: "Vaulted",
    resurgenceStock: (date) => `Resurgence available (until ${date})`,
    noCountersYet: "Nothing yet",
    counterLabelPlaceholder: "Label",
    delete: "Delete",
    linkedFrom: "Linked from",
    collectionCategories: {
      rivens: "Riven",
      kuva: "Kuva/Tenet/Coda",
      frames: "Frames",
      weapons: "Weapons",
      companions: "Companions",
      archwings: "Archwing",
      necramechs: "Necramech",
      incarnons: "Incarnon",
    },
    loadoutsItemSuffix: (name) => `${name} (Loadouts Item)`,
    loadoutsBuildSetSuffix: (name) => `${name} (Loadouts Build Set)`,
    collectionsSuffix: (name, category) => `${name} (Collections ${category})`,
  },
};

function t(): InspectorStrings {
  return STRINGS[effective()];
}

function genCounterId(): string {
  return `counter-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

interface RelicStatusResponse {
  vaulted?: boolean;
  resurgence?: { available: boolean; expiry: string } | null;
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
    panel.innerHTML = `<div class="empty">${t().selectNodePrompt}</div>`;
    return;
  }
  const node = state.report!.nodes[state.selected]!;
  const isRoot = state.selected === state.report!.buildId;
  const stateText = isRoot ? t().rootLabel : stateLabel(node.state);
  const badgeColor = isRoot ? STATE_COLOR.ROOT : STATE_COLOR[node.state];

  panel.innerHTML = `
    <div class="ph-name">${nodeDisplayName(node)} <span id="ph-node-id" style="color:var(--muted);font-weight:400;font-size:.75em;" title="${t().nodeIdTitle}">(${state.selected})</span> <span id="i18n-name" style="color:var(--muted);font-weight:400;font-size:.85em;"></span></div>
    <div class="ph-row">${t().typeLabel}: ${nodeTypeLabel(node.type)}${node.type === "Relic" ? `<span id="vault-badge"></span>` : ""}</div>
    <div class="ph-state" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}">${stateText}</div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
      ${isRoot ? "" : `<button class="toggle" id="toggle-btn">${iconLabel(node.satisfied ? "x" : "check", node.satisfied ? t().undo : t().markSatisfied, { size: 13 })}</button>`}
      ${node.masteryTrack ? `<button class="toggle" id="gild-btn" style="${node.gilded ? "border-color:var(--satisfied);color:var(--satisfied);" : ""}">${iconLabel("check", node.gilded ? t().gilded : t().gild, { size: 13 })}</button>` : ""}
      <button class="toggle" id="edit-btn">${iconLabel("pencil", t().edit, { size: 13 })}</button>
      ${
        node.type === "Build" || node.type === "Goal"
          ? `<button class="toggle" id="archive-btn">${iconLabel("archive", node.archived ? t().unarchive : t().archive, { size: 13 })}</button>`
          : ""
      }
    </div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
      <button class="toggle" id="add-requires-btn">${iconLabel("plus", t().addRequires, { size: 13 })}</button>
      <button class="toggle" id="add-contains-btn">${iconLabel("plus", t().addContains, { size: 13 })}</button>
      <button class="toggle" id="reparent-btn">${iconLabel("link-2", t().reparent, { size: 13 })}</button>
    </div>
    <div id="reparent-form" class="hidden" style="margin-top:6px;padding:8px;border:1px solid var(--border);border-radius:8px;">
      <div class="ph-row" style="opacity:.8;margin:0 0 6px;">${t().reparentHint}</div>
      <select id="reparent-relation" style="margin-bottom:6px;">
        <option value="contains">${t().asContains}</option>
        <option value="requires">${t().asRequires}</option>
      </select>
      <input type="text" id="reparent-target-id" placeholder="${t().reparentTargetPlaceholder}" style="margin-bottom:6px;">
      <div class="actions" style="justify-content:flex-start;">
        <button class="toggle" id="reparent-confirm-btn">${t().run}</button>
        <button class="toggle" id="reparent-cancel-btn">${t().cancel}</button>
      </div>
    </div>
    <div class="s-section-title">${t().memo}</div>
    <div id="insp-note-editor"></div>
    <div class="s-section-title">${t().countUp}</div>
    <div id="insp-counters-body"></div>
    <button id="insp-add-counter-btn" class="add-counter-btn">${icon("plus", { size: 12 })}${t().addCountUp}</button>
    <div id="linked-from-section"></div>
  `;

  // "メモ"/"カウントアップ" — same live-markdown editor + count-up widget as
  // the quick-memo panel (scratch.ts), scoped to this node instead of the
  // global scratchpad. Style is shared via scratch.ts's unscoped
  // .note-live-editor/.scratch-counter-row/.add-counter-btn rules
  // (2026-08-27, "クイックメモと同じ感じに" — style unification only, the
  // Inspector's existing buttons above are untouched).
  const nodeIdAtRender = state.selected!;
  createLiveEditor(el("insp-note-editor"), node.note ?? "", async (text) => {
    await fetch(`/api/nodes/${encodeURIComponent(nodeIdAtRender)}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: text }),
    });
    node.note = text;
  });
  renderNodeCounters(nodeIdAtRender, node.counters ?? []);
  el("insp-add-counter-btn").onclick = async () => {
    const c: Counter = { id: genCounterId(), label: "", value: 0 };
    const res = await fetch(`/api/nodes/${encodeURIComponent(nodeIdAtRender)}/counters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    if (res.ok) {
      const updated = (await res.json()) as { counters: Counter[] };
      node.counters = updated.counters;
      if (state.selected === nodeIdAtRender) renderNodeCounters(nodeIdAtRender, node.counters);
    }
  };

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

  const archiveBtn = document.getElementById("archive-btn") as HTMLButtonElement | null;
  if (archiveBtn) {
    archiveBtn.onclick = async () => {
      archiveBtn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/archive-toggle`, { method: "POST" });
      await refreshGraph();
      // Hides/unhides this build in the sidebar (2026-08-27). If this was
      // the currently-viewed build and it just got archived, refreshSidebar()
      // switches the view to the next remaining one (which fires its own
      // loadReport()) — the loadReport() below then just re-renders whatever
      // state.focus ends up being, so it stays correct either way (unchanged
      // view, or the just-switched-to one).
      refreshSidebar();
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

  // "付け替え" (2026-08-29) — moves this node (and everything already
  // nested under it, carried along automatically since a subtree is just
  // ids referenced from this node's own requires/contains) from wherever
  // it's currently linked to a different parent's requires or contains.
  // 空欄のまま実行すると「独立させる」（reparentNodeの逆、detachNode）
  // 扱いになる——ボタン列が多すぎるとの指摘（2026-08-29）を受けて、別々
  // だった2ボタンを1つのフォームに統合。
  const reparentBtn = document.getElementById("reparent-btn") as HTMLButtonElement | null;
  if (reparentBtn) {
    const form = el("reparent-form");
    reparentBtn.onclick = () => form.classList.remove("hidden");
    el("reparent-cancel-btn").onclick = () => form.classList.add("hidden");
    el("reparent-confirm-btn").onclick = async () => {
      const targetId = el<HTMLInputElement>("reparent-target-id").value.trim();
      const relation = el<HTMLSelectElement>("reparent-relation").value as "requires" | "contains";
      if (targetId === state.selected) {
        showToast(t().cannotReparentToSelf);
        return;
      }
      const res = targetId
        ? await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/reparent`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetId, relation }),
          })
        : await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/detach`, { method: "POST" });
      if (!res.ok) {
        // サーバー側のエラー文言をそのまま表示（存在しないID、サイクルに
        // なる付け替え等、理由ごとに変わるため固定文言にしない）。
        const detail = await res.text();
        showToast(t().reparentFailed(targetId ? t().reparentWord : t().detachWord, detail));
        return;
      }
      form.classList.add("hidden");
      // 移動先が今フォーカス中のBuildの外だと、このノードはstate.reportの
      // メンバーから外れる（node-modal.tsの削除フローと同じ理由でここも
      // 選択解除する——found via console error 2026-08-29: state.selected
      // が消えたノードを指したままrenderPanel()がnode.stateを読んで例外）。
      state.selected = null;
      await refreshGraph();
      refreshSidebar();
      await loadReport();
      showToast(
        targetId ? t().reparented(relation === "contains" ? t().containsWord : t().requiresWord) : t().detached,
        "success",
      );
    };
  }

  // Relic node: show a Vault-status badge, plus a Resurgence badge if the
  // relic is also currently purchasable via Prime Resurgence (Varzia) —
  // both can be true at once, that's the whole point of Resurgence
  // (2026-08-30, previously Relic nodes never checked Resurgence at all).
  if (node.type === "Relic") {
    fetch(`/api/wfcd/relic-status?name=${encodeURIComponent(node.name)}`)
      .then((r) => (r.ok ? (r.json() as Promise<RelicStatusResponse>) : null))
      .then((res) => {
        const badge = document.getElementById("vault-badge");
        if (!badge || !res) return;
        let html = "";
        if (res.vaulted) html += `<span class="badge-vaulted">${gameIcon("lorc-padlock")}${t().vaulted}</span>`;
        if (res.resurgence?.available) {
          html += `<span class="badge-resurgence">${gameIcon("lorc-hourglass")}${t().resurgenceStock(res.resurgence.expiry.slice(0, 10))}</span>`;
        }
        badge.innerHTML = html;
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
            `<span class="badge-resurgence">${gameIcon("lorc-hourglass")}${t().resurgenceStock((vt.expiry ?? "").slice(0, 10))}</span>`,
          );
        }
      })
      .catch(() => {});
  }

  void renderLinkedFrom(state.selected);
}

/** Renders/wires the selected node's counters list — same layout and
 * increment/decrement/rename/delete flow as scratch.ts's renderCounters(),
 * just pointed at /api/nodes/:id/counters instead of /api/scratch/counters.
 * `counters` is the live array on the report node (mutated in place so
 * later re-renders from the same renderPanel() call stay in sync). */
function renderNodeCounters(nodeId: string, counters: Counter[]): void {
  const body = document.getElementById("insp-counters-body");
  if (!body) return;
  if (!counters.length) {
    body.innerHTML = `<div class="counters-empty">${t().noCountersYet}</div>`;
    return;
  }
  body.innerHTML = counters
    .map(
      (c) => `
      <div class="scratch-counter-row" data-counter-id="${c.id}">
        <input type="text" class="sc-label-input" placeholder="${t().counterLabelPlaceholder}" value="${escapeHtml(c.label)}">
        <button class="sc-dec" title="-1">${icon("minus", { size: 12 })}</button>
        <input type="number" class="sc-value" value="${c.value}">
        <button class="sc-inc" title="+1">${icon("plus", { size: 12 })}</button>
        <button class="sc-del" title="${t().delete}">${icon("x", { size: 12 })}</button>
      </div>
    `,
    )
    .join("");

  body.querySelectorAll<HTMLInputElement>(".sc-label-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: input.value }),
      });
      const c = counters.find((x) => x.id === id);
      if (c) c.label = input.value;
    });
  });
  body.querySelectorAll<HTMLButtonElement>(".sc-inc").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}/increment`, { method: "POST" });
      if (res.ok) {
        const updated = (await res.json()) as Counter;
        const c = counters.find((x) => x.id === id);
        if (c) c.value = updated.value;
        renderNodeCounters(nodeId, counters);
      }
    });
  });
  body.querySelectorAll<HTMLButtonElement>(".sc-dec").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}/decrement`, { method: "POST" });
      if (res.ok) {
        const updated = (await res.json()) as Counter;
        const c = counters.find((x) => x.id === id);
        if (c) c.value = updated.value;
        renderNodeCounters(nodeId, counters);
      }
    });
  });
  body.querySelectorAll<HTMLInputElement>(".sc-value").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      const value = parseInt(input.value, 10) || 0;
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}/value`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Counter;
        const c = counters.find((x) => x.id === id);
        if (c) c.value = updated.value;
        renderNodeCounters(nodeId, counters);
      }
    });
  });
  body.querySelectorAll<HTMLButtonElement>(".sc-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}`, { method: "DELETE" });
      const idx = counters.findIndex((x) => x.id === id);
      if (idx !== -1) counters.splice(idx, 1);
      renderNodeCounters(nodeId, counters);
    });
  });
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
    if (item.chainViewNodeId === forNodeId) links.push({ label: t().loadoutsItemSuffix(item.name), href: "/loadouts.html" });
  }
  for (const set of Object.values(loadouts?.buildSets ?? {})) {
    if (set.chainViewBuildId === forNodeId) links.push({ label: t().loadoutsBuildSetSuffix(set.name), href: "/loadouts.html" });
  }
  for (const [key, jaLabel] of Object.entries(t().collectionCategories)) {
    const bucket = collections?.[key];
    if (!bucket || typeof bucket !== "object") continue;
    for (const entry of Object.values(bucket)) {
      if (entry.chainViewNodeId === forNodeId) {
        links.push({ label: t().collectionsSuffix(entry.name ?? entry.weaponName ?? "?", jaLabel), href: "/collections.html" });
      }
    }
  }

  if (!links.length) {
    section.innerHTML = "";
    return;
  }
  section.innerHTML = `
    <div class="ph-row" style="margin-top:10px;color:var(--muted);font-size:0.78rem;">${t().linkedFrom}</div>
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
