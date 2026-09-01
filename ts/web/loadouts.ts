// Port of the inline script in web/loadouts.html.
import type { Node } from "../server/model.ts";
import type { BuildSet, ConfigSlot, Data as LoadoutData, Item, ItemType } from "../server/loadout.ts";
import type { NextActionReport } from "../server/engine.ts";
import { confirmInline } from "./confirm-inline.ts";
import { el, maybeEl } from "./dom.ts";
import { icon, iconLabel } from "./icons.ts";
import { renderMiniGraph } from "./minigraph.ts";
import { renderNoteMd } from "./notemd.ts";
import { showToast } from "./toast.ts";
import { initWfcdRefresh } from "./wfcd-refresh.ts";
import { buildBuildSetExportText, buildItemExportText, wireCopyButtons } from "./export.ts";
import "./card-tilt.ts";
import "./booster.ts";
import "./spoiler-warning.ts";
import "./quest-onboarding.ts";
import "./manual-launcher.ts";
import "./scratch.ts";
import "./kofi-link.ts";
import { applyI18nText, effective, onLocaleChange, type Locale } from "./locale.ts";
import "./theme.ts";
import "./wallpaper.ts";
import "./scroll-top.ts";
import { autoGenerateChainViewNode, autoLinkId, forcePushToCollections } from "./wfcd-autolink.ts";

const state: {
  data: LoadoutData;
  activeTab: Record<string, ConfigSlot>;
  chainViewBuilds: Node[];
  nodesById: Record<string, Node>;
} = { data: { schemaVersion: 1, items: {}, buildSets: {} }, activeTab: {}, chainViewBuilds: [], nodesById: {} };

// UI-chrome strings (2026-08-30, part of the page-by-page i18n rollout — see
// locale.ts). Covers both the static HTML (applied via applyI18nText()'s
// data-i18n scan) and everything this file itself renders dynamically.
interface UIStrings {
  [key: string]: string;
  refreshUpdating: string;
  refreshDone: string;
  refreshTitle: string;
  helpToggleTitle: string;
  helpPopover: string;
  itemsHeading: string;
  buildSetsHeading: string;
  newRegistration: string;
  toggleOpenClose: string;
  statusSatisfied: string;
  statusActionable: string;
  statusBlocked: string;
  itemMinigraphLegendTitle: string;
  buildsetMinigraphLegendTitle: string;
  filterByName: string;
  noModsShort: string;
  copyItemTitle: string;
  deleteTitle: string;
  addModPlaceholder: string;
  showMore: string;
  collapse: string;
  showRemainingTitle: string;
  noItemsRegistered: string;
  deleteConfirm: string;
  noMatch: string;
  favoriteOn: string;
  favoriteOff: string;
  editModalTitle: string;
  chainViewLinkOptional: string;
  memoLabel: string;
  memoHint: string;
  optionalPlaceholder: string;
  cancel: string;
  save: string;
  addItemModalTitle: string;
  bulkRegister: string;
  typeLabel: string;
  nameFilterLabel: string;
  namePlaceholder: string;
  modConfigOptional: string;
  chainViewAddCheckbox: string;
  add: string;
  enterName: string;
  bulkAddedFeedback: string;
  buildSetEditTitle: string;
  buildSetCreateTitle: string;
  buildSetNameLabel: string;
  buildSetNamePlaceholder: string;
  frameFieldLabel: string;
  addWeapon: string;
  chainViewLinkProgress: string;
  chainViewAddCheckboxBuildSet: string;
  weaponFieldLabel: string;
  noLink: string;
  notSelected: string;
  unknownItem: string;
  enterBuildSetName: string;
  notConfigured: string;
  noWeapons: string;
  fetchFailed: string;
  progressDone: string;
  copyBuildSetTitle: string;
  loading: string;
}
const STRINGS: Record<Locale, UIStrings> = {
  ja: {
    refreshUpdating: "更新中…",
    refreshDone: "更新完了",
    refreshTitle: "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください",
    helpToggleTitle: "このページについて",
    helpPopover:
      "<div style='margin-bottom:8px;'>フレーム/武器ごとのMODコンフィグ（A/B/C）とビルドセットの管理ページです。</div>" +
      "<ul style='margin:0 0 10px;padding-left:18px;'>" +
      "<li>Itemsは種別（Frame/Weapon/Companion/Archwing/Necramech）ごとにサブセクション分けされています</li>" +
      "<li>星マーク（★）は「今のビルドで使ってる/優先度高い」という主観マーカーで、お気に入りが各セクションの先頭に並びます（並び順は起動時点で固定され、編集中に急に順番が変わることはありません）</li>" +
      "<li>各セクションは右上のアイコンで開閉でき、状態は次回起動時も引き継がれます</li>" +
      "<li>名前で絞り込み検索ができます。8件を超える分は「もっと見る」で表示／折りたたみを切り替えられます</li>" +
      "<li>見出し横の＋アイコンから新規登録できます</li>" +
      "<li>Chain Viewと連携済みのアイテムには、カード内に進捗のミニグラフが表示されます（色の意味はItems見出し横の凡例を参照。点にカーソルを合わせると内訳が出ます）</li>" +
      "</ul>" +
      "<div>⚠️ フレーム/武器名やビルド名など、未プレイのコンテンツ名が表示されることがあります。</div>",
    itemsHeading: "Items（Frame / Weapon）— A/B/C コンフィグ管理",
    buildSetsHeading: "Build Sets（フレーム＋武器の組み合わせ）",
    newRegistration: "新規登録",
    toggleOpenClose: "開閉",
    statusSatisfied: "達成済み",
    statusActionable: "実行可能",
    statusBlocked: "前提待ち",
    itemMinigraphLegendTitle: "Chain View連携アイテムのミニグラフの色",
    buildsetMinigraphLegendTitle: "Chain View連携ビルドのミニグラフの色",
    filterByName: "名前で絞り込み",
    noModsShort: "MODなし",
    copyItemTitle: "フレーム/MOD/メモをテキストでコピー",
    deleteTitle: "削除",
    addModPlaceholder: "MOD名を追加してEnter",
    showMore: "もっと見る（+{n}）",
    collapse: "折りたたむ",
    showRemainingTitle: "残り{n}件を表示",
    noItemsRegistered: "まだ登録がありません（見出し横の＋から登録できます）",
    deleteConfirm: "「{name}」を削除する？",
    noMatch: "一致なし（このまま自由入力できます）",
    favoriteOn: "お気に入り解除",
    favoriteOff: "お気に入りにする",
    editModalTitle: "{name} を編集",
    chainViewLinkOptional: "Chain View連携（任意）",
    memoLabel: "メモ",
    memoHint: "**太字**／- で箇条書き／- [ ]・- [x] でチェックリスト（保存後はクリックで完了切替）",
    optionalPlaceholder: "任意",
    cancel: "キャンセル",
    save: "保存",
    addItemModalTitle: "アイテムを追加",
    bulkRegister: "連続登録（名前だけで追加を続ける）",
    typeLabel: "種別",
    nameFilterLabel: "名前（キーワードで絞り込み）",
    namePlaceholder: "例: Ash",
    modConfigOptional: "MOD（Config A、任意）",
    chainViewAddCheckbox: "Chain Viewにも追加する（未入手を追跡、Frame/Weaponのみ）",
    add: "追加",
    enterName: "名前を入力して",
    bulkAddedFeedback: "{n}件追加しました（最新: {name}）",
    buildSetEditTitle: "Build Set を編集",
    buildSetCreateTitle: "Build Set を作成",
    buildSetNameLabel: "ビルドセット名",
    buildSetNamePlaceholder: "例: Ash Stealth Set",
    frameFieldLabel: "Frame:",
    addWeapon: "武器を追加",
    chainViewLinkProgress: "Chain View連携（進捗を横断表示、任意）",
    chainViewAddCheckboxBuildSet: "Chain Viewにも追加する（Frameと武器から自動生成、任意）",
    weaponFieldLabel: "Weapon{n}:",
    noLink: "（連携なし）",
    notSelected: "（未選択）",
    unknownItem: "(不明なアイテム: {id})",
    enterBuildSetName: "ビルドセット名を入力して",
    notConfigured: "（未設定）",
    noWeapons: "武器なし",
    fetchFailed: "取得失敗",
    progressDone: "{done} / {total} 完了（{pct}%）",
    copyBuildSetTitle: "ビルドセットをテキストでコピー",
    loading: "読み込み中…",
  },
  en: {
    refreshUpdating: "Updating…",
    refreshDone: "Updated",
    refreshTitle: "Press this if a new frame/weapon etc. added by a game update isn't showing up as a candidate",
    helpToggleTitle: "About this page",
    helpPopover:
      "<div style='margin-bottom:8px;'>Manages per-frame/weapon MOD configs (A/B/C) and Build Sets.</div>" +
      "<ul style='margin:0 0 10px;padding-left:18px;'>" +
      "<li>Items is split into subsections by type (Frame/Weapon/Companion/Archwing/Necramech).</li>" +
      "<li>The star (★) is a subjective \"currently using this / high priority\" marker — favorites sort to the front of each section (the order is fixed at page load, so it won't suddenly jump around mid-edit).</li>" +
      "<li>Each section can be collapsed via the icon at top right; the state carries over to the next launch.</li>" +
      "<li>You can filter by name. Beyond 8 entries, \"Show more\" toggles the rest.</li>" +
      "<li>Register a new one from the + icon next to the heading.</li>" +
      "<li>Items linked to Chain View show a small progress graph on their card (see the legend next to the Items heading for what the colors mean — hover a dot for the breakdown).</li>" +
      "</ul>" +
      "<div>⚠️ Frame/weapon/build names and similar may be shown here even for content you haven't played yet.</div>",
    itemsHeading: "Items (Frame / Weapon) — A/B/C config management",
    buildSetsHeading: "Build Sets (frame + weapon combinations)",
    newRegistration: "New registration",
    toggleOpenClose: "Toggle",
    statusSatisfied: "Satisfied",
    statusActionable: "Actionable",
    statusBlocked: "Blocked",
    itemMinigraphLegendTitle: "Color meaning for Chain-View-linked items' mini graph",
    buildsetMinigraphLegendTitle: "Color meaning for Chain-View-linked builds' mini graph",
    filterByName: "Filter by name",
    noModsShort: "No mods",
    copyItemTitle: "Copy frame/MODs/memo as text",
    deleteTitle: "Delete",
    addModPlaceholder: "Add a MOD name, then Enter",
    showMore: "Show more (+{n})",
    collapse: "Collapse",
    showRemainingTitle: "Show the remaining {n}",
    noItemsRegistered: "Nothing registered yet (use the + next to the heading)",
    deleteConfirm: "Delete “{name}”?",
    noMatch: "No match (you can still type it in freely)",
    favoriteOn: "Unfavorite",
    favoriteOff: "Favorite",
    editModalTitle: "Edit {name}",
    chainViewLinkOptional: "Chain View link (optional)",
    memoLabel: "Memo",
    memoHint: "**bold** / - for a bullet / - [ ] · - [x] for a checklist (click to toggle completion after saving)",
    optionalPlaceholder: "Optional",
    cancel: "Cancel",
    save: "Save",
    addItemModalTitle: "Add an item",
    bulkRegister: "Bulk-register (keep adding by name only)",
    typeLabel: "Type",
    nameFilterLabel: "Name (type to filter)",
    namePlaceholder: "e.g. Ash",
    modConfigOptional: "MODs (Config A, optional)",
    chainViewAddCheckbox: "Also add to Chain View (tracks not-yet-owned, Frame/Weapon only)",
    add: "Add",
    enterName: "Enter a name",
    bulkAddedFeedback: "Added {n} so far (latest: {name})",
    buildSetEditTitle: "Edit Build Set",
    buildSetCreateTitle: "Create a Build Set",
    buildSetNameLabel: "Build Set name",
    buildSetNamePlaceholder: "e.g. Ash Stealth Set",
    frameFieldLabel: "Frame:",
    addWeapon: "Add a weapon",
    chainViewLinkProgress: "Chain View link (cross-page progress display, optional)",
    chainViewAddCheckboxBuildSet: "Also add to Chain View (auto-generated from the frame and weapons, optional)",
    weaponFieldLabel: "Weapon{n}:",
    noLink: "(no link)",
    notSelected: "(not selected)",
    unknownItem: "(unknown item: {id})",
    enterBuildSetName: "Enter a Build Set name",
    notConfigured: "(not set)",
    noWeapons: "No weapons",
    fetchFailed: "Failed to fetch",
    progressDone: "{done} / {total} done ({pct}%)",
    copyBuildSetTitle: "Copy this Build Set as text",
    loading: "Loading…",
  },
};
function t(): UIStrings {
  return STRINGS[effective()];
}
function fmt(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template);
}

// Per-panel collapsed state persists in localStorage (same pattern as
// web/collections.html's initPlainCollapsible, 2026-08-23).
const COLLAPSE_KEY_PREFIX = "warframe-state-graph:loadouts:collapsed:";
function getStoredCollapsed(prefix: string): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY_PREFIX + prefix) === "1";
  } catch {
    return false;
  }
}
function setStoredCollapsed(prefix: string, collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY_PREFIX + prefix, collapsed ? "1" : "0");
  } catch {
    /* localStorage unavailable */
  }
}
function initPlainCollapsible(prefix: string): void {
  const body = el(`${prefix}-body`);
  const chevron = el(`${prefix}-chevron`);
  chevron.innerHTML = icon("chevron-down");
  // The +add button and the minigraph color legend both live in the same
  // .panel-head as the chevron — neither means anything while the section
  // itself is collapsed (nothing to add into a hidden list; no dots to
  // explain), so hide them together with the body rather than leaving them
  // stranded next to a closed section (2026-08-26, のっち's call).
  const panelHead = chevron.closest<HTMLElement>(".panel-head");
  const addBtn = panelHead?.querySelector<HTMLElement>(".add-btn");
  const legend = panelHead?.querySelector<HTMLElement>(".status-legend");
  function applyCollapsed(collapsed: boolean): void {
    body.classList.toggle("hidden", collapsed);
    chevron.classList.toggle("expanded", !collapsed);
    addBtn?.classList.toggle("hidden", collapsed);
    legend?.classList.toggle("hidden", collapsed);
  }
  applyCollapsed(getStoredCollapsed(prefix));
  function toggle(): void {
    const nowHidden = !body.classList.contains("hidden");
    applyCollapsed(nowHidden);
    setStoredCollapsed(prefix, nowHidden);
  }
  chevron.addEventListener("click", toggle);
}
initPlainCollapsible("items");
initPlainCollapsible("buildsets");

el<HTMLInputElement>("items-search").addEventListener("input", (e) => {
  itemsSearchQuery = (e.target as HTMLInputElement).value;
  renderItems();
});
el<HTMLInputElement>("buildsets-search").addEventListener("input", (e) => {
  buildsetsSearchQuery = (e.target as HTMLInputElement).value;
  renderBuildSets();
});

initWfcdRefresh({
  labels: () => ({ updating: t().refreshUpdating, done: t().refreshDone, title: t().refreshTitle }),
  onRefreshed: () => loadReferenceData(),
});

el("help-toggle").innerHTML = icon("info");
el("items-add-btn").innerHTML = icon("plus");
el("items-add-btn").addEventListener("click", openItemModal);
el("buildsets-add-btn").innerHTML = icon("plus");
el("buildsets-add-btn").addEventListener("click", () => openBuildSetModal());
el("new-item-note-help").innerHTML = icon("circle-alert", { size: 13 });
el("item-edit-note-help").innerHTML = icon("circle-alert", { size: 13 });
el("help-toggle").addEventListener("click", (e) => {
  e.stopPropagation();
  el("help-popover").classList.toggle("hidden");
});
el("help-popover").addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => el("help-popover").classList.add("hidden"));

async function loadAll(): Promise<void> {
  const res = await fetch("/api/loadouts");
  state.data = (await res.json()) as LoadoutData;
  if (!state.data.items) state.data.items = {};
  if (!state.data.buildSets) state.data.buildSets = {};
  render();
}

// All Chain View nodes (for the Item/BuildSet link dropdown + mini progress graph).
async function loadChainViewGraph(): Promise<void> {
  try {
    const res = await fetch("/api/graph");
    const graph = (await res.json()) as { nodes?: Record<string, Node> };
    state.nodesById = graph.nodes ?? {};
    state.chainViewBuilds = Object.values(state.nodesById).filter((n) => n.type === "Build" || n.type === "Goal");
  } catch {
    state.nodesById = {};
    state.chainViewBuilds = [];
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function chainViewOptions(selectedId: string | undefined): string {
  return (
    `<option value="">${t().noLink}</option>` +
    Object.values(state.nodesById)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => `<option value="${n.id}" ${n.id === selectedId ? "selected" : ""}>${escapeHtml(n.name)}（${n.type}）</option>`)
      .join("")
  );
}

async function createItem(name: string, type: ItemType, mods: string[], note: string): Promise<Item> {
  const item: Item = { id: uid("item"), name, type, configs: { A: mods || [], B: [], C: [] }, note: note || "" };
  await fetch("/api/loadout-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
  await loadAll();
  return item;
}
async function updateItem(item: Item): Promise<void> {
  await fetch("/api/loadout-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
  await loadAll();
}
async function deleteItem(id: string): Promise<void> {
  await fetch(`/api/loadout-items/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAll();
}
async function setConfig(itemId: string, slot: ConfigSlot, mods: string[]): Promise<void> {
  await fetch(`/api/loadout-items/${encodeURIComponent(itemId)}/configs/${slot}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mods }),
  });
  await loadAll();
}
async function saveBuildSet(set: BuildSet): Promise<void> {
  await fetch("/api/build-sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(set) });
  await loadAll();
}
async function deleteBuildSet(id: string): Promise<void> {
  await fetch(`/api/build-sets/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAll();
}

function render(): void {
  renderItems();
  renderBuildSets();
}

// Same favorite-star button as Collections (Riven/Kuva), 2026-08-20 added to Item too.
function starBtn(favorite: boolean | undefined, dataAttrs: string): string {
  return `<button class="star-btn ${favorite ? "favorite" : ""}" ${dataAttrs} title="${favorite ? t().favoriteOn : t().favoriteOff}">${icon(favorite ? "star" : "star-off", { size: 18 })}</button>`;
}
function toggleItemFavorite(id: string): void {
  const item = state.data.items[id]!;
  void updateItem({ ...item, favorite: !item.favorite });
}

// Companion runs a single loadout (low switch frequency), so it's always
// Config A with no tab UI — the data shape (configs) stays shared with
// Frame/Weapon, this is purely a UI simplification (2026-08-20 design). The
// type label is dropped from the card since the subsection heading already
// says it (same reasoning as Collections' Kuva-lineage badge removal,
// 2026-08-23).
function itemCardHtml(item: Item): string {
  const isCompanion = item.type === "Companion";
  const activeSlot: ConfigSlot = isCompanion ? "A" : (state.activeTab[item.id] ?? "A");
  const mods = item.configs?.[activeSlot] ?? [];
  const tabs = isCompanion
    ? ""
    : (["A", "B", "C"] as ConfigSlot[])
        .map((slot) => `<div class="tab ${slot === activeSlot ? "active" : ""}" data-item="${item.id}" data-slot="${slot}">Config ${slot}</div>`)
        .join("");
  const tags =
    mods
      .map((m, i) => `<span class="mod-tag">${escapeHtml(m)}<span class="x" data-item="${item.id}" data-slot="${activeSlot}" data-idx="${i}">${icon("x", { size: 12 })}</span></span>`)
      .join("") || `<span class="empty">${t().noModsShort}</span>`;

  return `
      <div class="item-card" data-open-item="${item.id}">
        <div class="item-head">
          <div class="item-head-left">
            ${starBtn(item.favorite, `data-toggle-item-fav="${item.id}"`)}
            <span class="item-name">${escapeHtml(item.name)}</span>
          </div>
          <div class="inline-form">
            <button class="icon-btn" data-copy-item="${item.id}" title="${t().copyItemTitle}">${icon("copy")}</button>
            <button class="icon-btn danger" data-del-item="${item.id}" title="${t().deleteTitle}">${icon("trash-2")}</button>
          </div>
        </div>
        ${item.chainViewNodeId ? `<div id="minigraph-item-${item.id}"></div>` : ""}
        <div class="tabs">${tabs}</div>
        <div class="mod-tags">${tags}</div>
        <div class="inline-form">
          <input type="text" placeholder="${t().addModPlaceholder}" data-add-mod="${item.id}" data-slot="${activeSlot}" class="mod-input" autocomplete="off">
        </div>
        ${item.note ? `<div class="card-memo" id="notemd-item-${item.id}"></div>` : ""}
      </div>`;
}

// Items split into subsections by type (Frame/Weapon/Companion/Archwing/
// Necramech), same mechanism as web/collections.html's Kuva/Tenet/Coda split
// (2026-08-23). A type with zero entries gets no heading. Each subsection
// caps at 8 entries by default with a "show more" toggle (2026-08-23); the
// cap is lifted entirely while searching. Expansion state persists for the
// page session only (not localStorage) — a deliberate lightweight tradeoff.
const PAGE_SIZE = 8;
const ITEM_TYPES: ItemType[] = ["Frame", "Weapon", "Companion", "Archwing", "Necramech"];
let itemsSearchQuery = "";
const expandedItemTypes = new Set<ItemType>();

// lastUsedAt only uses the value as of "when this page was opened" as a
// stable sort snapshot, fixed for the rest of this session (not re-read from
// live state each render) — otherwise editing one card's MODs would warp it
// to the top mid-edit and lose the operator's place (2026-08-23). Sort order
// only catches up on the next page load.
let itemsSortSnapshot: Record<string, number> | null = null;
function captureItemsSortSnapshot(): void {
  itemsSortSnapshot = {};
  Object.values(state.data.items).forEach((i) => {
    itemsSortSnapshot![i.id] = i.lastUsedAt ?? 0;
  });
}

function renderItems(): void {
  if (!itemsSortSnapshot) captureItemsSortSnapshot();
  const listEl = el("items-list");
  const query = itemsSearchQuery.trim().toLowerCase();
  const items = Object.values(state.data.items).filter((i) => !query || i.name.toLowerCase().includes(query));

  const byType: Record<string, Item[]> = {};
  ITEM_TYPES.forEach((t) => {
    byType[t] = [];
  });
  items.forEach((item) => (byType[item.type] ??= []).push(item));

  // A jump nav to skip directly to a subsection (5 types is a lot to scroll
  // through). Types with no entries are omitted.
  el("items-jump-nav").innerHTML = ITEM_TYPES.filter((t) => byType[t]!.length)
    .map((t) => `<a href="#items-type-${t}" class="tab" style="text-decoration:none;">${t}（${byType[t]!.length}）</a>`)
    .join("");

  listEl.innerHTML =
    ITEM_TYPES.map((type) => {
      // Favorite first, then most-recently-touched (per the snapshot), then
      // name — so items that aren't starred but were recently edited still
      // surface (2026-08-23, avoiding "favorite becomes the de facto visibility switch").
      const typeItems = (byType[type] ?? []).sort((a, b) => {
        const aUsed = a.id in itemsSortSnapshot! ? itemsSortSnapshot![a.id]! : (a.lastUsedAt ?? 0);
        const bUsed = b.id in itemsSortSnapshot! ? itemsSortSnapshot![b.id]! : (b.lastUsedAt ?? 0);
        // favorite is optional (server/loadout.ts's ItemSchema), so an
        // item that's never been touched has it as `undefined`, not
        // `false` — Number(undefined) is NaN, and NaN is falsy in JS, so
        // the `||` chain below silently skipped straight to the recency
        // comparison whenever either side was unset. Favoriting an item
        // then never actually moved it to the front (real bug, found
        // 2026-08-29 re-verifying the TS migration checklist). !! coerces
        // both sides to a real boolean first.
        return (Number(!!b.favorite) - Number(!!a.favorite)) || (bUsed - aUsed) || a.name.localeCompare(b.name);
      });
      if (!typeItems.length) return "";
      const userExpanded = expandedItemTypes.has(type);
      const expanded = !!query || userExpanded;
      const shown = expanded ? typeItems : typeItems.slice(0, PAGE_SIZE);
      const moreCount = typeItems.length - shown.length;
      let toggleHtml = "";
      if (!query && typeItems.length > PAGE_SIZE) {
        toggleHtml = userExpanded
          ? `<button class="show-more-card" data-collapse-items="${type}">${iconLabel("chevron-up", t().collapse)}</button>`
          : `<button class="show-more-card" data-show-more-items="${type}" title="${fmt(t().showRemainingTitle, { n: moreCount })}">${iconLabel("chevron-down", fmt(t().showMore, { n: moreCount }))}</button>`;
      }
      return `<div class="kind-group-title" id="items-type-${type}">${type}（${typeItems.length}）</div><div class="items-grid">${shown.map(itemCardHtml).join("")}${toggleHtml}</div>`;
    }).join("") || `<div class="empty">${t().noItemsRegistered}</div>`;

  listEl.querySelectorAll<HTMLElement>("[data-show-more-items]").forEach((btn) =>
    btn.addEventListener("click", () => {
      expandedItemTypes.add(btn.dataset.showMoreItems as ItemType);
      renderItems();
    })
  );
  listEl.querySelectorAll<HTMLElement>("[data-collapse-items]").forEach((btn) =>
    btn.addEventListener("click", () => {
      expandedItemTypes.delete(btn.dataset.collapseItems as ItemType);
      renderItems();
    })
  );

  listEl.querySelectorAll<HTMLElement>(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      state.activeTab[t.dataset.item!] = t.dataset.slot as ConfigSlot;
      renderItems();
    })
  );
  listEl.querySelectorAll<HTMLElement>(".mod-tag .x").forEach((x) =>
    x.addEventListener("click", () => {
      const item = state.data.items[x.dataset.item!]!;
      const slot = x.dataset.slot as ConfigSlot;
      const mods = [...(item.configs[slot] ?? [])];
      mods.splice(Number(x.dataset.idx), 1);
      void setConfig(x.dataset.item!, slot, mods);
    })
  );
  listEl.querySelectorAll<HTMLInputElement>("[data-add-mod]").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !inp.value.trim()) return;
      const item = state.data.items[inp.dataset.addMod!]!;
      const slot = inp.dataset.slot as ConfigSlot;
      const mods = [...(item.configs[slot] ?? []), inp.value.trim()];
      void setConfig(inp.dataset.addMod!, slot, mods);
    })
  );
  listEl.querySelectorAll<HTMLElement>("[data-toggle-item-fav]").forEach((btn) =>
    btn.addEventListener("click", () => toggleItemFavorite(btn.dataset.toggleItemFav!))
  );
  wireCopyButtons(listEl, "[data-copy-item]", (btn) => buildItemExportText(state.data.items[btn.dataset.copyItem!]!));
  listEl.querySelectorAll<HTMLElement>("[data-del-item]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (await confirmInline(btn, fmt(t().deleteConfirm, { name: state.data.items[btn.dataset.delItem!]!.name }))) void deleteItem(btn.dataset.delItem!);
    })
  );
  // Card click opens the edit (link/note) modal. Individual controls (tab
  // switch, MOD add/remove) are excluded so they don't also trigger it
  // (same mechanism as web/collections.html's data-open-riven, 2026-08-23).
  // There used to be a pencil button here doing exactly the same thing;
  // removed 2026-08-30 (のっち指摘: it conflicted with the card click —
  // two controls for one action, and the button sat inside the card so it
  // needed its own stopPropagation dance). Card click is now the only way in.
  listEl.querySelectorAll<HTMLElement>("[data-open-item]").forEach((card) =>
    card.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("input") || target.closest(".tab") || target.closest(".mod-tag")) return;
      openItemEditModal(card.dataset.openItem!);
    })
  );

  items.forEach((item) => {
    if (!item.chainViewNodeId) return;
    const holder = maybeEl(`minigraph-item-${item.id}`);
    if (holder) renderMiniGraph(holder, item.chainViewNodeId, state.nodesById);
  });
  items.forEach((item) => {
    if (!item.note) return;
    const holder = maybeEl(`notemd-item-${item.id}`);
    if (holder) renderNoteMd(holder, item.note, (newNote) => void updateItem({ ...item, note: newNote }));
  });
}

// MOD-add autocomplete (same mechanism as web/collections.html's
// setupWeaponCombobox, 2026-08-23). Cards are rebuilt on every render, so
// this wires via delegation on #items-list rather than per-input. One
// shared position:fixed box follows the focused input (position:fixed
// escapes the stacking context .item-card's will-change:transform creates,
// so it never gets tucked under a later panel).
const modSuggestEl = el("mod-suggest");
function hideModSuggest(): void {
  modSuggestEl.classList.add("hidden");
}
function updateModSuggest(input: HTMLInputElement): void {
  const q = input.value.trim().toLowerCase();
  if (!q) {
    hideModSuggest();
    return;
  }
  const matches = refData.mods.filter((n) => n.toLowerCase().includes(q)).slice(0, 30);
  modSuggestEl.innerHTML = matches.length
    ? matches.map((n) => `<div class="suggest-item">${escapeHtml(n)}</div>`).join("")
    : `<div class="suggest-empty">${t().noMatch}</div>`;
  modSuggestEl.querySelectorAll<HTMLElement>(".suggest-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = item.textContent ?? "";
      hideModSuggest();
      input.focus();
    });
  });
  const rect = input.getBoundingClientRect();
  modSuggestEl.style.left = `${rect.left}px`;
  modSuggestEl.style.top = `${rect.bottom + 4}px`;
  modSuggestEl.style.minWidth = `${rect.width}px`;
  modSuggestEl.classList.remove("hidden");
}
el("items-list").addEventListener("input", (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("mod-input")) updateModSuggest(target as HTMLInputElement);
});
el("items-list").addEventListener("focusin", (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("mod-input")) updateModSuggest(target as HTMLInputElement);
});
el("items-list").addEventListener("focusout", (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("mod-input")) setTimeout(hideModSuggest, 150);
});

// Item.chainViewNodeId / note are low-frequency asides, so they're edited via
// this dedicated modal rather than living in the registration form (keeps
// that one to just name/type).
let itemEditId: string | null = null;
function openItemEditModal(itemId: string): void {
  const item = state.data.items[itemId]!;
  itemEditId = itemId;
  el("item-edit-modal-title").textContent = fmt(t().editModalTitle, { name: item.name });
  el<HTMLSelectElement>("item-edit-chainview").innerHTML = chainViewOptions(item.chainViewNodeId);
  el<HTMLTextAreaElement>("item-edit-note").value = item.note ?? "";
  el("item-edit-modal-backdrop").classList.remove("hidden");
}
function closeItemEditModal(): void {
  el("item-edit-modal-backdrop").classList.add("hidden");
}
el("item-edit-cancel").addEventListener("click", closeItemEditModal);
el("item-edit-save").addEventListener("click", () => {
  const item = state.data.items[itemEditId!]!;
  const note = el<HTMLTextAreaElement>("item-edit-note").value.trim();
  const chainViewNodeId = el<HTMLSelectElement>("item-edit-chainview").value;
  void updateItem({ ...item, note, chainViewNodeId: chainViewNodeId || undefined });
  closeItemEditModal();
});

// ---------- Item registration modal ----------
// Pre-registration MODs (Config A) live on the registration modal itself
// (2026-08-23). Reuses the same look/removal interaction as a card's
// mod-tags/mod-tag.
let newItemMods: string[] = [];
function renderNewItemModTags(): void {
  const tagsEl = el("new-item-mod-tags");
  tagsEl.innerHTML =
    newItemMods.map((m, i) => `<span class="mod-tag">${escapeHtml(m)}<span class="x" data-remove-new-mod="${i}">${icon("x", { size: 12 })}</span></span>`).join("") ||
    `<span class="empty">${t().noModsShort}</span>`;
  tagsEl.querySelectorAll<HTMLElement>("[data-remove-new-mod]").forEach((x) =>
    x.addEventListener("click", () => {
      newItemMods.splice(Number(x.dataset.removeNewMod), 1);
      renderNewItemModTags();
    })
  );
}

let itemBulkCount = 0;
function openItemModal(): void {
  el<HTMLInputElement>("new-item-name").value = "";
  el<HTMLInputElement>("new-item-mod-input").value = "";
  el<HTMLTextAreaElement>("new-item-note").value = "";
  el<HTMLInputElement>("new-item-chainview-check").checked = false;
  newItemMods = [];
  renderNewItemModTags();
  hideSuggest();
  hideModSuggest();
  updateChainViewRowVisibility();
  el<HTMLInputElement>("item-bulk-check").checked = false;
  el("item-modal-optional").classList.remove("hidden");
  itemBulkCount = 0;
  el("item-bulk-feedback").classList.add("hidden");
  el("item-modal-backdrop").classList.remove("hidden");
}
function closeItemModal(): void {
  el("item-modal-backdrop").classList.add("hidden");
}
el("item-modal-cancel").addEventListener("click", closeItemModal);

el("item-bulk-check").addEventListener("change", (e) => {
  el("item-modal-optional").classList.toggle("hidden", (e.target as HTMLInputElement).checked);
});
el("new-item-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && el<HTMLInputElement>("item-bulk-check").checked) {
    e.preventDefault();
    el("add-item-btn").click();
  }
});

el("add-item-btn").addEventListener("click", async () => {
  const name = el<HTMLInputElement>("new-item-name").value.trim();
  const type = el<HTMLSelectElement>("new-item-type").value as ItemType;
  if (!name) {
    showToast(t().enterName);
    return;
  }
  const bulk = el<HTMLInputElement>("item-bulk-check").checked;
  if (bulk) {
    void createItem(name, type, [], "");
    // A Loadouts-originated registration always force-registers into
    // Collections too (same-name reuses the existing entry, owned:true).
    // Not awaited here either, to keep bulk registration fast (2026-08-25 item 27).
    void forcePushToCollections(type, name, true);
    itemBulkCount++;
    const fb = el("item-bulk-feedback");
    fb.textContent = fmt(t().bulkAddedFeedback, { n: itemBulkCount, name });
    fb.classList.remove("hidden");
    const nameInput = el<HTMLInputElement>("new-item-name");
    nameInput.value = "";
    nameInput.focus();
    return;
  }
  const note = el<HTMLTextAreaElement>("new-item-note").value.trim();
  const wantsChainView = el<HTMLInputElement>("new-item-chainview-check").checked;
  const item = await createItem(name, type, newItemMods, note);
  closeItemModal();

  // Collections registration is always forced regardless of type (same-name
  // reuses the existing entry, 2026-08-25 item 27) — done first so it's not
  // skipped by the navigation below.
  await forcePushToCollections(type, name, true);

  // Chain View add is opt-in (checkbox, Frame/Weapon only). Was a silent
  // background generate (autoGenerateChainViewNode) that never let relic
  // candidates be picked; now navigates to the real WFCD wizard pre-filled,
  // which links back to this item once the import completes (2026-08-30,
  // のっち依頼 — "レリックも登録できるように").
  if (wantsChainView && (type === "Frame" || type === "Weapon")) {
    location.href = `/?wfcd-generate=${encodeURIComponent(type)}&wfcd-name=${encodeURIComponent(name)}&link-back=loadout-item:${encodeURIComponent(item.id)}`;
  }
});

const newItemModInput = el<HTMLInputElement>("new-item-mod-input");
newItemModInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !newItemModInput.value.trim()) return;
  newItemMods.push(newItemModInput.value.trim());
  newItemModInput.value = "";
  hideModSuggest();
  renderNewItemModTags();
});
newItemModInput.addEventListener("input", () => updateModSuggest(newItemModInput));
newItemModInput.addEventListener("focus", () => updateModSuggest(newItemModInput));
newItemModInput.addEventListener("blur", () => setTimeout(hideModSuggest, 150));

function updateChainViewRowVisibility(): void {
  const type = el<HTMLSelectElement>("new-item-type").value;
  // WFCD auto-generation only supports Frame/Weapon (Chain View has no
  // Companion/Archwing/Necramech node type) — the checkbox row hides itself
  // for other types (2026-08-25 item 27).
  const supported = type === "Frame" || type === "Weapon";
  const row = el("new-item-chainview-row");
  row.classList.toggle("hidden", !supported);
  if (!supported) el<HTMLInputElement>("new-item-chainview-check").checked = false;
}
el("new-item-type").addEventListener("change", () => {
  el<HTMLInputElement>("new-item-name").value = "";
  hideSuggest();
  updateChainViewRowVisibility();
});

// ---------- Build Set ----------
interface BuildSetDraft {
  name: string;
  frameId: string;
  frameSlot: ConfigSlot;
  weapons: { itemId: string; config: ConfigSlot }[];
  chainViewBuildId: string;
  note: string;
}
let draft: BuildSetDraft = { name: "", frameId: "", frameSlot: "A", weapons: [], chainViewBuildId: "", note: "" };

function chainViewBuildOptions(selectedId: string | undefined): string {
  return (
    `<option value="">${t().noLink}</option>` +
    state.chainViewBuilds.map((b) => `<option value="${b.id}" ${b.id === selectedId ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")
  );
}
function frameOptions(selectedId: string): string {
  const frames = Object.values(state.data.items).filter((i) => i.type === "Frame");
  return `<option value="">${t().notSelected}</option>` + frames.map((f) => `<option value="${f.id}" ${f.id === selectedId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("");
}
function weaponOptions(selectedId: string): string {
  const weapons = Object.values(state.data.items).filter((i) => i.type === "Weapon");
  return `<option value="">${t().notSelected}</option>` + weapons.map((w) => `<option value="${w.id}" ${w.id === selectedId ? "selected" : ""}>${escapeHtml(w.name)}</option>`).join("");
}
function slotOptions(selected: ConfigSlot): string {
  return (["A", "B", "C"] as ConfigSlot[]).map((s) => `<option value="${s}" ${s === selected ? "selected" : ""}>${s}</option>`).join("");
}

let draftEditingId: string | null = null;
function openBuildSetModal(editId?: string): void {
  const set = editId ? state.data.buildSets[editId] : null;
  draftEditingId = editId ?? null;
  draft = set
    ? {
        name: set.name,
        frameId: set.frame ? set.frame.itemId : "",
        frameSlot: set.frame ? set.frame.config : "A",
        weapons: (set.weapons ?? []).map((w) => ({ ...w })),
        chainViewBuildId: set.chainViewBuildId ?? "",
        note: set.note ?? "",
      }
    : { name: "", frameId: "", frameSlot: "A", weapons: [], chainViewBuildId: "", note: "" };
  el("buildset-modal-title").textContent = set ? t().buildSetEditTitle : t().buildSetCreateTitle;
  renderBuildSetForm();
  el("buildset-modal-backdrop").classList.remove("hidden");
}
function closeBuildSetModal(): void {
  el("buildset-modal-backdrop").classList.add("hidden");
}

function renderBuildSetForm(): void {
  const formEl = el("new-buildset-form");
  formEl.innerHTML = `
    <label class="field-label">${t().buildSetNameLabel}</label>
    <input type="text" id="draft-name" placeholder="${t().buildSetNamePlaceholder}" value="${escapeHtml(draft.name)}">
    <div class="inline-form" style="margin-top:8px;">
      <span class="empty">${t().frameFieldLabel}</span>
      <select id="draft-frame-id">${frameOptions(draft.frameId)}</select>
      <select id="draft-frame-slot">${slotOptions(draft.frameSlot)}</select>
    </div>
    <div id="draft-weapons" style="margin-top:6px;"></div>
    <div class="inline-form" style="margin-top:6px;">
      <button type="button" id="draft-add-weapon" title="${t().addWeapon}">${iconLabel("plus", t().addWeapon)}</button>
    </div>
    ${
      draft.chainViewBuildId
        ? `<label class="field-label">${t().chainViewLinkProgress}</label>
         <select id="draft-chainview-build">${chainViewBuildOptions(draft.chainViewBuildId)}</select>`
        : `<label class="field-label" style="display:flex;align-items:center;gap:6px;">
           <input type="checkbox" id="draft-chainview-check" style="width:auto;">${t().chainViewAddCheckboxBuildSet}
         </label>`
    }
    <label class="field-label">${t().memoLabel} <span class="help-hint" title="${escapeHtml(t().memoHint)}">${icon("circle-alert", { size: 13 })}</span></label>
    <textarea id="draft-note" placeholder="${t().optionalPlaceholder}">${escapeHtml(draft.note)}</textarea>
    <div class="actions">
      <button id="draft-cancel">${t().cancel}</button>
      <button class="primary" id="draft-save">${t().save}</button>
    </div>
  `;

  const weaponsEl = el("draft-weapons");
  weaponsEl.innerHTML = draft.weapons
    .map(
      (w, i) => `
    <div class="weapon-ref-row">
      <span class="empty">${fmt(t().weaponFieldLabel, { n: i + 1 })}</span>
      <select data-w-idx="${i}" data-field="itemId">${weaponOptions(w.itemId)}</select>
      <select data-w-idx="${i}" data-field="config">${slotOptions(w.config)}</select>
      <button class="icon-btn danger" data-remove-weapon="${i}">${icon("x", { size: 14 })}</button>
    </div>
  `
    )
    .join("");

  el<HTMLInputElement>("draft-name").addEventListener("input", (e) => {
    draft.name = (e.target as HTMLInputElement).value;
  });
  el<HTMLSelectElement>("draft-frame-id").addEventListener("change", (e) => {
    draft.frameId = (e.target as HTMLSelectElement).value;
  });
  el<HTMLSelectElement>("draft-frame-slot").addEventListener("change", (e) => {
    draft.frameSlot = (e.target as HTMLSelectElement).value as ConfigSlot;
  });
  // The dropdown only appears once already linked (an escape hatch for
  // editing, same idea as node-modal.ts's edit mode). An unlinked new/existing
  // BuildSet only gets the auto-generate checkbox.
  maybeEl<HTMLSelectElement>("draft-chainview-build")?.addEventListener("change", (e) => {
    draft.chainViewBuildId = (e.target as HTMLSelectElement).value;
  });
  el<HTMLTextAreaElement>("draft-note").addEventListener("input", (e) => {
    draft.note = (e.target as HTMLTextAreaElement).value;
  });
  weaponsEl.querySelectorAll<HTMLSelectElement>("select").forEach((sel) =>
    sel.addEventListener("change", (e) => {
      const idx = Number(sel.dataset.wIdx);
      const field = sel.dataset.field as "itemId" | "config";
      draft.weapons[idx]![field] = (e.target as HTMLSelectElement).value as ConfigSlot & string;
    })
  );
  weaponsEl.querySelectorAll<HTMLElement>("[data-remove-weapon]").forEach((btn) =>
    btn.addEventListener("click", () => {
      draft.weapons.splice(Number(btn.dataset.removeWeapon), 1);
      renderBuildSetForm();
    })
  );
  el("draft-add-weapon").addEventListener("click", () => {
    draft.weapons.push({ itemId: "", config: "A" });
    renderBuildSetForm();
  });
  el("draft-cancel").addEventListener("click", closeBuildSetModal);
  el("draft-save").addEventListener("click", async () => {
    if (!draft.name.trim()) {
      showToast(t().enterBuildSetName);
      return;
    }
    const wantsChainView = !draft.chainViewBuildId && maybeEl<HTMLInputElement>("draft-chainview-check")?.checked;
    let chainViewBuildId: string | undefined = draft.chainViewBuildId || undefined;
    if (wantsChainView && draft.frameId) {
      chainViewBuildId = await autoComposeBuildSetChainView(
        draft.name.trim(),
        draft.frameId,
        draft.weapons.filter((w) => w.itemId).map((w) => w.itemId)
      );
    }
    const set: BuildSet = {
      id: draftEditingId ?? uid("buildset"),
      name: draft.name.trim(),
      frame: draft.frameId ? { itemId: draft.frameId, config: draft.frameSlot } : null,
      weapons: draft.weapons.filter((w) => w.itemId).map((w) => ({ itemId: w.itemId, config: w.config })),
      chainViewBuildId,
      note: draft.note.trim(),
    };
    await saveBuildSet(set);
    closeBuildSetModal();
  });
}

// Links a BuildSet to Chain View without the user picking any id
// (2026-08-25 item 27). A Build has no single WFCD name of its own (it's a
// composite), so it can't be auto-generated directly — instead this calls
// the existing per-Item auto-generation (autoGenerateChainViewNode,
// web/wfcd-autolink.js) once per component and bundles the results: ①
// auto-generate the Frame and each weapon (reusing chainViewNodeId if
// already set — Slug(name)+upsert makes repeat calls safe) -> ② create one
// new type:Goal node whose `contains` holds those node ids -> ③ return its id.
async function autoComposeBuildSetChainView(name: string, frameItemId: string, weaponItemIds: string[]): Promise<string | undefined> {
  async function ensureNodeFor(itemId: string, nodeType: string): Promise<string | null> {
    const item = state.data.items[itemId];
    if (!item) return null;
    if (item.chainViewNodeId) return item.chainViewNodeId;
    const nodeId = await autoGenerateChainViewNode(nodeType, item.name);
    if (nodeId) await updateItem({ ...item, chainViewNodeId: nodeId });
    return nodeId;
  }

  const containsIds: string[] = [];
  const frameNodeId = await ensureNodeFor(frameItemId, "Frame");
  if (frameNodeId) containsIds.push(frameNodeId);
  for (const wId of weaponItemIds) {
    const wNodeId = await ensureNodeFor(wId, "Weapon");
    if (wNodeId) containsIds.push(wNodeId);
  }
  if (!containsIds.length) return undefined;

  const buildNode = { id: autoLinkId("goal"), name, type: "Goal", requires: [], contains: containsIds };
  const res = await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildNode) });
  return res.ok ? buildNode.id : undefined;
}

function itemLabel(itemId: string, config: ConfigSlot): string {
  const item = state.data.items[itemId];
  if (!item) return fmt(t().unknownItem, { id: itemId });
  const mods = item.configs?.[config] ?? [];
  return `${escapeHtml(item.name)}（Config ${config}: ${mods.length ? mods.map(escapeHtml).join(", ") : t().noModsShort}）`;
}

let buildsetsSearchQuery = "";
let buildsetsExpanded = false;

function renderBuildSets(): void {
  const listEl = el("buildsets-list");
  const query = buildsetsSearchQuery.trim().toLowerCase();
  const allSets = Object.values(state.data.buildSets)
    .filter((s) => !query || s.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Same 8-item cap + "show more" as Items (2026-08-23). BuildSet has no
  // favorite/lastUsedAt, so it's name-order only.
  const expanded = !!query || buildsetsExpanded;
  const sets = expanded ? allSets : allSets.slice(0, PAGE_SIZE);
  const moreCount = allSets.length - sets.length;
  let toggleHtml = "";
  if (!query && allSets.length > PAGE_SIZE) {
    toggleHtml = buildsetsExpanded
      ? `<button class="show-more-card" id="buildsets-collapse">${iconLabel("chevron-up", t().collapse)}</button>`
      : `<button class="show-more-card" id="buildsets-show-more" title="${fmt(t().showRemainingTitle, { n: moreCount })}">${iconLabel("chevron-down", fmt(t().showMore, { n: moreCount }))}</button>`;
  }

  listEl.innerHTML =
    sets
      .map((set) => {
        const linkedBuild = set.chainViewBuildId ? state.chainViewBuilds.find((b) => b.id === set.chainViewBuildId) : null;
        return `
    <div class="buildset-card" data-open-buildset="${set.id}">
      <div class="buildset-head">
        <div class="buildset-name">${escapeHtml(set.name)}</div>
        <div class="inline-form">
          <button class="icon-btn" data-copy-set="${set.id}" title="${t().copyBuildSetTitle}">${icon("copy")}</button>
          <button class="icon-btn danger" data-del-set="${set.id}" title="${t().deleteTitle}">${icon("trash-2")}</button>
        </div>
      </div>
      ${set.chainViewBuildId ? `<div id="minigraph-buildset-${set.id}"></div>` : ""}
      <div class="buildset-row"><b>${t().frameFieldLabel}</b> ${set.frame ? itemLabel(set.frame.itemId, set.frame.config) : t().notConfigured}</div>
      ${(set.weapons ?? []).map((w) => `<div class="buildset-row"><b>Weapon:</b> ${itemLabel(w.itemId, w.config)}</div>`).join("") || `<div class="buildset-row">${t().noWeapons}</div>`}
      ${linkedBuild ? `<div class="buildset-row" data-progress-for="${set.chainViewBuildId}"><b>Chain View:</b> ${escapeHtml(linkedBuild.name)} — <span class="progress-text">${t().loading}</span></div>` : ""}
      ${set.note ? `<div class="card-memo" id="notemd-buildset-${set.id}"></div>` : ""}
    </div>
  `;
      })
      .join("") + toggleHtml || `<div class="empty">${t().noItemsRegistered}</div>`;

  const showMoreBtn = maybeEl("buildsets-show-more");
  if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => {
      buildsetsExpanded = true;
      renderBuildSets();
    });
  }
  const collapseBtn = maybeEl("buildsets-collapse");
  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      buildsetsExpanded = false;
      renderBuildSets();
    });
  }

  listEl.querySelectorAll<HTMLElement>("[data-del-set]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (await confirmInline(btn, fmt(t().deleteConfirm, { name: state.data.buildSets[btn.dataset.delSet!]!.name }))) void deleteBuildSet(btn.dataset.delSet!);
    })
  );
  wireCopyButtons(listEl, "[data-copy-set]", (btn) => buildBuildSetExportText(state.data.buildSets[btn.dataset.copySet!]!, state.data.items));

  // Card click opens the edit modal (same mechanism as the Item card,
  // 2026-08-23, "Build Sets can be added but not edited" feedback).
  listEl.querySelectorAll<HTMLElement>("[data-open-buildset]").forEach((card) =>
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      openBuildSetModal(card.dataset.openBuildset);
    })
  );

  listEl.querySelectorAll<HTMLElement>("[data-progress-for]").forEach((row) => {
    const buildId = row.dataset.progressFor!;
    fetch(`/api/next-actions?build=${encodeURIComponent(buildId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<NextActionReport>) : null))
      .then((report) => {
        const span = row.querySelector(".progress-text");
        if (!span) return;
        if (!report) {
          span.textContent = t().fetchFailed;
          return;
        }
        const { done, total } = report.progress;
        const pct = total ? Math.round((done / total) * 100) : 0;
        span.textContent = fmt(t().progressDone, { done, total, pct });
      })
      .catch(() => {});
  });

  sets.forEach((set) => {
    if (!set.chainViewBuildId) return;
    const holder = maybeEl(`minigraph-buildset-${set.id}`);
    if (holder) renderMiniGraph(holder, set.chainViewBuildId, state.nodesById);
  });
  sets.forEach((set) => {
    if (!set.note) return;
    const holder = maybeEl(`notemd-buildset-${set.id}`);
    if (holder) renderNoteMd(holder, set.note, (newNote) => void saveBuildSet({ ...set, note: newNote }));
  });
}

const refData: { frames: string[]; weapons: string[]; companions: string[]; mods: string[]; archwings: string[]; necramechs: string[] } = {
  frames: [],
  weapons: [],
  companions: [],
  mods: [],
  archwings: [],
  necramechs: [],
};

async function loadReferenceData(): Promise<void> {
  try {
    const [frames, weapons, companions, mods, archwings, necramechs] = await Promise.all([
      fetch("/api/reference/frames").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/weapons").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/companions").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/mods").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/archwings").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/necramechs").then((r) => r.json() as Promise<string[]>),
    ]);
    refData.frames = frames;
    refData.weapons = weapons;
    refData.companions = companions;
    refData.mods = mods;
    refData.archwings = archwings;
    refData.necramechs = necramechs;
  } catch (err) {
    console.warn("WFCD参照データの取得に失敗（自由入力は引き続き可能）", err);
  }
}

// Self-built substring/case-insensitive filter suggestion list.
const nameInput = el<HTMLInputElement>("new-item-name");
const suggestEl = el("new-item-suggest");

function hideSuggest(): void {
  suggestEl.classList.add("hidden");
}

const itemTypeRefPool: Record<ItemType, keyof typeof refData> = {
  Frame: "frames",
  Weapon: "weapons",
  Companion: "companions",
  Archwing: "archwings",
  Necramech: "necramechs",
};
function updateSuggest(): void {
  const type = el<HTMLSelectElement>("new-item-type").value as ItemType;
  const pool = refData[itemTypeRefPool[type]] ?? refData.weapons;
  const q = nameInput.value.trim().toLowerCase();
  if (!q) {
    hideSuggest();
    return;
  }

  const matches = pool.filter((n) => n.toLowerCase().includes(q)).slice(0, 30);
  if (!matches.length) {
    suggestEl.innerHTML = `<div class="suggest-empty">${t().noMatch}</div>`;
  } else {
    suggestEl.innerHTML = matches.map((n) => `<div class="suggest-item">${escapeHtml(n)}</div>`).join("");
    suggestEl.querySelectorAll<HTMLElement>(".suggest-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        // fires before blur
        e.preventDefault();
        nameInput.value = item.textContent ?? "";
        hideSuggest();
      });
    });
  }
  suggestEl.classList.remove("hidden");
}

nameInput.addEventListener("input", updateSuggest);
nameInput.addEventListener("focus", updateSuggest);
nameInput.addEventListener("blur", hideSuggest);

applyI18nText(STRINGS);
onLocaleChange(() => {
  applyI18nText(STRINGS);
  render();
});

void loadReferenceData();
void loadChainViewGraph().then(loadAll);
