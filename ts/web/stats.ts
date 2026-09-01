// Port of the inline script in web/stats.html.
import type { Node } from "../server/model.ts";
import type { Data as LoadoutData } from "../server/loadout.ts";
import type { Data as StandingData } from "../server/standing.ts";
import type { Planet, Proxima } from "../server/starchart.ts";
import type { Data as StatsData } from "../server/stats.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { nodeDisplayName, questJa } from "./quest-i18n.ts";
import { initWfcdRefresh } from "./wfcd-refresh.ts";
import { applyI18nText, effective, onLocaleChange } from "./locale.ts";
import "./booster.ts";
import "./spoiler-warning.ts";
import "./quest-onboarding.ts";
import "./manual-launcher.ts";
import "./scratch.ts";
import "./kofi-link.ts";
import "./theme.ts";
import "./wallpaper.ts";
import "./scroll-top.ts";

interface UIStrings {
  [key: string]: string;
  refreshUpdating: string;
  refreshDone: string;
  refreshTitle: string;
  helpToggleTitle: string;
  helpPopoverHtml: string;
  chevronToggle: string;
  aggregateHeading: string;
  chainviewAggHeading: string;
  noGoalsYet: string;
  buildSetCountLabel: string;
  itemCountLabel: string;
  rivenLabel: string;
  countUnit: string;
  rivenFixedLabel: string;
  favoriteCountLabel: string;
  frameOwnedLabel: string;
  frameRanked30Label: string;
  frameHelminthLabel: string;
  incarnonObtainedLabel: string;
  incarnonCompletedLabel: string;
  maxCountLabel: string;
  negativeCountLabel: string;
  questProgressHeading: string;
  questHint: string;
  questMainClearedBtn: string;
  questMainUnclearedBtn: string;
  questSubClearedBtn: string;
  questSubUnclearedBtn: string;
  mainQuestGroupTitle: string;
  subQuestGroupTitle: string;
  starchartHeading: string;
  starchartHint: string;
  starchartMarkClearedBtn: string;
  starchartMarkUnclearedBtn: string;
  starchartMarkSpClearedBtn: string;
  starchartMarkSpUnclearedBtn: string;
  planetHeader: string;
  starchartHeader: string;
  steelPathHeader: string;
  notApplicable: string;
  loading: string;
  intrinsicsHeading: string;
  riseTideWarning: string;
  drifterWarning: string;
  secondDreamWarning: string;
  lockedSectionTitle: string;
  revealedTitleFocus: string;
  revealedTitleRailjack: string;
  revealedTitleRailjackIntrinsics: string;
  revealedTitleDrifterIntrinsics: string;
  activeSchoolLabel: string;
  notSet: string;
  investedNo: string;
  investedInProgress: string;
  investedMaxed: string;
  plexusNoteLabel: string;
  plexusNotePlaceholder: string;
  proximaHeading: string;
  proximaMarkClearedBtn: string;
  proximaMarkUnclearedBtn: string;
  normalHeader: string;
}

const STRINGS: Record<"ja" | "en", UIStrings> = {
  ja: {
    refreshUpdating: "更新中…",
    refreshDone: "更新完了",
    refreshTitle: "新フレーム/新武器の追加や、星図/Proximaのノード数がゲームアップデートに追従してない時に押してください",
    helpToggleTitle: "このページについて",
    helpPopoverHtml: `
        <div style="margin-bottom:8px;">上段は既存4データソース（Chain View/Loadouts/Collections/Standing）の読み取り専用集計です。</div>
        <ul style="margin:0 0 10px;padding-left:18px;">
          <li>「クエスト進行状況」パネルでクリア済みのクエストにチェックを入れると、対応する下段の追加セクションの折りたたみが解除されます</li>
          <li>星図/鋼の道のり/性能値（Intrinsics）は、惑星・地域単位の粗い進捗（ノード個別トグルは持たない）を記録する数値入力欄です</li>
          <li>すべてのパネルは右上のアイコンで開閉でき、状態は次回起動時も引き継がれます</li>
        </ul>
        <div>⚠️ 惑星名などにネタバレを含むことがあります。対応するクエストをクリア済みでないセクションは、内容を明かさないよう折りたたんだままにしています。</div>`,
    chevronToggle: "開閉",
    aggregateHeading: "集計（読み取り専用）",
    chainviewAggHeading: "Chain View — Build別進捗",
    noGoalsYet: "目標ノードがまだありません",
    buildSetCountLabel: "BuildSet数",
    itemCountLabel: "Item数",
    rivenLabel: "Riven",
    countUnit: "件",
    rivenFixedLabel: "Riven FIX済み",
    favoriteCountLabel: "お気に入り総数",
    frameOwnedLabel: "フレーム入手",
    frameRanked30Label: "ランク30済み",
    frameHelminthLabel: "ヘルミンス済み",
    incarnonObtainedLabel: "インカーノン取得済み",
    incarnonCompletedLabel: "インカーノン済み",
    maxCountLabel: "最高到達Max",
    negativeCountLabel: "現在マイナス圏",
    questProgressHeading: "クエスト進行状況",
    questHint:
      "下のセクションの一部は、これらのクエストのクリア状況に応じて内容が自動的に表示されます。メインクエストは前提クエストの連鎖になっているため、新しい方をクリア済みにチェックすると、その前提となる過去のクエストもまとめてクリア済みになります（逆にチェックを外すのはそのクエスト単体のみ）。",
    questMainClearedBtn: "メイン全部クリア",
    questMainUnclearedBtn: "メイン全部未クリア",
    questSubClearedBtn: "サブ全部クリア",
    questSubUnclearedBtn: "サブ全部未クリア",
    mainQuestGroupTitle: "メインクエスト",
    subQuestGroupTitle: "サブクエスト",
    starchartHeading: "星図 / 鋼の道のり 進捗",
    starchartHint: "分母（総ノード数）は外部データから自動取得。分子（クリア済み数）だけを惑星ごとに入力する。",
    starchartMarkClearedBtn: "星図全部クリア",
    starchartMarkUnclearedBtn: "星図全部未クリア",
    starchartMarkSpClearedBtn: "鋼の道のり全部クリア",
    starchartMarkSpUnclearedBtn: "鋼の道のり全部未クリア",
    planetHeader: "惑星 / システム",
    starchartHeader: "星図",
    steelPathHeader: "鋼の道のり",
    notApplicable: "対象外",
    loading: "読み込み中…",
    intrinsicsHeading: "性能値（Intrinsics）",
    riseTideWarning: "前提クエスト（流転する形勢）をクリアすると内容が明らかになります。ネタバレ回避のため、未クリアの場合は開かないことをおすすめします。",
    drifterWarning: "前提クエスト（デュヴィリ・パラドックス）をクリアすると内容が明らかになります。ネタバレ回避のため、未クリアの場合は開かないことをおすすめします。",
    secondDreamWarning: "前提クエスト（二番目の夢）をクリアすると内容が明らかになります。ネタバレ回避のため、未クリアの場合は開かないことをおすすめします。",
    lockedSectionTitle: "未解放セクション",
    revealedTitleFocus: "フォーカス（Focus School）",
    revealedTitleRailjack: "レールジャック（Railjack）",
    revealedTitleRailjackIntrinsics: "レールジャック性能値",
    revealedTitleDrifterIntrinsics: "ドリフター性能値",
    activeSchoolLabel: "アクティブな校",
    notSet: "未設定",
    investedNo: "未投資",
    investedInProgress: "投資中",
    investedMaxed: "フルマックス",
    plexusNoteLabel: "Plexus mod構成（メモ）",
    plexusNotePlaceholder: "例: Battle 3枠 + Tactical 1枠",
    proximaHeading: "Proxima進捗",
    proximaMarkClearedBtn: "通常全部クリア",
    proximaMarkUnclearedBtn: "通常全部未クリア",
    normalHeader: "通常",
  },
  en: {
    refreshUpdating: "Updating…",
    refreshDone: "Done",
    refreshTitle: "Press this when new frames/weapons, or the star chart/Proxima node counts, haven't caught up with a game update",
    helpToggleTitle: "About this page",
    helpPopoverHtml: `
        <div style="margin-bottom:8px;">The top section is a read-only aggregate of the 4 existing data sources (Chain View/Loadouts/Collections/Standing).</div>
        <ul style="margin:0 0 10px;padding-left:18px;">
          <li>Checking a quest as cleared in the "Quest Progress" panel unlocks the corresponding sections below</li>
          <li>Star Chart/Steel Path/Intrinsics record coarse per-planet/region progress (no per-node toggles)</li>
          <li>Every panel can be collapsed via the icon at top right, and the state carries over next launch</li>
        </ul>
        <div>⚠️ Planet names etc. may contain spoilers. Sections whose gating quest isn't cleared yet stay collapsed so they don't reveal content.</div>`,
    chevronToggle: "Toggle",
    aggregateHeading: "Aggregate (read-only)",
    chainviewAggHeading: "Chain View — per-Build progress",
    noGoalsYet: "No goal nodes yet",
    buildSetCountLabel: "Build Sets",
    itemCountLabel: "Items",
    rivenLabel: "Riven",
    countUnit: "",
    rivenFixedLabel: "Riven Fixed",
    favoriteCountLabel: "Total Favorites",
    frameOwnedLabel: "Frames Owned",
    frameRanked30Label: "Rank 30",
    frameHelminthLabel: "Helminth Fed",
    incarnonObtainedLabel: "Incarnon Obtained",
    incarnonCompletedLabel: "Incarnon Completed",
    maxCountLabel: "Max Reached",
    negativeCountLabel: "Currently Negative",
    questProgressHeading: "Quest Progress",
    questHint:
      "Some of the sections below automatically reveal their content based on these quests' clear status. Main quests form a prerequisite chain, so checking a later one as cleared also marks its earlier prerequisites cleared (unchecking only affects that single quest).",
    questMainClearedBtn: "Clear all main",
    questMainUnclearedBtn: "Uncheck all main",
    questSubClearedBtn: "Clear all side",
    questSubUnclearedBtn: "Uncheck all side",
    mainQuestGroupTitle: "Main Quests",
    subQuestGroupTitle: "Side Quests",
    starchartHeading: "Star Chart / Steel Path Progress",
    starchartHint: "The denominator (total node count) is fetched automatically. Only enter the numerator (cleared count) per planet.",
    starchartMarkClearedBtn: "Clear all star chart",
    starchartMarkUnclearedBtn: "Uncheck all star chart",
    starchartMarkSpClearedBtn: "Clear all Steel Path",
    starchartMarkSpUnclearedBtn: "Uncheck all Steel Path",
    planetHeader: "Planet / System",
    starchartHeader: "Star Chart",
    steelPathHeader: "Steel Path",
    notApplicable: "N/A",
    loading: "Loading…",
    intrinsicsHeading: "Intrinsics",
    riseTideWarning: "This section is revealed once the gating quest (Rising Tide) is cleared. To avoid spoilers, we recommend not opening it until then.",
    drifterWarning: "This section is revealed once the gating quest (The Duviri Paradox) is cleared. To avoid spoilers, we recommend not opening it until then.",
    secondDreamWarning: "This section is revealed once the gating quest (The Second Dream) is cleared. To avoid spoilers, we recommend not opening it until then.",
    lockedSectionTitle: "Locked section",
    revealedTitleFocus: "Focus (Focus School)",
    revealedTitleRailjack: "Railjack",
    revealedTitleRailjackIntrinsics: "Railjack Intrinsics",
    revealedTitleDrifterIntrinsics: "Drifter Intrinsics",
    activeSchoolLabel: "Active School",
    notSet: "Not set",
    investedNo: "Not Invested",
    investedInProgress: "In Progress",
    investedMaxed: "Maxed",
    plexusNoteLabel: "Plexus mod loadout (memo)",
    plexusNotePlaceholder: "e.g. 3× Battle + 1× Tactical",
    proximaHeading: "Proxima Progress",
    proximaMarkClearedBtn: "Clear all normal",
    proximaMarkUnclearedBtn: "Uncheck all normal",
    normalHeader: "Normal",
  },
};

function t(): UIStrings {
  return STRINGS[effective()];
}

// Collections (pkg/collection) is Phase 10 scope, not yet ported — /api/collections
// 404s for now and renderCollectionsAgg falls back to its empty defaults, same
// as every other not-yet-ported cross-page read on this page (accepted
// incompleteness, matches the Loadouts item-27 cross-link pattern). This
// local shape carries only the fields this page's aggregation actually reads.
interface RivenEntry {
  fixed?: boolean;
  favorite?: boolean;
}
interface KuvaEntry {
  owned?: boolean;
  favorite?: boolean;
  kind: "Kuva" | "Tenet" | "Coda";
  weaponName: string;
}
interface FrameEntry {
  owned?: boolean;
  rankedThirty?: boolean;
  helminthFed?: boolean;
}
interface IncarnonEntry {
  obtained?: boolean;
  completed?: boolean;
}
interface CollectionsData {
  rivens: Record<string, RivenEntry>;
  kuva: Record<string, KuvaEntry>;
  frames: Record<string, FrameEntry>;
  incarnons: Record<string, IncarnonEntry>;
}

const state: {
  nodesById: Record<string, Node>;
  loadouts: LoadoutData;
  collections: CollectionsData;
  standing: StandingData;
  planets: Planet[];
  proxima: Proxima[];
  statsData: StatsData;
  allQuests: string[];
  mainQuestNames: string[];
} = {
  nodesById: {},
  loadouts: { schemaVersion: 1, items: {}, buildSets: {} },
  collections: { rivens: {}, kuva: {}, frames: {}, incarnons: {} },
  standing: { schemaVersion: 1, ranks: {}, highestRankReached: {} },
  planets: [],
  proxima: [],
  statsData: {
    schemaVersion: 1,
    planets: {},
    railjackProxima: {},
    railjackIntrinsics: {},
    drifterIntrinsics: {},
    focusInvestment: {},
    focusActiveSchool: "",
    railjackComponents: {},
    railjackPlexusNote: "",
    questsCleared: {},
  },
  allQuests: [],
  mainQuestNames: [],
};

initWfcdRefresh({
  labels: () => ({ updating: t().refreshUpdating, done: t().refreshDone, title: t().refreshTitle }),
  // The star chart/Railjack Proxima denominators (per-planet total node
  // count) live in the same cache, so a dedicated starchart-refresh button
  // would be redundant — folded into this one (2026-08-22, feedback).
  onRefreshed: async () => {
    await Promise.all([loadPlanets(), loadProxima()]);
    renderStarchart();
    renderProxima();
  },
});

el("help-toggle").innerHTML = icon("info");
el("help-toggle").addEventListener("click", (e) => {
  e.stopPropagation();
  el("help-popover").classList.toggle("hidden");
});
el("help-popover").addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => el("help-popover").classList.add("hidden"));

function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Chain View: per-Build progress (satisfied/total across the requires closure) ----------
// Same logic as minigraph.ts's requires-closure collection (read-only
// aggregation only, so duplicating the logic here is lighter than reusing
// its render-coupled implementation).
function requiresClosureSize(buildId: string): { satisfied: number; total: number } {
  const visited = new Set<string>();
  const stack = [buildId];
  let satisfied = 0;
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id) || !state.nodesById[id]) continue;
    visited.add(id);
    if (state.nodesById[id]!.satisfied) satisfied++;
    (state.nodesById[id]!.requires || []).forEach((r) => stack.push(r));
  }
  return { satisfied, total: visited.size };
}

function renderChainViewAgg(): void {
  const container = el("chainview-agg");
  const builds = Object.values(state.nodesById)
    .filter((n) => n.type === "Build")
    .map((b) => ({ node: b, ...requiresClosureSize(b.id) }))
    .map((b) => ({ ...b, pct: b.total ? Math.round((b.satisfied / b.total) * 100) : 0 }));
  if (!builds.length) {
    container.innerHTML = `<div class="empty">${t().noGoalsYet}</div>`;
    return;
  }
  // Least-progressed first (today's most-actionable), name as the stable tie-break (2026-08-22).
  // Sorts and displays by nodeDisplayName() (quest-i18n.ts), not the raw
  // stored node.name — this tile grid was missed when 76e7138 switched every
  // other node-label surface (graph/sidebar/Inspector/combobox) over to it
  // (found 2026-08-30).
  builds.sort((a, b) => a.pct - b.pct || nodeDisplayName(a.node).localeCompare(nodeDisplayName(b.node), "ja"));
  container.innerHTML = builds
    .map(
      ({ node, satisfied, total, pct }) =>
        `<div class="tile"><div class="tile-label">${escapeHtml(nodeDisplayName(node))}</div><div class="tile-value">${pct}%<span class="unit">(${satisfied}/${total})</span></div></div>`,
    )
    .join("");
}

// ---------- Loadouts ----------
function renderLoadoutsAgg(): void {
  const container = el("loadouts-agg");
  const buildSetCount = Object.keys(state.loadouts.buildSets || {}).length;
  const itemCount = Object.keys(state.loadouts.items || {}).length;
  container.innerHTML = `
    <div class="tile"><div class="tile-label">${t().buildSetCountLabel}</div><div class="tile-value">${buildSetCount}</div></div>
    <div class="tile"><div class="tile-label">${t().itemCountLabel}</div><div class="tile-value">${itemCount}</div></div>
  `;
}

// ---------- Collections ----------
function renderCollectionsAgg(): void {
  const container = el("collections-agg");
  const rivens = Object.values(state.collections.rivens || {});
  const kuva = Object.values(state.collections.kuva || {});
  const frames = Object.values(state.collections.frames || {});
  const incarnons = Object.values(state.collections.incarnons || {});

  const rivenFixed = rivens.filter((r) => r.fixed).length;
  // Unowned entries (a Lich/Sister still being hunted) don't count (same
  // owned!=registered distinction as frames/incarnons, found 2026-08-22).
  // Also counts "distinct originals" (unique by weapon name) rather than
  // copies — owning multiple of the same weapon still counts as one kind;
  // copy count itself (how many are held back as Valence Fusion fodder etc.)
  // is a separate concern the Collections grouped-card "×N" badge covers.
  const kuvaByKind: Record<"Kuva" | "Tenet" | "Coda", number> = { Kuva: 0, Tenet: 0, Coda: 0 };
  const kuvaOwnedNamesByKind: Record<"Kuva" | "Tenet" | "Coda", Set<string>> = {
    Kuva: new Set(),
    Tenet: new Set(),
    Coda: new Set(),
  };
  kuva.forEach((k) => {
    if (k.owned && kuvaOwnedNamesByKind[k.kind]) kuvaOwnedNamesByKind[k.kind].add(k.weaponName);
  });
  (Object.keys(kuvaByKind) as (keyof typeof kuvaByKind)[]).forEach((kind) => {
    kuvaByKind[kind] = kuvaOwnedNamesByKind[kind].size;
  });
  // Favorite isn't filtered by owned(true) — Kuva/Tenet/Coda favorites can
  // legitimately mark a Lich/Sister still being hunted as a priority target,
  // not just a post-acquisition Valence Fusion pick, so unowned entries are
  // deliberately included (2026-08-22, confirmed with the owner — left as-is, not a bug).
  const favoriteCount = rivens.filter((r) => r.favorite).length + kuva.filter((k) => k.favorite).length;
  const framesOwned = frames.filter((f) => f.owned).length;
  const framesRanked30 = frames.filter((f) => f.rankedThirty).length;
  const framesHelminth = frames.filter((f) => f.helminthFed).length;
  const incarnonObtained = incarnons.filter((i) => i.obtained).length;
  const incarnonCompleted = incarnons.filter((i) => i.completed).length;

  container.innerHTML = `
    <div class="tile"><div class="tile-label">${t().rivenLabel}</div><div class="tile-value">${rivens.length}<span class="unit">${t().countUnit}</span></div></div>
    <div class="tile"><div class="tile-label">${t().rivenFixedLabel}</div><div class="tile-value">${rivenFixed} / ${rivens.length}</div></div>
    <div class="tile"><div class="tile-label">Kuva</div><div class="tile-value">${kuvaByKind.Kuva}</div></div>
    <div class="tile"><div class="tile-label">Tenet</div><div class="tile-value">${kuvaByKind.Tenet}</div></div>
    <div class="tile"><div class="tile-label">Coda</div><div class="tile-value">${kuvaByKind.Coda}</div></div>
    <div class="tile"><div class="tile-label">${t().favoriteCountLabel}</div><div class="tile-value">${favoriteCount}</div></div>
    <div class="tile"><div class="tile-label">${t().frameOwnedLabel}</div><div class="tile-value">${framesOwned}</div></div>
    <div class="tile"><div class="tile-label">${t().frameRanked30Label}</div><div class="tile-value">${framesRanked30} / ${framesOwned}</div></div>
    <div class="tile"><div class="tile-label">${t().frameHelminthLabel}</div><div class="tile-value">${framesHelminth} / ${framesOwned}</div></div>
    <div class="tile"><div class="tile-label">${t().incarnonObtainedLabel}</div><div class="tile-value">${incarnonObtained}</div></div>
    <div class="tile"><div class="tile-label">${t().incarnonCompletedLabel}</div><div class="tile-value">${incarnonCompleted} / ${incarnonObtained}</div></div>
  `;
}

// ---------- Standing ----------
function renderStandingAgg(): void {
  const container = el("standing-agg");
  const highest = Object.values(state.standing.highestRankReached || {});
  const ranks = Object.values(state.standing.ranks || {});
  const maxCount = highest.filter((r) => r >= 5).length;
  const negativeCount = ranks.filter((r) => r < 0).length;
  container.innerHTML = `
    <div class="tile"><div class="tile-label">${t().maxCountLabel}</div><div class="tile-value">${maxCount} / ${highest.length}</div></div>
    <div class="tile"><div class="tile-label">${t().negativeCountLabel}</div><div class="tile-value">${negativeCount}</div></div>
  `;
}

// ---------- Star Chart / Steel Path ----------
// Same "+ button + direct edit" feel as the quick-memo counters
// (scratch.ts), just clamped to each planet's denominator (nodeCount)
// (2026-08-22, owner-specified — a "-" button was explicitly declined, + only).
function planetProgressCellHtml(planetKey: string, field: "cleared" | "steelPathCleared", value: number, max: number): string {
  return `
    <div class="num-stepper">
      <input type="number" inputmode="numeric" class="num-input" min="0" max="${max}" data-planet="${escapeHtml(planetKey)}" data-field="${field}" value="${value}">
      <button class="icon-btn num-inc" data-planet="${escapeHtml(planetKey)}" data-field="${field}" title="+1">${icon("plus")}</button>
      <span class="planet-denom">/ ${max}</span>
    </div>`;
}

// /api/starchart/planets Key -> Japanese label. Only translates entries
// verified against wikiwiki.jp/warframe's "星系" page; unverified (newer)
// areas (Zariman/1999/Tau/Sanctuary/DeepSpace etc.) stay in English (same
// "don't write an unconfirmed translation as settled fact" policy as QUEST_JA).
const PLANET_JA: Record<string, string> = {
  Mercury: "水星",
  Venus: "金星",
  Earth: "地球",
  Mars: "火星",
  Phobos: "フォボス",
  Ceres: "ケレス",
  Jupiter: "木星",
  Europa: "エウロパ",
  Saturn: "土星",
  Uranus: "天王星",
  Neptune: "海王星",
  Pluto: "冥王星",
  Sedna: "セドナ",
  Eris: "エリス",
  Void: "VOID",
  Moon: "ルア",
  Fortress: "KUVA要塞",
  SolarMapDeimosName: "ダイモス",
};
function planetJa(p: Planet): string {
  return effective() === "en" ? p.displayName : PLANET_JA[p.key] || p.displayName;
}

// /api/starchart/proxima Key -> Japanese label. Verified against
// wikiwiki.jp/warframe's "エンペリアン" page (2026-08-22, Update 29.10 entries).
const PROXIMA_JA: Record<string, string> = {
  Earth: "地球プロキシマ",
  Venus: "金星プロキシマ",
  Saturn: "土星プロキシマ",
  Neptune: "海王星プロキシマ",
  Pluto: "冥王星プロキシマ",
  DeepSpace: "ヴェールプロキシマ",
};
function proximaJa(p: Proxima): string {
  return effective() === "en" ? p.displayName : PROXIMA_JA[p.key] || p.displayName;
}

// Generic helper: POST to endpoint/{key} and update state.statsData[dataMapKey][key]
// (star chart/Railjack Proxima share the same PlanetProgress shape, 2026-08-22).
async function saveProgress(
  endpoint: string,
  dataMapKey: "planets" | "railjackProxima",
  key: string,
  field: "cleared" | "steelPathCleared",
  value: number,
  max: number,
): Promise<number> {
  const clamped = Math.max(0, Math.min(max, value));
  const progress = { ...(state.statsData[dataMapKey][key] || { cleared: 0, steelPathCleared: 0 }) };
  progress[field] = clamped;
  const res = await fetch(`${endpoint}/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(progress),
  });
  state.statsData = await res.json();
  return clamped;
}
async function savePlanetField(key: string, field: "cleared" | "steelPathCleared", value: number): Promise<number> {
  const planet = state.planets.find((p) => p.key === key);
  return saveProgress("/api/stats/planets", "planets", key, field, value, planet ? planet.nodeCount : value);
}
async function saveProximaField(key: string, field: "cleared" | "steelPathCleared", value: number): Promise<number> {
  const p = state.proxima.find((x) => x.key === key);
  return saveProgress("/api/stats/railjack-proxima", "railjackProxima", key, field, value, p ? p.nodeCount : value);
}

function planetTableHtml(planets: Planet[]): string {
  return `
    <table class="input-table">
      <thead><tr><th>${t().planetHeader}</th><th>${t().starchartHeader}</th><th>${t().steelPathHeader}</th></tr></thead>
      <tbody>
        ${planets
          .map((p) => {
            const progress = state.statsData.planets[p.key] || { cleared: 0, steelPathCleared: 0 };
            return `
            <tr>
              <td><div class="planet-name">${escapeHtml(planetJa(p))}</div></td>
              <td>${planetProgressCellHtml(p.key, "cleared", progress.cleared, p.nodeCount)}</td>
              <td>
                ${
                  p.steelPathApplicable
                    ? planetProgressCellHtml(p.key, "steelPathCleared", progress.steelPathCleared, p.nodeCount)
                    : `<span class="steel-path-na">${t().notApplicable}</span>`
                }
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function renderStarchart(): void {
  const container = el("starchart-list");
  if (!state.planets.length) {
    container.innerHTML = `<div class="empty">${t().loading}</div>`;
    return;
  }
  // Split into 2 columns (front half/back half) so it doesn't get too tall (2026-08-22, owner-specified).
  const half = Math.ceil(state.planets.length / 2);
  const left = state.planets.slice(0, half);
  const right = state.planets.slice(half);
  container.innerHTML = `
    <div class="starchart-columns">
      ${planetTableHtml(left)}
      ${planetTableHtml(right)}
    </div>
  `;
  container.querySelectorAll<HTMLInputElement>(".num-input").forEach((inp) => {
    inp.addEventListener("blur", async () => {
      inp.value = String(await savePlanetField(inp.dataset.planet!, inp.dataset.field as "cleared" | "steelPathCleared", Number(inp.value) || 0));
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".num-inc").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const inp = container.querySelector<HTMLInputElement>(
        `.num-input[data-planet="${CSS.escape(btn.dataset.planet!)}"][data-field="${btn.dataset.field}"]`,
      )!;
      inp.value = String(
        await savePlanetField(btn.dataset.planet!, btn.dataset.field as "cleared" | "steelPathCleared", (Number(inp.value) || 0) + 1),
      );
    });
  });
}

// 星図/鋼の道のり別の「全部クリア/全部未クリア」(2026-08-26、のっちの要望)
// — quests/main等と同じく、対象一覧はサーバー側で再導出させる（クライア
// ントのstate.planetsが古い可能性を信用しない）。
async function markAllPlanets(field: "cleared" | "steelPathCleared", cleared: boolean): Promise<void> {
  const endpoint = field === "cleared" ? "/api/stats/planets/mark-all-star-chart" : "/api/stats/planets/mark-all-steel-path";
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cleared }) });
  state.statsData = await res.json();
  renderStarchart();
}
el("starchart-mark-all-cleared").addEventListener("click", () => void markAllPlanets("cleared", true));
el("starchart-mark-all-uncleared").addEventListener("click", () => void markAllPlanets("cleared", false));
el("starchart-mark-all-steelpath-cleared").addEventListener("click", () => void markAllPlanets("steelPathCleared", true));
el("starchart-mark-all-steelpath-uncleared").addEventListener("click", () => void markAllPlanets("steelPathCleared", false));

// ---------- Intrinsics ----------
// Verified against wikiwiki.jp/warframe's "レールジャック/性能値" and
// "漂流者/性能値" pages (2026-08-22). data-intrinsic values must match the
// API key (pkg/stats.RailjackCategories/DrifterCategories' English keys)
// exactly, so they stay in English — only the display label is Japanese.
const INTRINSIC_JA: Record<string, string> = {
  Tactical: "策略",
  Piloting: "操縦",
  Gunnery: "銃砲",
  Engineering: "技術",
  Command: "指揮",
  Combat: "戦闘",
  Riding: "騎乗",
  Opportunity: "好機",
  Endurance: "持久",
};
function renderIntrinsicsGroup(containerId: string, categories: string[], values: Record<string, number>, endpoint: string): void {
  const container = el(containerId);
  container.innerHTML = categories
    .map(
      (cat) => `
    <div class="intrinsic-field">
      <label>${effective() === "en" ? escapeHtml(cat) : `${escapeHtml(INTRINSIC_JA[cat] || cat)}（${escapeHtml(cat)}）`}</label>
      <input type="range" min="0" max="10" step="1" value="${values[cat] || 0}" data-intrinsic="${escapeHtml(cat)}">
      <span class="rank-value" data-intrinsic-value="${escapeHtml(cat)}">${values[cat] || 0}</span>
    </div>
  `,
    )
    .join("");
  container.querySelectorAll<HTMLInputElement>("[data-intrinsic]").forEach((slider) => {
    const valueLabel = container.querySelector(`[data-intrinsic-value="${CSS.escape(slider.dataset.intrinsic!)}"]`)!;
    slider.addEventListener("input", () => {
      valueLabel.textContent = slider.value;
    });
    slider.addEventListener("change", async () => {
      const res = await fetch(`${endpoint}/${encodeURIComponent(slider.dataset.intrinsic!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: Number(slider.value) }),
      });
      state.statsData = await res.json();
    });
  });
}
function renderIntrinsics(): void {
  renderIntrinsicsGroup(
    "railjack-intrinsics",
    ["Tactical", "Piloting", "Gunnery", "Engineering", "Command"],
    state.statsData.railjackIntrinsics || {},
    "/api/stats/railjack",
  );
  renderIntrinsicsGroup(
    "drifter-intrinsics",
    ["Combat", "Riding", "Opportunity", "Endurance"],
    state.statsData.drifterIntrinsics || {},
    "/api/stats/drifter",
  );
}

// ---------- Focus School (5 schools, 3-stage aggregate + active school) ----------
// School names stay in English in the UI too (owner-specified, not localized).
const FOCUS_SCHOOLS = ["Madurai", "Naramon", "Zenurik", "Vazarin", "Unairu"];
function focusInvestmentLabels(): Record<string, string> {
  return { not_invested: t().investedNo, in_progress: t().investedInProgress, maxed: t().investedMaxed };
}

function renderFocusGrid(): void {
  const container = el("focus-grid");
  container.innerHTML = FOCUS_SCHOOLS.map((school) => {
    const current = (state.statsData.focusInvestment || {})[school] || "not_invested";
    return `
      <div class="focus-field">
        <label>${escapeHtml(school)}</label>
        <select data-focus-school="${escapeHtml(school)}">
          ${Object.entries(focusInvestmentLabels())
            .map(([val, label]) => `<option value="${val}" ${val === current ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </div>`;
  }).join("");
  container.querySelectorAll<HTMLSelectElement>("[data-focus-school]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const res = await fetch(`/api/stats/focus/${encodeURIComponent(sel.dataset.focusSchool!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investment: sel.value }),
      });
      state.statsData = await res.json();
    });
  });
}

function renderFocusActiveSelect(): void {
  const select = el<HTMLSelectElement>("focus-active-select");
  const current = state.statsData.focusActiveSchool || "";
  select.innerHTML =
    `<option value="">${t().notSet}</option>` +
    FOCUS_SCHOOLS.map((s) => `<option value="${escapeHtml(s)}" ${s === current ? "selected" : ""}>${escapeHtml(s)}</option>`).join("");
  select.addEventListener("change", async () => {
    const res = await fetch("/api/stats/focus-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ school: select.value }),
    });
    state.statsData = await res.json();
  });
}

// ---------- Railjack hull (4 components x House/Grade + Plexus mod note) ----------
const RAILJACK_SLOTS = ["Shield Array", "Engines", "Plating", "Reactor"];
// wikiwiki.jp/warframe-sourced label table (2026-08-20, same direct-write pattern as standing.ts's SYNDICATE_JA).
const RAILJACK_PART_JA: Record<string, string> = { "Shield Array": "シールドアレイ", Engines: "エンジン", Plating: "プレーティング", Reactor: "リアクター" };
const RAILJACK_HOUSES = ["", "Zetki", "Lavan", "Vidar"];
const RAILJACK_HOUSE_JA: Record<string, string> = { Zetki: "ゼットキ", Lavan: "ラバン", Vidar: "ビダール" };
const RAILJACK_GRADES = ["", "Mk I", "Mk II", "Mk III"];

function renderRailjackGrid(): void {
  const container = el("railjack-grid");
  container.innerHTML = RAILJACK_SLOTS.map((slot) => {
    const current = (state.statsData.railjackComponents || {})[slot] || { house: "", grade: "" };
    const en = effective() === "en";
    return `
      <div class="railjack-field">
        <label>${en ? escapeHtml(slot) : `${escapeHtml(slot)}（${escapeHtml(RAILJACK_PART_JA[slot] || slot)}）`}</label>
        <select data-railjack-slot="${escapeHtml(slot)}" data-field="house">
          ${RAILJACK_HOUSES.map((h) => `<option value="${h}" ${h === current.house ? "selected" : ""}>${h ? escapeHtml(en ? h : RAILJACK_HOUSE_JA[h] || h) : t().notSet}</option>`).join("")}
        </select>
        <select data-railjack-slot="${escapeHtml(slot)}" data-field="grade" style="margin-top:4px;">
          ${RAILJACK_GRADES.map((g) => `<option value="${g}" ${g === current.grade ? "selected" : ""}>${g || t().notSet}</option>`).join("")}
        </select>
      </div>`;
  }).join("");
  container.querySelectorAll<HTMLSelectElement>("[data-railjack-slot]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const slot = sel.dataset.railjackSlot!;
      const houseSel = container.querySelector<HTMLSelectElement>(`[data-railjack-slot="${CSS.escape(slot)}"][data-field="house"]`)!;
      const gradeSel = container.querySelector<HTMLSelectElement>(`[data-railjack-slot="${CSS.escape(slot)}"][data-field="grade"]`)!;
      const res = await fetch(`/api/stats/railjack-component/${encodeURIComponent(slot)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ house: houseSel.value, grade: gradeSel.value }),
      });
      state.statsData = await res.json();
    });
  });
}

function renderRailjackNote(): void {
  const ta = el<HTMLTextAreaElement>("railjack-plexus-note");
  ta.value = state.statsData.railjackPlexusNote || "";
  ta.addEventListener("blur", async () => {
    const res = await fetch("/api/stats/railjack-plexus-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: ta.value }),
    });
    state.statsData = await res.json();
  });
}

// ---------- Railjack Proxima progress ----------
// Split off from the star chart's nodeCount aggregate (2026-08-22). Reuses
// the same PlanetProgress shape (Cleared/SteelPathCleared) as the star
// chart; Steel Path applies to every Proxima (WebSearch-confirmed), so every
// row gets a Steel Path column. Few enough rows that no 2-column split like
// the star chart's is needed.
function renderProxima(): void {
  const container = el("proxima-list");
  if (!state.proxima.length) {
    container.innerHTML = `<div class="empty">${t().loading}</div>`;
    return;
  }
  container.innerHTML = `
    <table class="input-table">
      <thead><tr><th>Proxima</th><th>${t().normalHeader}</th><th>${t().steelPathHeader}</th></tr></thead>
      <tbody>
        ${state.proxima
          .map((p) => {
            const progress = (state.statsData.railjackProxima || {})[p.key] || { cleared: 0, steelPathCleared: 0 };
            return `
            <tr>
              <td><div class="planet-name">${escapeHtml(proximaJa(p))}</div></td>
              <td>${planetProgressCellHtml(p.key, "cleared", progress.cleared, p.nodeCount)}</td>
              <td>${planetProgressCellHtml(p.key, "steelPathCleared", progress.steelPathCleared, p.nodeCount)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll<HTMLInputElement>(".num-input").forEach((inp) => {
    inp.addEventListener("blur", async () => {
      inp.value = String(await saveProximaField(inp.dataset.planet!, inp.dataset.field as "cleared" | "steelPathCleared", Number(inp.value) || 0));
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".num-inc").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const inp = container.querySelector<HTMLInputElement>(
        `.num-input[data-planet="${CSS.escape(btn.dataset.planet!)}"][data-field="${btn.dataset.field}"]`,
      )!;
      inp.value = String(
        await saveProximaField(btn.dataset.planet!, btn.dataset.field as "cleared" | "steelPathCleared", (Number(inp.value) || 0) + 1),
      );
    });
  });
}

// 星図/鋼の道のりと同じ「全部クリア/全部未クリア」をProxima進捗にも
// (2026-08-26、のっちの要望)。
async function markAllProxima(field: "cleared" | "steelPathCleared", cleared: boolean): Promise<void> {
  const endpoint = field === "cleared" ? "/api/stats/railjack-proxima/mark-all-normal" : "/api/stats/railjack-proxima/mark-all-steel-path";
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cleared }) });
  state.statsData = await res.json();
  renderProxima();
}
el("proxima-mark-all-cleared").addEventListener("click", () => void markAllProxima("cleared", true));
el("proxima-mark-all-uncleared").addEventListener("click", () => void markAllProxima("cleared", false));
el("proxima-mark-all-steelpath-cleared").addEventListener("click", () => void markAllProxima("steelPathCleared", true));
el("proxima-mark-all-steelpath-uncleared").addEventListener("click", () => void markAllProxima("steelPathCleared", false));

// ---------- Focus/Railjack panel collapse control ----------
// The Stats-owned "did I actually clear this" fact (state layer) is
// independent of Chain View node registration (build-management convenience,
// intent layer) (2026-08-22, pkg/stats.QuestsCleared — replaced the
// Chain-View-derived check after "shouldn't be uncleared just because it's
// not registered in Chain View" feedback). Rising Tide-style cases where one
// prerequisite quest unlocks multiple sections (hull + Intrinsics) mean a
// clear-state change must propagate to every panel referencing that quest.
// Per-section collapse state persists to localStorage (2026-08-22, "let each
// section remember its own state across reloads" feedback) — same pattern as wallpaper.ts/theme.ts.
const COLLAPSE_KEY_PREFIX = "warframe-state-graph:stats:collapsed:";
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

// For sections with no spoiler gate (aggregate/quest progress/star chart/Intrinsics outer frame).
// Spoiler-gated sections are handled separately by initCollapsiblePanel.
function initPlainCollapsible(prefix: string): void {
  const body = el(`${prefix}-body`);
  const chevron = el(`${prefix}-chevron`);
  // Only quest-progress and starchart's panel-heads have this (bulk clear/
  // uncleared buttons) — closest+querySelector makes this a no-op for every
  // other prefix instead of needing a separate hide path (2026-08-26).
  const bulkActions = chevron.closest(".panel-head")?.querySelector<HTMLElement>(".panel-bulk-actions");
  chevron.innerHTML = icon("chevron-down");
  const collapsed = getStoredCollapsed(prefix);
  body.classList.toggle("hidden", collapsed);
  chevron.classList.toggle("expanded", !collapsed);
  bulkActions?.classList.toggle("hidden", collapsed);
  function toggle(): void {
    const nowHidden = body.classList.toggle("hidden");
    chevron.classList.toggle("expanded", !nowHidden);
    setStoredCollapsed(prefix, nowHidden);
    bulkActions?.classList.toggle("hidden", nowHidden);
  }
  chevron.addEventListener("click", toggle);
}

const questGatedPanels: Record<string, { prefix: string; revealedTitle: string }[]> = {};

function isQuestCleared(name: string): boolean {
  return !!(state.statsData.questsCleared && state.statsData.questsCleared[name]);
}

// revealedTitle (the real feature name) only appears in the h2/h3 once the
// corresponding quest is cleared. While uncleared it stays a placeholder
// ("未解放セクション") — "this feature name unlocks with this quest" is
// itself a spoiler that collapse-alone can't prevent (2026-08-20, feedback-driven fix).
function revealPanel(prefix: string, revealedTitle: string, cleared: boolean): void {
  const body = el(`${prefix}-body`);
  const chevron = el(`${prefix}-chevron`);
  const titleEl = el(`${prefix}-title`);
  titleEl.textContent = cleared ? revealedTitle : t().lockedSectionTitle;
  // Force-closed while uncleared, for spoiler safety (overrides the
  // localStorage preference). Once cleared, restore whatever open/closed
  // state was last chosen (default expanded) from localStorage
  // (2026-08-22, "let each section remember its own state" feedback).
  const collapsed = cleared ? getStoredCollapsed(prefix) : true;
  body.classList.toggle("hidden", collapsed);
  chevron.classList.toggle("expanded", !collapsed);
}

async function setQuestCleared(questName: string, cleared: boolean): Promise<void> {
  state.statsData.questsCleared[questName] = cleared;
  (questGatedPanels[questName] || []).forEach(({ prefix, revealedTitle }) => revealPanel(prefix, revealedTitle, cleared));
  const res = await fetch(`/api/stats/quest/${encodeURIComponent(questName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cleared }),
  });
  state.statsData = await res.json();
  // The main-quest checkbox's server-side prerequisite cascade affects other
  // checkboxes too, so re-render to keep the view in sync with server state
  // (2026-08-22, fixed a bug where forgetting this left the two out of sync).
  renderQuestProgress();
}

// Checking 46 entries one at a time is tedious, so bulk toggles are provided
// (2026-08-22; originally one combined "clear all/uncleared all" pair, split
// into separate main/sub buttons after "main and sub should be separate"
// feedback). Same as setQuestCleared, propagates to every gated panel the
// affected quests own before re-rendering.
async function setQuestGroupCleared(group: "main" | "sub", cleared: boolean): Promise<void> {
  const res = await fetch(`/api/stats/quests/${group}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cleared }),
  });
  state.statsData = await res.json();
  Object.keys(questGatedPanels).forEach((questName) => {
    questGatedPanels[questName]!.forEach(({ prefix, revealedTitle }) => revealPanel(prefix, revealedTitle, isQuestCleared(questName)));
  });
  renderQuestProgress();
}

el("quest-mark-main-cleared").addEventListener("click", () => setQuestGroupCleared("main", true));
el("quest-mark-main-uncleared").addEventListener("click", () => setQuestGroupCleared("main", false));
el("quest-mark-sub-cleared").addEventListener("click", () => setQuestGroupCleared("sub", true));
el("quest-mark-sub-uncleared").addEventListener("click", () => setQuestGroupCleared("sub", false));

// All quest checkboxes live in one place (quest-progress-panel); every
// section's collapse decision reads only this self-report (2026-08-22,
// consolidated from checkboxes previously embedded per-section). Main vs.
// side is judged by membership in questchain.MainStoryChain
// (state.mainQuestNames) (2026-08-22, "main and sub should be separate"
// feedback) — the same basis setQuestCleared's cascade uses, so "counts as
// main = cascade applies" stays consistent.
function isMainQuest(name: string): boolean {
  return state.mainQuestNames.some((m) => m.toLowerCase() === name.toLowerCase());
}

function questRowHtml(name: string): string {
  const cleared = state.statsData.questsCleared || {};
  return `
    <label class="quest-clear-check" title="${escapeHtml(questJa(name))}">
      <input type="checkbox" data-quest-clear="${escapeHtml(name)}" ${cleared[name] ? "checked" : ""}>
      <span>${escapeHtml(questJa(name))}</span>
    </label>`;
}

function renderQuestProgress(): void {
  const container = el("quest-progress-list");
  // Every main+side quest (state.allQuests, from /api/reference/quests)
  // (2026-08-22, "put every main and side quest on it" feedback — previously
  // only keys already in statsData.questsCleared were shown, so a never-checked quest never appeared).
  const quests = state.allQuests && state.allQuests.length ? state.allQuests : Object.keys(state.statsData.questsCleared || {});
  const mainQuests = quests
    .filter((q) => isMainQuest(q))
    .sort(
      (a, b) =>
        state.mainQuestNames.findIndex((m) => m.toLowerCase() === a.toLowerCase()) -
        state.mainQuestNames.findIndex((m) => m.toLowerCase() === b.toLowerCase()),
    );
  const subQuests = quests.filter((q) => !isMainQuest(q)).sort((a, b) => questJa(a).localeCompare(questJa(b), "ja"));
  container.innerHTML = `
    <div class="quest-group-title">${t().mainQuestGroupTitle}</div>
    ${mainQuests.map(questRowHtml).join("")}
    <div class="quest-group-title">${t().subQuestGroupTitle}</div>
    ${subQuests.map(questRowHtml).join("")}
  `;
  container.querySelectorAll<HTMLInputElement>("[data-quest-clear]").forEach((cb) => {
    cb.addEventListener("change", () => setQuestCleared(cb.dataset.questClear!, cb.checked));
  });
}

function initCollapsiblePanel(prefix: string, questName: string, revealedTitle: string): void {
  const body = el(`${prefix}-body`);
  const chevron = el(`${prefix}-chevron`);
  el(`${prefix}-icon`).innerHTML = icon("triangle-alert", { size: 15 });
  chevron.innerHTML = icon("chevron-down");

  (questGatedPanels[questName] ??= []).push({ prefix, revealedTitle });
  revealPanel(prefix, revealedTitle, isQuestCleared(questName));

  function toggle(): void {
    const nowHidden = body.classList.toggle("hidden");
    chevron.classList.toggle("expanded", !nowHidden);
    // A toggle while force-closed-for-uncleared is outside the spoiler
    // guard's scope (the click itself always works, but the next load force-closes it regardless), so don't persist it.
    if (isQuestCleared(questName)) setStoredCollapsed(prefix, nowHidden);
  }
  el(`${prefix}-toggle`).addEventListener("click", toggle);
  chevron.addEventListener("click", toggle);
}

// ---------- Load ----------
async function loadChainViewNodes(): Promise<void> {
  try {
    const res = await fetch("/api/graph");
    const graph = await res.json();
    state.nodesById = graph.nodes || {};
  } catch {
    state.nodesById = {};
  }
}
async function loadLoadouts(): Promise<void> {
  try {
    const res = await fetch("/api/loadouts");
    state.loadouts = await res.json();
  } catch {
    /* keep defaults */
  }
}
async function loadCollections(): Promise<void> {
  try {
    const res = await fetch("/api/collections");
    state.collections = await res.json();
  } catch {
    /* keep defaults */
  }
}
async function loadStanding(): Promise<void> {
  try {
    const res = await fetch("/api/standing");
    const body = await res.json();
    state.standing = body.data || state.standing;
  } catch {
    /* keep defaults */
  }
}
async function loadPlanets(): Promise<void> {
  try {
    const res = await fetch("/api/starchart/planets");
    state.planets = res.ok ? await res.json() : [];
  } catch {
    state.planets = [];
  }
}
async function loadProxima(): Promise<void> {
  try {
    const res = await fetch("/api/starchart/proxima");
    state.proxima = res.ok ? await res.json() : [];
  } catch {
    state.proxima = [];
  }
}
async function loadStatsData(): Promise<void> {
  try {
    const res = await fetch("/api/stats");
    state.statsData = await res.json();
  } catch {
    /* keep defaults */
  }
}
async function loadAllQuests(): Promise<void> {
  try {
    const res = await fetch("/api/reference/quests");
    state.allQuests = res.ok ? await res.json() : [];
  } catch {
    state.allQuests = [];
  }
}
async function loadMainQuestNames(): Promise<void> {
  try {
    const res = await fetch("/api/reference/main-quests");
    state.mainQuestNames = res.ok ? await res.json() : [];
  } catch {
    state.mainQuestNames = [];
  }
}

applyI18nText(STRINGS);

Promise.all([
  loadChainViewNodes(),
  loadLoadouts(),
  loadCollections(),
  loadStanding(),
  loadPlanets(),
  loadProxima(),
  loadStatsData(),
  loadAllQuests(),
  loadMainQuestNames(),
]).then(() => {
  renderChainViewAgg();
  renderLoadoutsAgg();
  renderCollectionsAgg();
  renderStandingAgg();
  renderStarchart();
  renderIntrinsics();
  renderFocusGrid();
  renderFocusActiveSelect();
  renderRailjackGrid();
  renderRailjackNote();
  renderProxima();
  initPlainCollapsible("aggregate");
  initPlainCollapsible("quest-progress");
  initPlainCollapsible("starchart");
  initPlainCollapsible("intrinsics");
  initCollapsiblePanel("focus", "The Second Dream", t().revealedTitleFocus);
  initCollapsiblePanel("railjack", "Rising Tide", t().revealedTitleRailjack);
  initCollapsiblePanel("railjack-intrinsics", "Rising Tide", t().revealedTitleRailjackIntrinsics);
  initCollapsiblePanel("drifter-intrinsics", "The Duviri Paradox", t().revealedTitleDrifterIntrinsics);
  renderQuestProgress();
});

onLocaleChange(() => {
  applyI18nText(STRINGS);
  renderChainViewAgg();
  renderLoadoutsAgg();
  renderCollectionsAgg();
  renderStandingAgg();
  renderStarchart();
  renderIntrinsics();
  renderFocusGrid();
  renderFocusActiveSelect();
  renderRailjackGrid();
  renderProxima();
  renderQuestProgress();
  Object.keys(questGatedPanels).forEach((questName) => {
    questGatedPanels[questName]!.forEach(({ prefix }) => {
      const revealed: Record<string, string> = {
        focus: t().revealedTitleFocus,
        railjack: t().revealedTitleRailjack,
        "railjack-intrinsics": t().revealedTitleRailjackIntrinsics,
        "drifter-intrinsics": t().revealedTitleDrifterIntrinsics,
      };
      revealPanel(prefix, revealed[prefix] || prefix, isQuestCleared(questName));
    });
  });
});
