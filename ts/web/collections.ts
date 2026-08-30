// Port of the inline script in web/collections.html.
import type { Node } from "../server/model.ts";
import type {
  ArchwingEntry,
  CompanionEntry,
  Data as CollectionData,
  FrameEntry,
  IncarnonEntry,
  KuvaEntry,
  NecramechEntry,
  RivenEntry,
  WeaponEntry,
} from "../server/collection.ts";
import { confirmInline } from "./confirm-inline.ts";
import { el, maybeEl } from "./dom.ts";
import { icon, iconLabel } from "./icons.ts";
import { renderMiniGraph } from "./minigraph.ts";
import { renderNoteMd } from "./notemd.ts";
import { showToast } from "./toast.ts";
import {
  buildEquipExportText,
  buildFrameEntryExportText,
  buildIncarnonExportText,
  buildKuvaExportText,
  buildRivenExportText,
  formatRivenStat,
  wireCopyButtons,
} from "./export.ts";
import "./card-tilt.ts";
import "./booster.ts";
import "./spoiler-warning.ts";
import "./quest-onboarding.ts";
import "./manual-launcher.ts";
import "./scratch.ts";
import "./kofi-link.ts";
import "./locale.ts";
import "./theme.ts";
import "./wallpaper.ts";
import "./scroll-top.ts";
import { applyI18nText, effective, onLocaleChange } from "./locale.ts";

interface UIStrings {
  [key: string]: string;
  refreshUpdating: string;
  refreshDone: string;
  refreshTitle: string;
  duviriRevealed: string;
  lockedSection: string;
  linkedBadgeDone: string;
  linkedBadgeNotDone: string;
  unfavorite: string;
  favorite: string;
  positiveStatsLabel: string;
  selectedCount: string;
  notSelected: string;
  numberPlaceholder: string;
  noneOption: string;
  weaponNotFound: string;
  weaponArchetype: string;
  archetypeHelp: string;
  positiveMatch: string;
  noMatchingStat: string;
  rivenEditTitle: string;
  rivenNewTitle: string;
  enterWeaponName: string;
  bulkAdded: string;
  emptyRegistry: string;
  fixedTitle: string;
  rerollingTitle: string;
  copyAsText: string;
  delete: string;
  edit: string;
  positiveLabel: string;
  negativeLabel: string;
  deleteConfirm: string;
  countUnit: string;
  ownedTitle: string;
  notOwnedTitle: string;
  kuvaNewTitle: string;
  weaponNameLabel: string;
  kuvaWeaponPlaceholder: string;
  bonusStatLabel: string;
  noEntryForWeapon: string;
  deleteIndividualConfirm: string;
  addAnother: string;
  register: string;
  noMatchFreeform: string;
  acquiredTitle: string;
  notAcquiredTitle: string;
  rank30Title: string;
  notRank30Title: string;
  helminthTitle: string;
  notHelminthTitle: string;
  frameEditTitle: string;
  frameNewTitle: string;
  enterFrameName: string;
  skippedDuplicate: string;
  weaponLabel: string;
  companionLabel: string;
  editSuffix: string;
  newSuffix: string;
  enterNameSuffix: string;
  obtainedTitle: string;
  notObtainedTitle: string;
  incarnonDoneTitle: string;
  notIncarnonTitle: string;
  incarnonEditTitle: string;
  incarnonNewTitle: string;
  helpToggleTitle: string;
  helpPopoverHtml: string;
  addNew: string;
  chevronToggle: string;
  frameSectionHeading: string;
  weaponSectionHeading: string;
  companionSectionHeading: string;
  archwingSectionHeading: string;
  necramechSectionHeading: string;
  rivenSectionHeading: string;
  kuvaSectionHeading: string;
  duviriWarning: string;
  legendAcquired: string;
  legendRank30: string;
  legendHelminth: string;
  legendFixed: string;
  legendOwned: string;
  legendObtained: string;
  legendIncarnonDone: string;
  rollFixedCheck: string;
  bulkRegister: string;
  rivenWeaponLabel: string;
  rivenWeaponPlaceholder: string;
  positiveStatsField: string;
  negativeStatField: string;
  memoLabel: string;
  memoHelpTitle: string;
  optional: string;
  cancel: string;
  save: string;
  ownedCheck: string;
  lineageLabel: string;
  bonusStatField: string;
  dismiss: string;
  close: string;
  frameNameLabel: string;
  framePlaceholder: string;
  acquiredCheck: string;
  rank30Check: string;
  helminthCheck: string;
  addToChainView: string;
  weaponNameField: string;
  weaponPlaceholder: string;
  companionNameLabel: string;
  companionPlaceholder: string;
  archwingNameLabel: string;
  archwingPlaceholder: string;
  necramechNameLabel: string;
  necramechPlaceholder: string;
  incarnonWeaponLabel: string;
  incarnonPlaceholder: string;
  incarnonObtainedCheck: string;
  incarnonCompletedCheck: string;
  dmgImpact: string;
  dmgHeat: string;
  dmgCold: string;
  dmgElectricity: string;
  dmgToxin: string;
  dmgMagnetic: string;
  dmgRadiation: string;
}

const STRINGS: Record<"ja" | "en", UIStrings> = {
  ja: {
    refreshUpdating: "更新中…",
    refreshDone: "更新完了",
    refreshTitle: "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください",
    duviriRevealed: "デュビリ（インカーノン）",
    lockedSection: "未解放セクション",
    linkedBadgeDone: "達成済み",
    linkedBadgeNotDone: "未達成",
    unfavorite: "お気に入り解除",
    favorite: "お気に入りにする",
    positiveStatsLabel: "ポジ値",
    selectedCount: "件選択",
    notSelected: "未選択",
    numberPlaceholder: "数値%",
    noneOption: "（なし）",
    weaponNotFound: "がWFCDデータに見つかりません（完全一致が必要）",
    weaponArchetype: "武器アーキタイプ:",
    archetypeHelp:
      "武器の素の会心/状態異常率からCrit/Status/Hybrid/Utilityを判定し、選んだポジ値ステータスがそのアーキタイプと噛み合っているかだけを表示します（Damage/Multishotは全アーキタイプ共通で一致扱い）。理論値レンジの計算はしていません。",
    positiveMatch: "ポジ値と一致",
    noMatchingStat: "一致ステータスなし",
    rivenEditTitle: "Riven 編集",
    rivenNewTitle: "Riven 新規登録",
    enterWeaponName: "対象武器名を入力して",
    bulkAdded: "件追加しました（最新:",
    emptyRegistry: "まだ登録がありません（見出し横の＋から登録できます）",
    fixedTitle: "確定",
    rerollingTitle: "リロール中",
    copyAsText: "テキストでコピー",
    delete: "削除",
    edit: "編集",
    positiveLabel: "ポジ値:",
    negativeLabel: "ネガ値:",
    deleteConfirm: "を削除する？",
    countUnit: "件",
    ownedTitle: "所持済み",
    notOwnedTitle: "未所持",
    kuvaNewTitle: "Kuva / Tenet / Coda — 新規登録",
    weaponNameLabel: "武器名（WFCD実データ名と完全一致）",
    kuvaWeaponPlaceholder: "例: Kuva Bramma",
    bonusStatLabel: "ボーナス属性:",
    noEntryForWeapon: "まだこの武器は登録されていません",
    deleteIndividualConfirm: "この個体を削除する？",
    addAnother: "この武器をもう1件追加",
    register: "登録する",
    noMatchFreeform: "一致なし（このまま自由入力できます）",
    acquiredTitle: "入手済み",
    notAcquiredTitle: "未入手",
    rank30Title: "ランク30済み",
    notRank30Title: "ランク30未達",
    helminthTitle: "ヘルミンス済み",
    notHelminthTitle: "ヘルミンス未実施",
    frameEditTitle: "フレーム 編集",
    frameNewTitle: "フレーム 新規登録",
    enterFrameName: "フレーム名を入力して",
    skippedDuplicate: "既に登録済みのためスキップ:",
    weaponLabel: "武器",
    companionLabel: "コンパニオン",
    editSuffix: "編集",
    newSuffix: "新規登録",
    enterNameSuffix: "名を入力して",
    obtainedTitle: "取得済み",
    notObtainedTitle: "未取得",
    incarnonDoneTitle: "インカーノン済み",
    notIncarnonTitle: "未インカーノン",
    incarnonEditTitle: "インカーノン 編集",
    incarnonNewTitle: "インカーノン 新規登録",
    helpToggleTitle: "このページについて",
    helpPopoverHtml: `
          <div style="margin-bottom:8px;">Chain View / Loadoutsとは独立した、フレーム/Riven/Kuvaの入手状況ログです。</div>
          <ul style="margin:0 0 10px;padding-left:18px;">
            <li>緑のアイコンは「達成済み」、灰色は「未達成」。1枚に複数の指標がある場合はアイコンの形でカテゴリを区別しています</li>
            <li>星マーク（★）は「今のビルドで使ってる/優先度高い」という主観マーカーで、状態アイコンとは独立して立てられます。お気に入りが先頭に並びます</li>
          </ul>
          <div>⚠️ 一部のセクションは前提クエストクリア後にのみ内容が明らかになります。</div>`,
    addNew: "新規登録",
    chevronToggle: "開閉",
    frameSectionHeading: "フレーム入手状況",
    weaponSectionHeading: "武器入手状況",
    companionSectionHeading: "コンパニオン入手状況",
    archwingSectionHeading: "Archwing入手状況",
    necramechSectionHeading: "Necramech入手状況",
    rivenSectionHeading: "Riven Mods",
    kuvaSectionHeading: "Kuva / Tenet / Coda 武器",
    duviriWarning: "前提クエスト（デュヴィリ・パラドックス）をクリアすると内容が明らかになります。ネタバレ回避のため、未クリアの場合は開かないことをおすすめします。",
    legendAcquired: "入手済み",
    legendRank30: "ランク30済み",
    legendHelminth: "ヘルミンス済み",
    legendFixed: "確定",
    legendOwned: "所持済み",
    legendObtained: "取得済み",
    legendIncarnonDone: "インカーノン済み",
    rollFixedCheck: "ロール確定",
    bulkRegister: "連続登録（名前だけで追加を続ける）",
    rivenWeaponLabel: "対象武器名（WFCD実データ名と完全一致）",
    rivenWeaponPlaceholder: "例: Braton Prime",
    positiveStatsField: "ポジ値ステータス（複数選択可）",
    negativeStatField: "ネガ値ステータス（任意）",
    memoLabel: "メモ",
    memoHelpTitle: "**太字**／- で箇条書き／- [ ]・- [x] でチェックリスト（保存後はクリックで完了切替）",
    optional: "任意",
    cancel: "キャンセル",
    save: "保存",
    ownedCheck: "所持済み",
    lineageLabel: "系統",
    bonusStatField: "ボーナス属性（変換に使ったフレームで決まる、任意）",
    dismiss: "やめる",
    close: "閉じる",
    frameNameLabel: "フレーム名（WFCD実データ名と完全一致）",
    framePlaceholder: "例: Ash Prime",
    acquiredCheck: "入手済み",
    rank30Check: "ランク30済み",
    helminthCheck: "ヘルミンス済み（捧げた）",
    addToChainView: "Chain Viewに追加する",
    weaponNameField: "武器名（WFCD実データ名と完全一致）",
    weaponPlaceholder: "例: Braton Prime",
    companionNameLabel: "コンパニオン名（WFCD実データ名と完全一致）",
    companionPlaceholder: "例: Chesa Kubrow",
    archwingNameLabel: "Archwing名（WFCD実データ名と完全一致）",
    archwingPlaceholder: "例: Itzal",
    necramechNameLabel: "Necramech名（WFCD実データ名と完全一致）",
    necramechPlaceholder: "例: Voidrig",
    incarnonWeaponLabel: "対象武器名（WFCD実データ名と完全一致）",
    incarnonPlaceholder: "例: Braton",
    incarnonObtainedCheck: "インカーノン取得済み",
    incarnonCompletedCheck: "インカーノン済み",
    dmgImpact: "衝撃",
    dmgHeat: "火炎",
    dmgCold: "冷気",
    dmgElectricity: "電気",
    dmgToxin: "毒",
    dmgMagnetic: "磁気",
    dmgRadiation: "放射線",
  },
  en: {
    refreshUpdating: "Updating…",
    refreshDone: "Done",
    refreshTitle: "Press this when new frames/weapons added by a game update aren't showing up as candidates",
    duviriRevealed: "Duviri (Incarnon)",
    lockedSection: "Locked section",
    linkedBadgeDone: "satisfied",
    linkedBadgeNotDone: "not satisfied",
    unfavorite: "Remove from favorites",
    favorite: "Add to favorites",
    positiveStatsLabel: "Positives",
    selectedCount: " selected",
    notSelected: "none selected",
    numberPlaceholder: "value %",
    noneOption: "(none)",
    weaponNotFound: " isn't in the WFCD data (an exact match is required)",
    weaponArchetype: "Weapon archetype:",
    archetypeHelp:
      "Classifies the weapon as Crit/Status/Hybrid/Utility from its base crit and status chance, and only shows whether the positive stats you picked fit that archetype (Damage/Multishot count as a match for every archetype). It does not calculate theoretical value ranges.",
    positiveMatch: "Matches the positives",
    noMatchingStat: "No matching stat",
    rivenEditTitle: "Edit Riven",
    rivenNewTitle: "Register a Riven",
    enterWeaponName: "Enter the target weapon's name",
    bulkAdded: " added (latest:",
    emptyRegistry: "Nothing registered yet (use the + next to the heading)",
    fixedTitle: "Finalized",
    rerollingTitle: "Rerolling",
    copyAsText: "Copy as text",
    delete: "Delete",
    edit: "Edit",
    positiveLabel: "Positives:",
    negativeLabel: "Negative:",
    deleteConfirm: "?",
    countUnit: "",
    ownedTitle: "Owned",
    notOwnedTitle: "Not owned",
    kuvaNewTitle: "Kuva / Tenet / Coda — register",
    weaponNameLabel: "Weapon name (must exactly match WFCD's data)",
    kuvaWeaponPlaceholder: "e.g. Kuva Bramma",
    bonusStatLabel: "Bonus stat:",
    noEntryForWeapon: "Nothing registered for this weapon yet",
    deleteIndividualConfirm: "Delete this one?",
    addAnother: "Add another of this weapon",
    register: "Register",
    noMatchFreeform: "No match (you can still type it freely)",
    acquiredTitle: "Acquired",
    notAcquiredTitle: "Not acquired",
    rank30Title: "Rank 30",
    notRank30Title: "Below rank 30",
    helminthTitle: "Fed to Helminth",
    notHelminthTitle: "Not fed to Helminth",
    frameEditTitle: "Edit frame",
    frameNewTitle: "Register a frame",
    enterFrameName: "Enter a frame name",
    skippedDuplicate: "Already registered, skipped:",
    weaponLabel: "Weapon",
    companionLabel: "Companion",
    editSuffix: "— edit",
    newSuffix: "— register",
    enterNameSuffix: " name — please enter one",
    obtainedTitle: "Obtained",
    notObtainedTitle: "Not obtained",
    incarnonDoneTitle: "Incarnon complete",
    notIncarnonTitle: "Incarnon incomplete",
    incarnonEditTitle: "Edit Incarnon",
    incarnonNewTitle: "Register an Incarnon",
    helpToggleTitle: "About this page",
    helpPopoverHtml: `
          <div style="margin-bottom:8px;">A log of which frames/Rivens/Kuva weapons you have, independent of Chain View and Loadouts.</div>
          <ul style="margin:0 0 10px;padding-left:18px;">
            <li>A green icon means "done", grey means "not done". When a card carries several indicators, the icon shape tells the categories apart</li>
            <li>The star is a subjective "currently using this / high priority" marker, set independently of the status icons. Favorites sort to the front</li>
          </ul>
          <div>⚠️ Some sections only reveal their content once their gating quest is cleared.</div>`,
    addNew: "Register",
    chevronToggle: "Toggle",
    frameSectionHeading: "Frames acquired",
    weaponSectionHeading: "Weapons acquired",
    companionSectionHeading: "Companions acquired",
    archwingSectionHeading: "Archwings acquired",
    necramechSectionHeading: "Necramechs acquired",
    rivenSectionHeading: "Riven Mods",
    kuvaSectionHeading: "Kuva / Tenet / Coda weapons",
    duviriWarning: "This section is revealed once the gating quest (The Duviri Paradox) is cleared. To avoid spoilers, we recommend not opening it until then.",
    legendAcquired: "Acquired",
    legendRank30: "Rank 30",
    legendHelminth: "Fed to Helminth",
    legendFixed: "Finalized",
    legendOwned: "Owned",
    legendObtained: "Obtained",
    legendIncarnonDone: "Incarnon complete",
    rollFixedCheck: "Roll finalized",
    bulkRegister: "Bulk-register (keep adding by name only)",
    rivenWeaponLabel: "Target weapon name (must exactly match WFCD's data)",
    rivenWeaponPlaceholder: "e.g. Braton Prime",
    positiveStatsField: "Positive stats (multiple allowed)",
    negativeStatField: "Negative stat (optional)",
    memoLabel: "Memo",
    memoHelpTitle: "**bold** / - for a bullet list / - [ ] and - [x] for a checklist (click to toggle after saving)",
    optional: "Optional",
    cancel: "Cancel",
    save: "Save",
    ownedCheck: "Owned",
    lineageLabel: "Lineage",
    bonusStatField: "Bonus stat (determined by the frame used for the conversion, optional)",
    dismiss: "Discard",
    close: "Close",
    frameNameLabel: "Frame name (must exactly match WFCD's data)",
    framePlaceholder: "e.g. Ash Prime",
    acquiredCheck: "Acquired",
    rank30Check: "Rank 30",
    helminthCheck: "Fed to Helminth",
    addToChainView: "Also add to Chain View",
    weaponNameField: "Weapon name (must exactly match WFCD's data)",
    weaponPlaceholder: "e.g. Braton Prime",
    companionNameLabel: "Companion name (must exactly match WFCD's data)",
    companionPlaceholder: "e.g. Chesa Kubrow",
    archwingNameLabel: "Archwing name (must exactly match WFCD's data)",
    archwingPlaceholder: "e.g. Itzal",
    necramechNameLabel: "Necramech name (must exactly match WFCD's data)",
    necramechPlaceholder: "e.g. Voidrig",
    incarnonWeaponLabel: "Target weapon name (must exactly match WFCD's data)",
    incarnonPlaceholder: "e.g. Braton",
    incarnonObtainedCheck: "Incarnon obtained",
    incarnonCompletedCheck: "Incarnon complete",
    dmgImpact: "Impact",
    dmgHeat: "Heat",
    dmgCold: "Cold",
    dmgElectricity: "Electricity",
    dmgToxin: "Toxin",
    dmgMagnetic: "Magnetic",
    dmgRadiation: "Radiation",
  },
};

function t(): UIStrings {
  return STRINGS[effective()];
}

/** 「name」を削除する？ / Delete "name"? — the quoting style differs per
 * locale (Japanese corner brackets vs. straight quotes), so this wraps the
 * name rather than the STRINGS table carrying a half-open bracket. */
function deleteConfirmMsg(name: string): string {
  return effective() === "en" ? `Delete "${name}"?` : `「${name}」を削除する？`;
}

// Shared shape for WeaponEntry/CompanionEntry/ArchwingEntry/NecramechEntry
// (FrameEntry-like, no helminthFed) so renderEquipList/openEquipModal/
// equipSave can handle all 4 with one generic implementation, same as the Go original.
type EquipEntry = WeaponEntry | CompanionEntry | ArchwingEntry | NecramechEntry;
type EquipKind = "weapon" | "companion" | "archwing" | "necramech";
type EquipApiPath = "weapons" | "companions" | "archwings" | "necramechs";
type EquipRefNamesKey = "weaponNames" | "companionNames" | "archwingNames" | "necramechNames";

const state: {
  data: CollectionData;
  chainViewNodes: Node[];
  nodesById: Record<string, Node>;
  weaponNames: string[];
  frameNames: string[];
  companionNames: string[];
  archwingNames: string[];
  necramechNames: string[];
  rivenStatChoices: string[];
  duviriCleared: boolean;
} = {
  data: {
    schemaVersion: 1,
    rivens: {},
    kuva: {},
    frames: {},
    weapons: {},
    companions: {},
    archwings: {},
    necramechs: {},
    incarnons: {},
  },
  chainViewNodes: [],
  nodesById: {},
  weaponNames: [],
  frameNames: [],
  companionNames: [],
  archwingNames: [],
  necramechNames: [],
  rivenStatChoices: [],
  duviriCleared: false,
};

// The Duviri (Incarnon) panel is a spoiler gate on The Duviri Paradox clear
// state (same prerequisite quest as web/stats.html's Drifter Intrinsics
// panel — this page was missing that gate until a 2026-08-23 fix). Source of
// truth is pkg/stats.QuestsCleared (Stats page's own "quest progress" panel
// self-report, independent of Chain View). The collapse mechanism itself
// matches web/stats.html's initCollapsiblePanel/revealPanel exactly ("should
// be stored collapsed" feedback, 2026-08-23): while uncleared, the heading
// stays a placeholder and forces closed; once cleared, the last-chosen
// open/closed state restores from localStorage.
const COLLAPSE_KEY_PREFIX = "warframe-state-graph:collections:collapsed:";
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

// For non-spoiler-gated panels (Frame/Riven/Kuva/equip). No quest-linked
// forced-display control, just persists open/closed to localStorage (same as
// web/stats.html's initPlainCollapsible, "let each section remember its own
// state" feedback, 2026-08-23).
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

async function loadDuviriGate(): Promise<void> {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    state.duviriCleared = !!(data.questsCleared && data.questsCleared["The Duviri Paradox"]);
  } catch {
    state.duviriCleared = false;
  }
}

function initIncarnonCollapse(): void {
  el("incarnon-icon").innerHTML = icon("triangle-alert", { size: 15 });
  const chevron = el("incarnon-chevron");
  chevron.innerHTML = icon("chevron-down");

  const body = el("incarnon-body");
  const titleEl = el("incarnon-title");
  const addBtn = el("incarnon-add-btn");
  const cleared = state.duviriCleared;
  titleEl.textContent = cleared ? t().duviriRevealed : t().lockedSection;

  // The add button is hidden for two independent reasons here: the spoiler
  // gate (don't hint the feature exists before Duviri is cleared) and,
  // same as every other section's addBtn/legend (2026-08-26, のっち's
  // call), being collapsed. Either reason alone is enough to hide it.
  function applyCollapsed(collapsed: boolean): void {
    body.classList.toggle("hidden", collapsed);
    chevron.classList.toggle("expanded", !collapsed);
    addBtn.classList.toggle("hidden", collapsed || !cleared);
  }
  applyCollapsed(cleared ? getStoredCollapsed("incarnon") : true);

  function toggle(): void {
    const nowHidden = !body.classList.contains("hidden");
    applyCollapsed(nowHidden);
    // A toggle while force-closed-for-uncleared doesn't persist (next load
    // force-closes it again regardless, same reasoning as web/stats.html).
    if (cleared) setStoredCollapsed("incarnon", nowHidden);
  }
  el("incarnon-toggle").addEventListener("click", toggle);
  chevron.addEventListener("click", toggle);
}

// 1:1 with wfcdgen.RivenStatChoices (pkg/wfcdgen/wfcdgen.go). pkg/glossary
// (`/api/glossary`, the header settings modal's "用語" tab / web/glossary.html)
// holds nearly the same ~28 entries in a user-editable form, so that source
// takes priority (2026-08-20, "make it reflect glossary edits" request).
// Scope doesn't fully overlap though (e.g. this table's "Damage"/"Fire Rate"
// are compound keys "Weapon Damage / Melee Damage"/"Fire Rate / Attack
// Speed" on the glossary side), so a key missing from glossary falls back to
// this hardcoded table rather than the label disappearing.
const RIVEN_STAT_JA: Record<string, string> = {
  "Critical Chance": "会心率",
  "Critical Damage": "会心ダメージ",
  "Status Chance": "状態異常率",
  "Status Duration": "状態異常持続時間",
  Multishot: "マルチショット",
  Damage: "ダメージ",
  "Fire Rate": "連射速度",
  "Reload Speed": "リロード速度",
  "Punch Through": "貫通",
  Range: "射程",
  "Magazine Capacity": "弾倉容量",
  Recoil: "反動",
};
let glossaryMap: Record<string, string> = {};
async function loadGlossary(): Promise<void> {
  try {
    const res = await fetch("/api/glossary");
    if (!res.ok) return;
    const data = await res.json();
    glossaryMap = {};
    Object.values(data.entries || {}).forEach((e) => {
      const entry = e as { enKey: string; ja: string };
      glossaryMap[entry.enKey] = entry.ja;
    });
  } catch {
    /* falls back to RIVEN_STAT_JA alone on fetch failure */
  }
}
function ja(stat: string): string {
  // English mode uses the dictionary KEY as-is — the keys are already the
  // canonical English stat names, so no separate EN table is needed (same
  // convention as standing.ts's SYNDICATE_JA and stats.ts's PLANET_JA).
  if (effective() === "en") return stat;
  return glossaryMap[stat] || RIVEN_STAT_JA[stat] || stat;
}

el("refresh-wfcd-btn").innerHTML = icon("refresh-cw");
el("refresh-wfcd-btn").addEventListener("click", async () => {
  const btn = el("refresh-wfcd-btn");
  (btn as HTMLButtonElement).disabled = true;
  btn.classList.add("spinning");
  btn.title = t().refreshUpdating;
  await fetch("/api/wfcd/refresh", { method: "POST" });
  btn.classList.remove("spinning");
  btn.classList.add("success");
  btn.innerHTML = icon("check");
  btn.title = t().refreshDone;
  setTimeout(() => {
    btn.classList.remove("success");
    btn.innerHTML = icon("refresh-cw");
    (btn as HTMLButtonElement).disabled = false;
    btn.title = t().refreshTitle;
  }, 2000);
});

el("help-toggle").innerHTML = icon("info");

// The add-new button lives at the heading (icon button) rather than a "+"
// card at the end of the grid (2026-08-23, "position gets awkward as the
// count grows" feedback) — a fixed spot regardless of list length.
el("frame-add-btn").innerHTML = icon("plus");
el("frame-add-btn").addEventListener("click", () => openFrameModal(null));
el("riven-add-btn").innerHTML = icon("plus");
el("riven-add-btn").addEventListener("click", () => openRivenModal(null));
el("kuva-add-btn").innerHTML = icon("plus");
el("kuva-add-btn").addEventListener("click", () => openKuvaModal(""));
el("incarnon-add-btn").innerHTML = icon("plus");
el("incarnon-add-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openIncarnonModal(null);
});

el("riven-legend-fixed").innerHTML = icon("check", { size: 14 });
el("kuva-legend-owned").innerHTML = icon("check", { size: 14 });
el("frame-legend-owned").innerHTML = icon("check", { size: 14 });
el("frame-legend-rank30").innerHTML = icon("zap", { size: 14 });
el("frame-legend-helminth").innerHTML = icon("archive", { size: 14 });
el("incarnon-legend-obtained").innerHTML = icon("check", { size: 14 });
el("incarnon-legend-completed").innerHTML = icon("zap", { size: 14 });

(["riven", "kuva", "frame", "incarnon"] as const).forEach((prefix) => {
  el(`${prefix}-note-help`).innerHTML = icon("circle-alert", { size: 13 });
});

async function loadAll(): Promise<void> {
  const res = await fetch("/api/collections");
  state.data = await res.json();
  if (!state.data.rivens) state.data.rivens = {};
  if (!state.data.kuva) state.data.kuva = {};
  if (!state.data.frames) state.data.frames = {};
  if (!state.data.weapons) state.data.weapons = {};
  if (!state.data.companions) state.data.companions = {};
  if (!state.data.archwings) state.data.archwings = {};
  if (!state.data.necramechs) state.data.necramechs = {};
  if (!state.data.incarnons) state.data.incarnons = {};
  render();
}

async function loadFrameNames(): Promise<void> {
  try {
    const res = await fetch("/api/reference/frames");
    state.frameNames = res.ok ? await res.json() : [];
  } catch {
    state.frameNames = [];
  }
}

async function loadCompanionNames(): Promise<void> {
  try {
    const res = await fetch("/api/reference/companions");
    state.companionNames = res.ok ? await res.json() : [];
  } catch {
    state.companionNames = [];
  }
}
async function loadArchwingNames(): Promise<void> {
  try {
    const res = await fetch("/api/reference/archwings");
    state.archwingNames = res.ok ? await res.json() : [];
  } catch {
    state.archwingNames = [];
  }
}
async function loadNecramechNames(): Promise<void> {
  try {
    const res = await fetch("/api/reference/necramechs");
    state.necramechNames = res.ok ? await res.json() : [];
  } catch {
    state.necramechNames = [];
  }
}

async function loadChainViewNodes(): Promise<void> {
  try {
    const res = await fetch("/api/graph");
    const graph = await res.json();
    state.nodesById = graph.nodes || {};
    state.chainViewNodes = Object.values(state.nodesById).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    state.chainViewNodes = [];
    state.nodesById = {};
  }
}

async function loadWeaponNames(): Promise<void> {
  try {
    const res = await fetch("/api/reference/weapons");
    state.weaponNames = res.ok ? await res.json() : [];
  } catch {
    state.weaponNames = [];
  }
}

async function loadRivenStatChoices(): Promise<void> {
  try {
    const res = await fetch("/api/wfcd/riven-stats");
    state.rivenStatChoices = res.ok ? await res.json() : [];
  } catch {
    state.rivenStatChoices = [];
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Riven/Kuva stat value inputs were plain type="text" with no filtering — any
// character could be typed, and only parseFloat()'s leading-number extraction
// at save time kept garbage out. That leaves the box itself showing whatever
// was typed (e.g. "50%%abc") until save. Strips everything but digits and one
// decimal point — no sign, ever: the "ネガ値" input takes the same plain
// magnitude as positive-stat/bonus values, and the negative sign is applied
// automatically at save time from which stat select it's paired with
// (2026-08-26 のっち's call — typing "-" by hand was itself the bug).
function sanitizeDecimalInput(raw: string): string {
  const s = raw.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot === -1) return s;
  return s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
}
function setupNumericValueInput(id: string): void {
  const input = el<HTMLInputElement>(id);
  input.addEventListener("input", () => {
    const sanitized = sanitizeDecimalInput(input.value);
    if (sanitized !== input.value) input.value = sanitized;
  });
}

// A value input is only meaningful once its paired stat select actually
// picks a stat — otherwise there's nothing for the number to attach to.
// Disables (and clears) the value box whenever the select is at "（なし）",
// both on user interaction and when a modal opens/re-populates the select.
function syncGatedValueInput(selectId: string, inputId: string): void {
  const hasStat = !!el<HTMLSelectElement>(selectId).value;
  const input = el<HTMLInputElement>(inputId);
  input.disabled = !hasStat;
  if (!hasStat) input.value = "";
}
function setupGatedValueInput(selectId: string, inputId: string): void {
  el<HTMLSelectElement>(selectId).addEventListener("change", () => syncGatedValueInput(selectId, inputId));
}
function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chainViewLinkBadge(nodeId: string | undefined): string {
  const node = nodeId ? state.nodesById[nodeId] : undefined;
  if (!node) return "";
  return `<span class="badge badge-linked">${icon("link-2")}${escapeHtml(node.name)}: ${node.satisfied ? t().linkedBadgeDone : t().linkedBadgeNotDone}</span>`;
}

// Chain View連携はLoadouts(Item.chainViewNodeId)と同じ設計に統一(2026-08-26、のっちの
// 判断): 既存ノードを手動選択するUIは持たず、登録時のみのチェックボックスでWFCDデータから
// 新規ノードを繋ぐ。登録後にリンクを変更する手段は用意しない。Frame/Weaponは
// index.htmlのWFCDウィザードを名前入力済みで開く方式(2026-08-30改訂、レリック候補も選べる)、
// Companion/Archwing/Necramechは対象外(Chain View側にnodeTypeが無い)なので、代わりに
// 空のGoalノードを1つ作るだけの簡易版(createSimpleGoalNode)を使う。Riven/Kuvaは実体を持つ
// 武器そのものではなくMOD個体なので、この機能自体を持たない。
async function createSimpleGoalNode(name: string): Promise<string | null> {
  const id = uid("goal");
  const node = { id, name, type: "Goal", requires: [], contains: [] };
  const res = await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(node) });
  return res.ok ? id : null;
}
function starBtn(favorite: boolean | undefined, dataAttrs: string): string {
  return `<button class="star-btn ${favorite ? "favorite" : ""}" ${dataAttrs} title="${favorite ? t().unfavorite : t().favorite}">${icon(favorite ? "star" : "star-off", { size: 18 })}</button>`;
}

function render(): void {
  renderRivenList();
  renderKuvaGroupedList();
  renderFrameList();
  (Object.keys(EQUIP_KINDS) as EquipKind[]).forEach((kind) => renderEquipList(kind));
  renderIncarnonList();
}

// ---------- popovers (help / multiselect) ----------
function setupPopoverToggle(btnId: string, popId: string): void {
  const btn = el(btnId);
  const pop = el(popId);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.toggle("hidden");
  });
  pop.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => pop.classList.add("hidden"));
}
setupPopoverToggle("help-toggle", "help-popover");
setupNumericValueInput("riven-negative-value");
setupNumericValueInput("kuva-bonus-value-input");
setupGatedValueInput("riven-negative-select", "riven-negative-value");
setupGatedValueInput("kuva-bonus-stat-select", "kuva-bonus-value-input");

function toggleFavorite(kind: "riven" | "kuva", id: string): void {
  if (kind === "riven") {
    const entry = { ...state.data.rivens[id]!, favorite: !state.data.rivens[id]!.favorite };
    void upsertRiven(entry);
  } else {
    const entry = { ...state.data.kuva[id]!, favorite: !state.data.kuva[id]!.favorite };
    void upsertKuva(entry);
  }
}

// ---------- Riven: multi-select popover ----------
function renderRivenPositivePopover(): void {
  const pop = el("riven-positive-popover");
  pop.innerHTML = state.rivenStatChoices
    .map((s) => `<label><input type="checkbox" data-riven-positive value="${escapeHtml(s)}">${ja(s)}</label>`)
    .join("");
  pop.querySelectorAll<HTMLInputElement>("[data-riven-positive]").forEach((cb) =>
    cb.addEventListener("change", () => {
      updateRivenPositiveBtnLabel();
      updateRivenLiveCheck();
      renderRivenPositiveValues();
    }),
  );
}
function selectedRivenPositiveStats(): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>("[data-riven-positive]:checked")).map((cb) => cb.value);
}
function updateRivenPositiveBtnLabel(): void {
  const n = selectedRivenPositiveStats().length;
  el("riven-positive-btn").innerHTML = `<span>${t().positiveStatsLabel}: ${n ? `${n}${t().selectedCount}` : t().notSelected}</span>${icon("chevron-down")}`;
}
setupPopoverToggle("riven-positive-btn", "riven-positive-popover");

// Per-selected-positive-stat numeric input. Since the checkbox change
// re-renders this block, in-progress values are held in
// rivenPositiveValueDraft so they don't vanish mid-edit (cleared on
// save/modal-open).
let rivenPositiveValueDraft: Record<string, string> = {};
function renderRivenPositiveValues(): void {
  const stats = selectedRivenPositiveStats();
  const container = el("riven-positive-values");
  if (!stats.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = stats
    .map(
      (s) => `
    <div class="inline-form" style="margin-bottom:4px;">
      <span style="flex:1;">${ja(s)}</span>
      <input type="text" inputmode="decimal" data-riven-value="${escapeHtml(s)}" placeholder="${t().numberPlaceholder}" style="width:80px;" value="${escapeHtml(rivenPositiveValueDraft[s] ?? "")}">
    </div>
  `,
    )
    .join("");
  container.querySelectorAll<HTMLInputElement>("[data-riven-value]").forEach((inp) =>
    inp.addEventListener("input", () => {
      const sanitized = sanitizeDecimalInput(inp.value);
      if (sanitized !== inp.value) inp.value = sanitized;
      rivenPositiveValueDraft[inp.dataset.rivenValue!] = sanitized;
    }),
  );
}
function selectedRivenPositiveValues(): number[] {
  return selectedRivenPositiveStats().map((s) => parseFloat(rivenPositiveValueDraft[s]!) || 0);
}

function renderRivenNegativeSelect(): void {
  el("riven-negative-select").innerHTML =
    `<option value="">${t().noneOption}</option>` + state.rivenStatChoices.map((s) => `<option value="${escapeHtml(s)}">${ja(s)}</option>`).join("");
}

let rivenCheckDebounce: ReturnType<typeof setTimeout> | undefined;
function updateRivenLiveCheck(): void {
  clearTimeout(rivenCheckDebounce);
  const resultEl = el("riven-live-check");
  const weapon = el<HTMLInputElement>("riven-weapon-input").value.trim();
  if (!weapon) {
    resultEl.innerHTML = "";
    return;
  }
  rivenCheckDebounce = setTimeout(async () => {
    const positive = selectedRivenPositiveStats();
    const params = new URLSearchParams({ weapon });
    if (positive.length) params.set("positive", positive.join(","));
    const res = await fetch(`/api/wfcd/riven-check?${params}`);
    if (!res.ok) {
      resultEl.innerHTML = `<span class="empty">${effective() === "en" ? `"${escapeHtml(weapon)}"` : `「${escapeHtml(weapon)}」`}${t().weaponNotFound}</span>`;
      return;
    }
    const check = (await res.json()) as { archetype: string; matches: boolean; matchedStats?: string[] };
    resultEl.innerHTML = `
      <b>${t().weaponArchetype}</b> ${check.archetype}
      <span title="${t().archetypeHelp}">${icon("circle-alert", { size: 14, class: "help-hint" })}</span>
      ${
        check.matches
          ? `<span class="badge badge-match">${icon("check")}${t().positiveMatch}（${(check.matchedStats || []).map(ja).join(", ")}）</span>`
          : `<span class="badge badge-nomatch">${t().noMatchingStat}</span>`
      }`;
  }, 300);
}
el("riven-weapon-input").addEventListener("input", updateRivenLiveCheck);

// ---------- Riven: modal ----------
let rivenEditingId: string | null = null;
let rivenBulkCount = 0;
function openRivenModal(editId: string | null): void {
  rivenEditingId = editId || null;
  const entry = editId ? state.data.rivens[editId] : null;
  el("riven-modal-title").textContent = entry ? t().rivenEditTitle : t().rivenNewTitle;
  el<HTMLInputElement>("riven-weapon-input").value = entry ? entry.weaponName : "";
  el<HTMLSelectElement>("riven-negative-select").value = entry ? entry.negativeStat || "" : "";
  el<HTMLInputElement>("riven-negative-value").value = entry && entry.negativeValue ? String(Math.abs(entry.negativeValue)) : "";
  syncGatedValueInput("riven-negative-select", "riven-negative-value");
  el<HTMLInputElement>("riven-fixed-check").checked = entry ? !!entry.fixed : false;
  el<HTMLTextAreaElement>("riven-note-input").value = entry ? entry.note || "" : "";
  document.querySelectorAll<HTMLInputElement>("[data-riven-positive]").forEach((cb) => {
    cb.checked = entry ? (entry.positiveStats || []).includes(cb.value) : false;
  });
  updateRivenPositiveBtnLabel();
  rivenPositiveValueDraft = {};
  if (entry) {
    (entry.positiveStats || []).forEach((s, i) => {
      const v = (entry.positiveValues || [])[i];
      if (v) rivenPositiveValueDraft[s] = String(v);
    });
  }
  renderRivenPositiveValues();
  el("riven-live-check").innerHTML = "";
  if (entry) updateRivenLiveCheck();
  el("riven-bulk-row").classList.toggle("hidden", !!editId);
  el<HTMLInputElement>("riven-bulk-check").checked = false;
  el("riven-modal-optional").classList.remove("hidden");
  el("riven-fixed-row").classList.remove("hidden");
  rivenBulkCount = 0;
  el("riven-bulk-feedback").classList.add("hidden");
  el("riven-modal-backdrop").classList.remove("hidden");
}
function closeRivenModal(): void {
  el("riven-modal-backdrop").classList.add("hidden");
}
el("riven-modal-cancel").addEventListener("click", closeRivenModal);
el("riven-bulk-check").addEventListener("change", (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  el("riven-modal-optional").classList.toggle("hidden", checked);
  el("riven-fixed-row").classList.toggle("hidden", checked);
});
el("riven-weapon-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && el<HTMLInputElement>("riven-bulk-check").checked) {
    e.preventDefault();
    el("riven-modal-save").click();
  }
});
el("riven-modal-save").addEventListener("click", () => {
  const weaponName = el<HTMLInputElement>("riven-weapon-input").value.trim();
  if (!weaponName) {
    showToast(t().enterWeaponName);
    return;
  }
  const bulk = !rivenEditingId && el<HTMLInputElement>("riven-bulk-check").checked;
  if (bulk) {
    void upsertRiven({
      id: uid("riven"),
      weaponName,
      positiveStats: [],
      positiveValues: [],
      negativeStat: "",
      negativeValue: 0,
      fixed: false,
      favorite: false,
      note: "",
    });
    rivenBulkCount++;
    const fb = el("riven-bulk-feedback");
    fb.textContent = `${rivenBulkCount}${t().bulkAdded} ${weaponName})`;
    fb.classList.remove("hidden");
    const weaponInput = el<HTMLInputElement>("riven-weapon-input");
    weaponInput.value = "";
    weaponInput.focus();
    return;
  }
  const entry: RivenEntry = {
    id: rivenEditingId || uid("riven"),
    weaponName,
    positiveStats: selectedRivenPositiveStats(),
    positiveValues: selectedRivenPositiveValues(),
    negativeStat: el<HTMLSelectElement>("riven-negative-select").value,
    // The box only ever holds a plain positive magnitude now (no manual "-"
    // typing, 2026-08-26) — negate it here so formatRivenStat's sign logic
    // still displays it correctly as a malus.
    negativeValue: -(parseFloat(el<HTMLInputElement>("riven-negative-value").value) || 0),
    // "fixed" went entirely unwired from the UI since day one — new entries
    // were always created with it hardcoded false (2026-08-22 finding, added the checkbox).
    fixed: el<HTMLInputElement>("riven-fixed-check").checked,
    // Favorite toggles directly via the card's star button (data-toggle-fav)
    // instead, same as Loadouts Items — removed from the modal (2026-08-22).
    // Editing preserves the existing value; new entries default false.
    favorite: rivenEditingId ? state.data.rivens[rivenEditingId]!.favorite : false,
    note: el<HTMLTextAreaElement>("riven-note-input").value.trim(),
  };
  void upsertRiven(entry);
  closeRivenModal();
});

async function upsertRiven(entry: RivenEntry): Promise<void> {
  await fetch("/api/collections/rivens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  await loadAll();
}
async function deleteRiven(id: string): Promise<void> {
  await fetch(`/api/collections/rivens/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAll();
}

function renderRivenList(): void {
  const container = el("riven-list");
  const entries = Object.values(state.data.rivens).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.weaponName.localeCompare(b.weaponName));

  if (!entries.length) {
    container.innerHTML = `<div class="empty">${t().emptyRegistry}</div>`;
    return;
  }
  container.innerHTML = entries
    .map(
      (entry) => `
    <div class="card-v2" data-open-riven="${entry.id}">
      <div class="card-head">
        ${starBtn(entry.favorite, `data-toggle-fav="${entry.id}"`)}
        <div class="card-title">${escapeHtml(entry.weaponName)}</div>
        <div class="card-badges">
          <span class="status-icon ${entry.fixed ? "on" : "off"}" title="${entry.fixed ? t().fixedTitle : t().rerollingTitle}">${icon("check", { size: 14 })}</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-copy-riven="${entry.id}" title="${t().copyAsText}">${icon("copy")}</button>
          <button class="icon-btn danger" data-del-riven="${entry.id}" title="${t().delete}">${icon("trash-2")}</button>
        </div>
      </div>
      ${(entry.positiveStats || [])
        .map((s, i) => formatRivenStat(s, (entry.positiveValues || [])[i], ja))
        // The label sits on line 1 only, but every line's value must start at
        // the same x position — an invisible copy of the label (same text/
        // weight/font, just hidden) reserves that exact width on lines 2+
        // instead of guessing a padding value (2026-08-26 のっち's feedback).
        .map((line, i) => `<div class="card-row" style="display:flex;gap:4px;"><b${i === 0 ? "" : ` style="visibility:hidden;"`}>${t().positiveLabel}</b><span>${line}</span></div>`)
        .join("")}
      ${entry.negativeStat ? `<div class="card-row"><b>${t().negativeLabel}</b> ${formatRivenStat(entry.negativeStat, entry.negativeValue, ja)}</div>` : ""}
      ${entry.note ? `<div class="card-memo" id="notemd-riven-${entry.id}"></div>` : ""}
    </div>
  `,
    )
    .join("");

  entries.forEach((entry) => {
    if (!entry.note) return;
    const holder = maybeEl(`notemd-riven-${entry.id}`);
    if (holder) renderNoteMd(holder, entry.note, (newNote) => void upsertRiven({ ...entry, note: newNote }));
  });
  wireCopyButtons(container, "[data-copy-riven]", (btn) => buildRivenExportText(state.data.rivens[btn.dataset.copyRiven!]!, ja));

  container.querySelectorAll<HTMLElement>("[data-open-riven]").forEach((card) =>
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-toggle-fav]") || (e.target as HTMLElement).closest("[data-del-riven]")) return;
      openRivenModal(card.dataset.openRiven!);
    }),
  );
  container.querySelectorAll<HTMLElement>("[data-del-riven]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delRiven!;
      if (await confirmInline(btn, deleteConfirmMsg(state.data.rivens[id]!.weaponName))) void deleteRiven(id);
    }),
  );
  container.querySelectorAll<HTMLElement>("[data-toggle-fav]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite("riven", btn.dataset.toggleFav!);
    }),
  );
}

// ---------- Kuva/Tenet/Coda: grouped by weapon name ----------
async function upsertKuva(entry: KuvaEntry): Promise<void> {
  await fetch("/api/collections/kuva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  await loadAll();
}
async function deleteKuva(id: string): Promise<void> {
  await fetch(`/api/collections/kuva/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAll();
}

function groupedKuva(): Record<string, KuvaEntry[]> {
  const groups: Record<string, KuvaEntry[]> = {};
  Object.values(state.data.kuva).forEach((entry) => {
    (groups[entry.weaponName] ??= []).push(entry);
  });
  return groups;
}

// Kuva/Tenet/Coda splits into per-kind subsections (2026-08-23, "can Kuva
// get subsections like this?" request). A kind with no registrations gets no heading.
function kuvaGroupCardHtml(name: string, entries: KuvaEntry[]): string {
  const anyFav = entries.some((e) => e.favorite);
  const anyOwned = entries.some((e) => e.owned);
  return `
    <div class="card-v2" data-open-kuva-group="${escapeHtml(name)}">
      <div class="card-head">
        ${starBtn(anyFav, `data-open-kuva-group-nav="${escapeHtml(name)}"`)}
        <div class="card-title">${escapeHtml(name)}</div>
        <div class="card-badges">
          <span class="badge badge-count">${entries.length}${t().countUnit}</span>
          <span class="status-icon ${anyOwned ? "on" : "off"}" title="${anyOwned ? t().ownedTitle : t().notOwnedTitle}">${icon("check", { size: 14 })}</span>
        </div>
      </div>
    </div>`;
}

function renderKuvaGroupedList(): void {
  const container = el("kuva-list");
  const groups = groupedKuva();
  const names = Object.keys(groups).sort((a, b) => {
    const favA = groups[a]!.some((e) => e.favorite);
    const favB = groups[b]!.some((e) => e.favorite);
    return Number(favB) - Number(favA) || a.localeCompare(b);
  });
  const byKind: Record<string, string[]> = { Kuva: [], Tenet: [], Coda: [] };
  names.forEach((name) => {
    const kind = groups[name]![0]!.kind || "Kuva";
    (byKind[kind] ??= []).push(name);
  });

  if (!names.length) {
    container.innerHTML = `<div class="empty">${t().emptyRegistry}</div>`;
  } else {
    container.innerHTML = (["Kuva", "Tenet", "Coda"] as const)
      .map((kind) => {
        const kindNames = byKind[kind] || [];
        if (!kindNames.length) return "";
        const cards = kindNames.map((name) => kuvaGroupCardHtml(name, groups[name]!)).join("");
        return `<div class="kind-group-title">${kind}</div><div class="kuva-grid">${cards}</div>`;
      })
      .join("");
  }

  container.querySelectorAll<HTMLElement>("[data-open-kuva-group]").forEach((card) =>
    card.addEventListener("click", () => {
      openKuvaModal(card.dataset.openKuvaGroup!);
    }),
  );
}

let kuvaModalState: { weaponName: string; formOpen: boolean; editingId: string | null } = {
  weaponName: "",
  formOpen: false,
  editingId: null,
};

function openKuvaModal(weaponName: string): void {
  kuvaModalState = { weaponName: weaponName || "", formOpen: !weaponName, editingId: null };
  renderKuvaModal();
  el("kuva-modal-backdrop").classList.remove("hidden");
}
function closeKuvaModal(): void {
  el("kuva-modal-backdrop").classList.add("hidden");
}
el("kuva-modal-close").addEventListener("click", closeKuvaModal);
el("kuva-form-cancel").addEventListener("click", () => {
  kuvaModalState.formOpen = false;
  kuvaModalState.editingId = null;
  renderKuvaModal();
});

function renderKuvaModal(): void {
  const { weaponName, formOpen, editingId } = kuvaModalState;
  const isNewWeapon = !weaponName;
  el("kuva-modal-title").innerHTML = isNewWeapon ? t().kuvaNewTitle : escapeHtml(weaponName);

  const nameFieldEl = el("kuva-modal-name-field");
  if (isNewWeapon) {
    nameFieldEl.innerHTML = `
      <label class="field-label">${t().weaponNameLabel}</label>
      <div class="combobox">
        <input type="text" id="kuva-weapon-input" placeholder="${t().kuvaWeaponPlaceholder}" autocomplete="off">
        <div id="kuva-weapon-suggest" class="suggest-list hidden"></div>
      </div>`;
    setupWeaponCombobox("kuva-weapon-input", "kuva-weapon-suggest");
    el<HTMLInputElement>("kuva-weapon-input").addEventListener("blur", (e) => {
      const name = (e.target as HTMLInputElement).value.trim();
      const kindSel = el<HTMLSelectElement>("kuva-kind-select");
      for (const kind of ["Kuva", "Tenet", "Coda"]) {
        if (name.startsWith(kind + " ")) {
          kindSel.value = kind;
          break;
        }
      }
    });
  } else {
    nameFieldEl.innerHTML = "";
  }

  const entries = isNewWeapon ? [] : groupedKuva()[weaponName] || [];
  const entriesEl = el("kuva-modal-entries");
  entriesEl.innerHTML =
    entries
      .map(
        (entry) => `
    <div class="group-entry" data-kuva-entry="${entry.id}">
      <div class="group-entry-head">
        ${starBtn(entry.favorite, `data-toggle-fav="${entry.id}"`)}
        <span class="status-icon ${entry.owned ? "on" : "off"}" title="${entry.owned ? t().ownedTitle : t().notOwnedTitle}">${icon("check", { size: 14 })}</span>
        <span style="flex:1"></span>
        <button class="icon-btn" data-copy-kuva="${entry.id}" title="${t().copyAsText}">${icon("copy")}</button>
        <button class="icon-btn" data-edit-kuva="${entry.id}" title="${t().edit}">${icon("pencil")}</button>
        <button class="icon-btn danger" data-del-kuva="${entry.id}" title="${t().delete}">${icon("trash-2")}</button>
      </div>
      ${entry.bonusStat ? `<div class="card-row"><b>${t().bonusStatLabel}</b> ${formatRivenStat(entry.bonusStat, entry.bonusValue, ja)}</div>` : ""}
      ${entry.note ? `<div class="card-memo" id="notemd-kuva-${entry.id}"></div>` : ""}
    </div>
  `,
      )
      .join("") || (isNewWeapon ? "" : `<div class="empty" style="margin-bottom:8px;">${t().noEntryForWeapon}</div>`);

  entriesEl.querySelectorAll<HTMLElement>("[data-toggle-fav]").forEach((b) => b.addEventListener("click", () => toggleFavorite("kuva", b.dataset.toggleFav!)));
  entriesEl.querySelectorAll<HTMLElement>("[data-del-kuva]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (await confirmInline(b, t().deleteIndividualConfirm)) {
        await deleteKuva(b.dataset.delKuva!);
        const stillExists = groupedKuva()[weaponName];
        if (stillExists && stillExists.length) renderKuvaModal();
        else closeKuvaModal();
      }
    }),
  );
  entriesEl.querySelectorAll<HTMLElement>("[data-edit-kuva]").forEach((b) =>
    b.addEventListener("click", () => {
      kuvaModalState.editingId = b.dataset.editKuva!;
      kuvaModalState.formOpen = true;
      renderKuvaModal();
    }),
  );
  entries.forEach((entry) => {
    if (!entry.note) return;
    const holder = maybeEl(`notemd-kuva-${entry.id}`);
    if (holder) renderNoteMd(holder, entry.note, (newNote) => void upsertKuva({ ...entry, note: newNote }));
  });
  wireCopyButtons(entriesEl, "[data-copy-kuva]", (btn) => buildKuvaExportText(state.data.kuva[btn.dataset.copyKuva!]!));

  const addToggleBtn = el("kuva-modal-add-toggle");
  const addToggleLabel = entries.length ? t().addAnother : t().register;
  addToggleBtn.innerHTML = iconLabel("plus", addToggleLabel);
  addToggleBtn.title = addToggleLabel;
  addToggleBtn.classList.toggle("hidden", isNewWeapon || formOpen);

  const formEl = el("kuva-modal-form");
  formEl.classList.toggle("hidden", !formOpen);
  el("kuva-owned-check-wrap").classList.toggle("hidden", !formOpen);
  if (formOpen) {
    const editingEntry = editingId ? state.data.kuva[editingId] : null;
    el<HTMLSelectElement>("kuva-kind-select").value = editingEntry ? editingEntry.kind || "Kuva" : "Kuva";
    el<HTMLInputElement>("kuva-owned-check").checked = editingEntry ? !!editingEntry.owned : false;
    el<HTMLSelectElement>("kuva-bonus-stat-select").value = editingEntry ? editingEntry.bonusStat || "" : "";
    el<HTMLInputElement>("kuva-bonus-value-input").value = editingEntry && editingEntry.bonusValue ? String(editingEntry.bonusValue) : "";
    syncGatedValueInput("kuva-bonus-stat-select", "kuva-bonus-value-input");
    el<HTMLTextAreaElement>("kuva-note-input").value = editingEntry ? editingEntry.note || "" : "";
  }
}

el("kuva-modal-add-toggle").addEventListener("click", () => {
  kuvaModalState.formOpen = true;
  kuvaModalState.editingId = null;
  renderKuvaModal();
});

el("kuva-form-save").addEventListener("click", () => {
  const weaponName = kuvaModalState.weaponName || el<HTMLInputElement>("kuva-weapon-input").value.trim();
  if (!weaponName) {
    showToast(t().enterWeaponName);
    return;
  }
  const isNewEntry = !kuvaModalState.editingId;
  const entry: KuvaEntry = {
    id: kuvaModalState.editingId || uid("kuva"),
    weaponName,
    kind: el<HTMLSelectElement>("kuva-kind-select").value as KuvaEntry["kind"],
    owned: el<HTMLInputElement>("kuva-owned-check").checked,
    bonusStat: el<HTMLSelectElement>("kuva-bonus-stat-select").value,
    bonusValue: parseFloat(el<HTMLInputElement>("kuva-bonus-value-input").value) || 0,
    // Favorite toggles via each entry row's star button (data-toggle-fav)
    // instead, same as Riven (2026-08-23) — removed from the modal. Editing
    // preserves the existing value.
    favorite: kuvaModalState.editingId ? state.data.kuva[kuvaModalState.editingId]!.favorite : false,
    note: el<HTMLTextAreaElement>("kuva-note-input").value.trim(),
  };
  void upsertKuva(entry).then(() => {
    // Right after registering the first entry for a weapon, don't jump
    // straight to the "list" view — close the modal back to the grid
    // instead (switching UI mid-registration is confusing, 2026-08-23
    // feedback). Only "add another" flow or a name collision landing on a
    // 2nd+ entry switches to the list view as before.
    const nowCount = (groupedKuva()[weaponName] || []).length;
    if (isNewEntry && nowCount === 1) {
      closeKuvaModal();
      return;
    }
    kuvaModalState = { weaponName, formOpen: false, editingId: null };
    renderKuvaModal();
  });
});

// Keyword-filter combobox (self-rolled, same idea as Loadouts). names is
// parameterized so it can be reused for Frame name lists etc. too (defaults
// to state.weaponNames when omitted, matching existing call sites).
function setupWeaponCombobox(inputId: string, suggestId: string, names?: string[]): void {
  const input = el<HTMLInputElement>(inputId);
  const suggest = el(suggestId);
  function hide(): void {
    suggest.classList.add("hidden");
  }
  function update(): void {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      hide();
      return;
    }
    const pool = names || state.weaponNames;
    const matches = pool.filter((n) => n.toLowerCase().includes(q)).slice(0, 30);
    suggest.innerHTML = matches.length
      ? matches.map((n) => `<div class="suggest-item">${escapeHtml(n)}</div>`).join("")
      : `<div class="suggest-empty">${t().noMatchFreeform}</div>`;
    suggest.querySelectorAll<HTMLElement>(".suggest-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = item.textContent || "";
        hide();
        input.dispatchEvent(new Event("input"));
        input.dispatchEvent(new Event("blur"));
      });
    });
    suggest.classList.remove("hidden");
  }
  input.addEventListener("input", update);
  input.addEventListener("focus", update);
  input.addEventListener("blur", () => setTimeout(hide, 150));
}
setupWeaponCombobox("riven-weapon-input", "riven-weapon-suggest");

// ---------- Frame acquisition status ----------
async function upsertFrame(entry: FrameEntry): Promise<void> {
  await fetch("/api/collections/frames", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  await loadAll();
}
async function deleteFrame(id: string): Promise<void> {
  await fetch(`/api/collections/frames/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAll();
}

function renderFrameList(): void {
  const container = el("frame-list");
  const entries = Object.values(state.data.frames).sort((a, b) => a.name.localeCompare(b.name));

  if (!entries.length) {
    container.innerHTML = `<div class="empty">${t().emptyRegistry}</div>`;
    return;
  }
  container.innerHTML = entries
    .map(
      (entry) => `
    <div class="card-v2" data-open-frame="${entry.id}">
      <div class="card-head">
        <div class="card-title">${escapeHtml(entry.name)}</div>
        <div class="card-badges">
          <span class="status-icon ${entry.owned ? "on" : "off"}" title="${entry.owned ? t().acquiredTitle : t().notAcquiredTitle}">${icon("check", { size: 14 })}</span>
          <span class="status-icon ${entry.rankedThirty ? "on" : "off"}" title="${entry.rankedThirty ? t().rank30Title : t().notRank30Title}">${icon("zap", { size: 14 })}</span>
          <span class="status-icon ${entry.helminthFed ? "on" : "off"}" title="${entry.helminthFed ? t().helminthTitle : t().notHelminthTitle}">${icon("archive", { size: 14 })}</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-copy-frame="${entry.id}" title="${t().copyAsText}">${icon("copy")}</button>
          <button class="icon-btn danger" data-del-frame="${entry.id}" title="${t().delete}">${icon("trash-2")}</button>
        </div>
      </div>
      ${entry.chainViewNodeId ? `<div id="minigraph-frame-${entry.id}"></div>` : ""}
      ${entry.chainViewNodeId ? `<div class="card-row">${chainViewLinkBadge(entry.chainViewNodeId)}</div>` : ""}
      ${entry.note ? `<div class="card-memo" id="notemd-frame-${entry.id}"></div>` : ""}
    </div>
  `,
    )
    .join("");

  entries.forEach((entry) => {
    if (!entry.note) return;
    const holder = maybeEl(`notemd-frame-${entry.id}`);
    if (holder) renderNoteMd(holder, entry.note, (newNote) => void upsertFrame({ ...entry, note: newNote }));
  });
  wireCopyButtons(container, "[data-copy-frame]", (btn) => buildFrameEntryExportText(state.data.frames[btn.dataset.copyFrame!]!));

  container.querySelectorAll<HTMLElement>("[data-open-frame]").forEach((card) =>
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-del-frame]")) return;
      openFrameModal(card.dataset.openFrame!);
    }),
  );
  container.querySelectorAll<HTMLElement>("[data-del-frame]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delFrame!;
      if (await confirmInline(btn, deleteConfirmMsg(state.data.frames[id]!.name))) void deleteFrame(id);
    }),
  );
  entries.forEach((entry) => {
    if (!entry.chainViewNodeId) return;
    const holder = maybeEl(`minigraph-frame-${entry.id}`);
    if (holder) renderMiniGraph(holder, entry.chainViewNodeId, state.nodesById);
  });
}

let frameEditingId: string | null = null;
let frameBulkCount = 0;
// Frame-specific modal, distinct from the shared openEquipModal used by
// weapon/companion/archwing/necramech (Frame has helminthFed, the others don't).
function openFrameModal(editId: string | null): void {
  frameEditingId = editId || null;
  const entry = editId ? state.data.frames[editId] : null;
  el("frame-modal-title").textContent = entry ? t().frameEditTitle : t().frameNewTitle;
  el<HTMLInputElement>("frame-name-input").value = entry ? entry.name : "";
  el<HTMLInputElement>("frame-owned-check").checked = entry ? !!entry.owned : false;
  el<HTMLInputElement>("frame-ranked30-check").checked = entry ? !!entry.rankedThirty : false;
  el<HTMLInputElement>("frame-helminth-check").checked = entry ? !!entry.helminthFed : false;
  el<HTMLTextAreaElement>("frame-note-input").value = entry ? entry.note || "" : "";
  el<HTMLInputElement>("frame-chainview-check").checked = false;
  el("frame-chainview-row").classList.toggle("hidden", !!entry);
  el("frame-bulk-row").classList.toggle("hidden", !!editId);
  el<HTMLInputElement>("frame-bulk-check").checked = false;
  el("frame-modal-optional").classList.remove("hidden");
  frameBulkCount = 0;
  el("frame-bulk-feedback").classList.add("hidden");
  el("frame-modal-backdrop").classList.remove("hidden");
}
function closeFrameModal(): void {
  el("frame-modal-backdrop").classList.add("hidden");
}
el("frame-modal-cancel").addEventListener("click", closeFrameModal);
el("frame-bulk-check").addEventListener("change", (e) => {
  el("frame-modal-optional").classList.toggle("hidden", (e.target as HTMLInputElement).checked);
});
el("frame-name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && el<HTMLInputElement>("frame-bulk-check").checked) {
    e.preventDefault();
    el("frame-modal-save").click();
  }
});
// A Frame assumes "same name = same individual" (unlike Riven/Kuva, no
// per-individual variance), so duplicate registration is prevented by name.
// Checked only on create, not edit (2026-08-25 item 27 — the base the
// Loadouts/Chain-View-originated forced registration depends on).
function findFrameByName(name: string): FrameEntry | undefined {
  const q = name.trim().toLowerCase();
  return Object.values(state.data.frames || {}).find((f) => f.name.trim().toLowerCase() === q);
}

el("frame-modal-save").addEventListener("click", () => {
  const name = el<HTMLInputElement>("frame-name-input").value.trim();
  if (!name) {
    showToast(t().enterFrameName);
    return;
  }
  const bulk = !frameEditingId && el<HTMLInputElement>("frame-bulk-check").checked;
  const dup = !frameEditingId ? findFrameByName(name) : null;

  if (dup && bulk) {
    // On a name collision during bulk registration, skip instead of
    // creating a duplicate, and prompt the next input.
    const fb = el("frame-bulk-feedback");
    fb.textContent = `既に登録済みのためスキップ: ${dup.name}`;
    fb.classList.remove("hidden");
    const nameInput = el<HTMLInputElement>("frame-name-input");
    nameInput.value = "";
    nameInput.focus();
    return;
  }
  if (dup && !bulk) {
    // On a name collision during normal registration, don't create a new
    // entry — open the existing card's edit view instead.
    closeFrameModal();
    openFrameModal(dup.id);
    return;
  }

  if (bulk) {
    void upsertFrame({ id: uid("frame"), name, owned: false, rankedThirty: false, helminthFed: false, note: "" });
    frameBulkCount++;
    const fb = el("frame-bulk-feedback");
    fb.textContent = `${frameBulkCount}${t().bulkAdded} ${name})`;
    fb.classList.remove("hidden");
    const nameInput = el<HTMLInputElement>("frame-name-input");
    nameInput.value = "";
    nameInput.focus();
    return;
  }
  const existing = frameEditingId ? state.data.frames[frameEditingId] : null;
  const wantsChainView = !frameEditingId && el<HTMLInputElement>("frame-chainview-check").checked;
  const entry: FrameEntry = {
    id: frameEditingId || uid("frame"),
    name,
    owned: el<HTMLInputElement>("frame-owned-check").checked,
    rankedThirty: el<HTMLInputElement>("frame-ranked30-check").checked,
    helminthFed: el<HTMLInputElement>("frame-helminth-check").checked,
    note: el<HTMLTextAreaElement>("frame-note-input").value.trim(),
    chainViewNodeId: existing?.chainViewNodeId,
  };
  void upsertFrame(entry);
  closeFrameModal();
  // Chain View連携はLoadoutsと同じく登録時のみのopt-in（後から変更する手段は無い、
  // 2026-08-26）。以前は裏で静かにautoGenerateChainViewNodeを叩くだけ（レリック候補は
  // 選べない）だったが、実際のWFCDウィザードを名前入力済みで開く方式に変更
  // （2026-08-30、のっち依頼——「レリックも登録できるように」）。
  if (wantsChainView) {
    location.href = `/?wfcd-generate=Frame&wfcd-name=${encodeURIComponent(name)}&link-back=collections-frames:${encodeURIComponent(entry.id)}`;
  }
});

// ---------- Weapon/Companion/Archwing/Necramech (FrameEntry-shaped, no helminthFed) ----------
// All 4 share the same shape (owned/rankedThirty/note/chainViewNodeId), so
// unlike Frame this is one generic implementation rather than 4 separate
// ones (2026-08-25 item 27). Only the per-kind differences (DOM id prefix,
// API path, reference name list, label text) live in EQUIP_KINDS.
const EQUIP_KINDS: Record<EquipKind, { apiPath: EquipApiPath; label: string; refNamesKey: EquipRefNamesKey }> = {
  weapon: { apiPath: "weapons", label: "武器", refNamesKey: "weaponNames" },
  companion: { apiPath: "companions", label: "コンパニオン", refNamesKey: "companionNames" },
  // Archwing/Necramech are proper nouns and stay as-is in both languages;
  // only weapon/companion have a Japanese label to swap out (equipLabel()).
  archwing: { apiPath: "archwings", label: "Archwing", refNamesKey: "archwingNames" },
  necramech: { apiPath: "necramechs", label: "Necramech", refNamesKey: "necramechNames" },
};
/** EQUIP_KINDS.label in the current display language. Archwing/Necramech
 * are proper nouns shared by both. */
function equipLabel(kind: EquipKind): string {
  if (effective() !== "en") return EQUIP_KINDS[kind].label;
  return kind === "weapon" ? t().weaponLabel : kind === "companion" ? t().companionLabel : EQUIP_KINDS[kind].label;
}

const equipEditingId: Partial<Record<EquipKind, string | null>> = {};
const equipBulkCount: Partial<Record<EquipKind, number>> = {};

function equipBucket(kind: EquipKind): Record<string, EquipEntry> {
  return state.data[EQUIP_KINDS[kind].apiPath] as unknown as Record<string, EquipEntry>;
}

function findEquipByName(kind: EquipKind, name: string): EquipEntry | undefined {
  const q = name.trim().toLowerCase();
  return Object.values(equipBucket(kind) || {}).find((e) => e.name.trim().toLowerCase() === q);
}

async function upsertEquip(kind: EquipKind, entry: EquipEntry): Promise<void> {
  await fetch(`/api/collections/${EQUIP_KINDS[kind].apiPath}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  await loadAll();
}
async function deleteEquip(kind: EquipKind, id: string): Promise<void> {
  await fetch(`/api/collections/${EQUIP_KINDS[kind].apiPath}/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAll();
}

function renderEquipList(kind: EquipKind): void {
  const cfg = EQUIP_KINDS[kind];
  const container = el(`${kind}-list`);
  const entries = Object.values(equipBucket(kind) || {}).sort((a, b) => a.name.localeCompare(b.name));

  if (!entries.length) {
    container.innerHTML = `<div class="empty">${t().emptyRegistry}</div>`;
    return;
  }
  container.innerHTML = entries
    .map(
      (entry) => `
    <div class="card-v2" data-open-id="${entry.id}">
      <div class="card-head">
        <div class="card-title">${escapeHtml(entry.name)}</div>
        <div class="card-badges">
          <span class="status-icon ${entry.owned ? "on" : "off"}" title="${entry.owned ? t().acquiredTitle : t().notAcquiredTitle}">${icon("check", { size: 14 })}</span>
          <span class="status-icon ${entry.rankedThirty ? "on" : "off"}" title="${entry.rankedThirty ? t().rank30Title : t().notRank30Title}">${icon("zap", { size: 14 })}</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-copy-id="${entry.id}" title="${t().copyAsText}">${icon("copy")}</button>
          <button class="icon-btn danger" data-del-id="${entry.id}" title="${t().delete}">${icon("trash-2")}</button>
        </div>
      </div>
      ${entry.chainViewNodeId ? `<div id="minigraph-${kind}-${entry.id}"></div>` : ""}
      ${entry.chainViewNodeId ? `<div class="card-row">${chainViewLinkBadge(entry.chainViewNodeId)}</div>` : ""}
      ${entry.note ? `<div class="card-memo" id="notemd-${kind}-${entry.id}"></div>` : ""}
    </div>
  `,
    )
    .join("");

  entries.forEach((entry) => {
    if (!entry.note) return;
    const holder = maybeEl(`notemd-${kind}-${entry.id}`);
    if (holder) renderNoteMd(holder, entry.note, (newNote) => void upsertEquip(kind, { ...entry, note: newNote }));
  });
  wireCopyButtons(container, "[data-copy-id]", (btn) => buildEquipExportText(cfg.label, equipBucket(kind)[btn.dataset.copyId!]!));

  container.querySelectorAll<HTMLElement>("[data-open-id]").forEach((card) =>
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-del-id]")) return;
      openEquipModal(kind, card.dataset.openId!);
    }),
  );
  container.querySelectorAll<HTMLElement>("[data-del-id]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delId!;
      if (await confirmInline(btn, deleteConfirmMsg(equipBucket(kind)[id]!.name))) void deleteEquip(kind, id);
    }),
  );
  entries.forEach((entry) => {
    if (!entry.chainViewNodeId) return;
    const holder = maybeEl(`minigraph-${kind}-${entry.id}`);
    if (holder) renderMiniGraph(holder, entry.chainViewNodeId, state.nodesById);
  });
}

function openEquipModal(kind: EquipKind, editId: string | null): void {
  equipEditingId[kind] = editId || null;
  const entry = editId ? equipBucket(kind)[editId] : null;
  el(`${kind}-modal-title`).textContent = `${equipLabel(kind)} ${entry ? t().editSuffix : t().newSuffix}`;
  el<HTMLInputElement>(`${kind}-name-input`).value = entry ? entry.name : "";
  el<HTMLInputElement>(`${kind}-owned-check`).checked = entry ? !!entry.owned : false;
  el<HTMLInputElement>(`${kind}-ranked30-check`).checked = entry ? !!entry.rankedThirty : false;
  el<HTMLTextAreaElement>(`${kind}-note-input`).value = entry ? entry.note || "" : "";
  el<HTMLInputElement>(`${kind}-chainview-check`).checked = false;
  el(`${kind}-chainview-row`).classList.toggle("hidden", !!entry);
  el(`${kind}-bulk-row`).classList.toggle("hidden", !!editId);
  el<HTMLInputElement>(`${kind}-bulk-check`).checked = false;
  el(`${kind}-modal-optional`).classList.remove("hidden");
  equipBulkCount[kind] = 0;
  el(`${kind}-bulk-feedback`).classList.add("hidden");
  el(`${kind}-modal-backdrop`).classList.remove("hidden");
}
function closeEquipModal(kind: EquipKind): void {
  el(`${kind}-modal-backdrop`).classList.add("hidden");
}

function equipSave(kind: EquipKind): void {
  const name = el<HTMLInputElement>(`${kind}-name-input`).value.trim();
  if (!name) {
    showToast(`${equipLabel(kind)}${t().enterNameSuffix}`);
    return;
  }
  const editingId = equipEditingId[kind] ?? null;
  const bulk = !editingId && el<HTMLInputElement>(`${kind}-bulk-check`).checked;
  const dup = !editingId ? findEquipByName(kind, name) : null;

  if (dup && bulk) {
    const fb = el(`${kind}-bulk-feedback`);
    fb.textContent = `既に登録済みのためスキップ: ${dup.name}`;
    fb.classList.remove("hidden");
    const nameInput = el<HTMLInputElement>(`${kind}-name-input`);
    nameInput.value = "";
    nameInput.focus();
    return;
  }
  if (dup && !bulk) {
    closeEquipModal(kind);
    openEquipModal(kind, dup.id);
    return;
  }

  if (bulk) {
    void upsertEquip(kind, { id: uid(kind), name, owned: false, rankedThirty: false, note: "" });
    equipBulkCount[kind] = (equipBulkCount[kind] || 0) + 1;
    const fb = el(`${kind}-bulk-feedback`);
    fb.textContent = `${equipBulkCount[kind]}${t().bulkAdded} ${name})`;
    fb.classList.remove("hidden");
    const nameInput = el<HTMLInputElement>(`${kind}-name-input`);
    nameInput.value = "";
    nameInput.focus();
    return;
  }
  const existing = editingId ? equipBucket(kind)[editingId] : null;
  const wantsChainView = !editingId && el<HTMLInputElement>(`${kind}-chainview-check`).checked;
  const entry: EquipEntry = {
    id: editingId || uid(kind),
    name,
    owned: el<HTMLInputElement>(`${kind}-owned-check`).checked,
    rankedThirty: el<HTMLInputElement>(`${kind}-ranked30-check`).checked,
    note: el<HTMLTextAreaElement>(`${kind}-note-input`).value.trim(),
    chainViewNodeId: existing?.chainViewNodeId,
  };
  void upsertEquip(kind, entry);
  closeEquipModal(kind);
  // Weapon: opens the real WFCD wizard pre-filled, same as Loadouts/Frame
  // (2026-08-30 — was a silent autoGenerateChainViewNode call with no relic
  // picking). Companion/Archwing/Necramech: Chain View has no node type for
  // these, so they still just get one empty Goal node (2026-08-26, unchanged).
  if (wantsChainView) {
    if (kind === "weapon") {
      location.href = `/?wfcd-generate=Weapon&wfcd-name=${encodeURIComponent(name)}&link-back=collections-weapons:${encodeURIComponent(entry.id)}`;
    } else {
      void createSimpleGoalNode(name).then((chainViewNodeId) => {
        if (chainViewNodeId) void upsertEquip(kind, { ...entry, chainViewNodeId });
      });
    }
  }
}

(Object.keys(EQUIP_KINDS) as EquipKind[]).forEach((kind) => {
  el(`${kind}-add-btn`).innerHTML = icon("plus");
  el(`${kind}-add-btn`).addEventListener("click", () => openEquipModal(kind, null));
  el(`${kind}-legend-owned`).innerHTML = icon("check", { size: 14 });
  el(`${kind}-legend-rank30`).innerHTML = icon("zap", { size: 14 });
  el(`${kind}-note-help`).innerHTML = icon("circle-alert", { size: 13 });
  el(`${kind}-modal-cancel`).addEventListener("click", () => closeEquipModal(kind));
  el(`${kind}-bulk-check`).addEventListener("change", (e) => {
    el(`${kind}-modal-optional`).classList.toggle("hidden", (e.target as HTMLInputElement).checked);
  });
  el(`${kind}-name-input`).addEventListener("keydown", (e) => {
    if (e.key === "Enter" && el<HTMLInputElement>(`${kind}-bulk-check`).checked) {
      e.preventDefault();
      el(`${kind}-modal-save`).click();
    }
  });
  el(`${kind}-modal-save`).addEventListener("click", () => equipSave(kind));
});

// ---------- Duviri Incarnon ----------
// Register-only, per-weapon (same as Riven/Kuva/Frame, 2026-08-22
// re-re-correction). An earlier attempt at aggregating "Duviri-proper clear"
// was abandoned — neither WFCD source (items tags / drop-data reward
// tables) lists Circuit-eligible Incarnon weapons, so there's no
// denominator to aggregate against; manual per-weapon registration only.
// "obtained" (adapter acquired) and "completed" (evolution challenges
// finished) are independent axes.
async function upsertIncarnon(entry: IncarnonEntry): Promise<void> {
  await fetch("/api/collections/incarnons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  await loadAll();
}
async function deleteIncarnon(id: string): Promise<void> {
  await fetch(`/api/collections/incarnons/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAll();
}

function renderIncarnonList(): void {
  const container = el("incarnon-list");
  const entries = Object.values(state.data.incarnons).sort((a, b) => a.weaponName.localeCompare(b.weaponName));

  if (!entries.length) {
    container.innerHTML = `<div class="empty">${t().emptyRegistry}</div>`;
    return;
  }
  container.innerHTML = entries
    .map(
      (entry) => `
    <div class="card-v2" data-open-incarnon="${entry.id}">
      <div class="card-head">
        <div class="card-title">${escapeHtml(entry.weaponName)}</div>
        <div class="card-badges">
          <span class="status-icon ${entry.obtained ? "on" : "off"}" title="${entry.obtained ? t().obtainedTitle : t().notObtainedTitle}">${icon("check", { size: 14 })}</span>
          <span class="status-icon ${entry.completed ? "on" : "off"}" title="${entry.completed ? t().incarnonDoneTitle : t().notIncarnonTitle}">${icon("zap", { size: 14 })}</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-copy-incarnon="${entry.id}" title="${t().copyAsText}">${icon("copy")}</button>
          <button class="icon-btn danger" data-del-incarnon="${entry.id}" title="${t().delete}">${icon("trash-2")}</button>
        </div>
      </div>
      ${entry.chainViewNodeId ? `<div id="minigraph-incarnon-${entry.id}"></div>` : ""}
      ${entry.chainViewNodeId ? `<div class="card-row">${chainViewLinkBadge(entry.chainViewNodeId)}</div>` : ""}
      ${entry.note ? `<div class="card-memo" id="notemd-incarnon-${entry.id}"></div>` : ""}
    </div>
  `,
    )
    .join("");

  entries.forEach((entry) => {
    if (!entry.note) return;
    const holder = maybeEl(`notemd-incarnon-${entry.id}`);
    if (holder) renderNoteMd(holder, entry.note, (newNote) => void upsertIncarnon({ ...entry, note: newNote }));
  });
  wireCopyButtons(container, "[data-copy-incarnon]", (btn) => buildIncarnonExportText(state.data.incarnons[btn.dataset.copyIncarnon!]!));

  container.querySelectorAll<HTMLElement>("[data-open-incarnon]").forEach((card) =>
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-del-incarnon]")) return;
      openIncarnonModal(card.dataset.openIncarnon!);
    }),
  );
  container.querySelectorAll<HTMLElement>("[data-del-incarnon]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delIncarnon!;
      if (await confirmInline(btn, deleteConfirmMsg(state.data.incarnons[id]!.weaponName))) void deleteIncarnon(id);
    }),
  );
  entries.forEach((entry) => {
    if (!entry.chainViewNodeId) return;
    const holder = maybeEl(`minigraph-incarnon-${entry.id}`);
    if (holder) renderMiniGraph(holder, entry.chainViewNodeId, state.nodesById);
  });
}

let incarnonEditingId: string | null = null;
let incarnonBulkCount = 0;
function openIncarnonModal(editId: string | null): void {
  incarnonEditingId = editId || null;
  const entry = editId ? state.data.incarnons[editId] : null;
  el("incarnon-modal-title").textContent = entry ? t().incarnonEditTitle : t().incarnonNewTitle;
  el<HTMLInputElement>("incarnon-weapon-input").value = entry ? entry.weaponName : "";
  el<HTMLInputElement>("incarnon-obtained-check").checked = entry ? !!entry.obtained : false;
  el<HTMLInputElement>("incarnon-completed-check").checked = entry ? !!entry.completed : false;
  el<HTMLTextAreaElement>("incarnon-note-input").value = entry ? entry.note || "" : "";
  el("incarnon-bulk-row").classList.toggle("hidden", !!editId);
  el<HTMLInputElement>("incarnon-bulk-check").checked = false;
  el("incarnon-modal-optional").classList.remove("hidden");
  incarnonBulkCount = 0;
  el("incarnon-bulk-feedback").classList.add("hidden");
  el("incarnon-modal-backdrop").classList.remove("hidden");
}
function closeIncarnonModal(): void {
  el("incarnon-modal-backdrop").classList.add("hidden");
}
el("incarnon-modal-cancel").addEventListener("click", closeIncarnonModal);
el("incarnon-bulk-check").addEventListener("change", (e) => {
  el("incarnon-modal-optional").classList.toggle("hidden", (e.target as HTMLInputElement).checked);
});
el("incarnon-weapon-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && el<HTMLInputElement>("incarnon-bulk-check").checked) {
    e.preventDefault();
    el("incarnon-modal-save").click();
  }
});
el("incarnon-modal-save").addEventListener("click", () => {
  const weaponName = el<HTMLInputElement>("incarnon-weapon-input").value.trim();
  if (!weaponName) {
    showToast(t().enterWeaponName);
    return;
  }
  const bulk = !incarnonEditingId && el<HTMLInputElement>("incarnon-bulk-check").checked;
  if (bulk) {
    void upsertIncarnon({ id: uid("incarnon"), weaponName, obtained: false, completed: false, note: "" });
    incarnonBulkCount++;
    const fb = el("incarnon-bulk-feedback");
    fb.textContent = `${incarnonBulkCount}${t().bulkAdded} ${weaponName})`;
    fb.classList.remove("hidden");
    const weaponInput = el<HTMLInputElement>("incarnon-weapon-input");
    weaponInput.value = "";
    weaponInput.focus();
    return;
  }
  const entry: IncarnonEntry = {
    id: incarnonEditingId || uid("incarnon"),
    weaponName,
    obtained: el<HTMLInputElement>("incarnon-obtained-check").checked,
    completed: el<HTMLInputElement>("incarnon-completed-check").checked,
    note: el<HTMLTextAreaElement>("incarnon-note-input").value.trim(),
  };
  void upsertIncarnon(entry);
  closeIncarnonModal();
});
setupWeaponCombobox("incarnon-weapon-input", "incarnon-weapon-suggest");

renderRivenPositivePopover();
updateRivenPositiveBtnLabel();
Promise.all([
  loadChainViewNodes(),
  loadWeaponNames(),
  loadFrameNames(),
  loadCompanionNames(),
  loadArchwingNames(),
  loadNecramechNames(),
  loadRivenStatChoices(),
  loadGlossary(),
  loadDuviriGate(),
]).then(() => {
  // Once loadRivenStatChoices() resolves, state.rivenStatChoices is final —
  // re-render the popover that was already drawn empty (2026-08-20 finding:
  // this re-render was previously missing, so the positive-stat checkboxes
  // always rendered empty). Waiting on loadGlossary() here too means the
  // popover's ja() labels reflect glossary's latest translations as well.
  renderRivenPositivePopover();
  renderRivenNegativeSelect();
  setupWeaponCombobox("frame-name-input", "frame-name-suggest", state.frameNames);
  (Object.keys(EQUIP_KINDS) as EquipKind[]).forEach((kind) => {
    setupWeaponCombobox(`${kind}-name-input`, `${kind}-name-suggest`, state[EQUIP_KINDS[kind].refNamesKey] || []);
    initPlainCollapsible(kind);
  });
  initIncarnonCollapse();
  initPlainCollapsible("frame");
  initPlainCollapsible("riven");
  initPlainCollapsible("kuva");
  void loadAll();
});

applyI18nText(STRINGS);
onLocaleChange(() => {
  applyI18nText(STRINGS);
  // The popovers/selects built from the stat dictionary re-render through
  // ja(), which now follows the locale too.
  renderRivenPositivePopover();
  renderRivenNegativeSelect();
  render();
  // The spoiler-gated Incarnon heading is written once by
  // initIncarnonCollapse() and has no data-i18n attribute (its text depends
  // on the gate, not just the locale), so re-apply it here — otherwise it
  // stays in the old language after a switch (found live 2026-08-30).
  const incarnonTitle = maybeEl("incarnon-title");
  if (incarnonTitle) incarnonTitle.textContent = state.duviriCleared ? t().duviriRevealed : t().lockedSection;
});
