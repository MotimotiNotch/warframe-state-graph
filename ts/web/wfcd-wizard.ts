// Port of web/wfcd-wizard.js. WFCD auto-generation import wizard.
//
// Backend (/api/wfcd/generate, /api/wfcd/import — server/wfcdgen.ts/wfcd.ts)
// is fully wired on the TS server; /api/wfcd/generate is hard-restricted to
// nodeType Frame|Weapon|Quest server-side (main.ts) — Companion/Archwing/
// Necramech deliberately don't get a Chain View node at all, only a
// Collections entry (see loadouts.ts's add-item-btn handler comment).

import type { Node } from "../server/model.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { questEn, questJa } from "./quest-i18n.ts";
import { itemJa } from "./item-i18n.ts";
import { locationJa } from "./location-i18n.ts";
import { loadGraph, loadReport, state } from "./graph-state.ts";
import { forcePushToCollections, forcePushToLoadoutItem } from "./wfcd-autolink.ts";
import { nodeTypeLabel } from "./node-modal.ts";
import { showToast } from "./toast.ts";
import { effective } from "./locale.ts";

interface WizardStrings {
  companionNote: string;
  refDataFailedLog: string;
  noMatchFreeform: string;
  enterName: string;
  fetching: string;
  notFound: string;
  pickOneSource: string;
  vaultedSuffix: string;
  resurgenceSuffix: (date: string) => string;
  relicOption: (name: string, flags: string) => string;
  missionOption: (name: string, chance: number) => string;
  sourceLabel: string;
  notSelected: string;
  noSourceData: string;
  syndicateRankNote: (name: string, standing: string) => string;
  questChainTitle: string;
  noQuestChain: string;
  attachToBuild: (name: string) => string;
  noCurrentBuild: string;
  alsoAddToLoadouts: string;
  paradigmLabel: string;
  richLichLabel: string;
  archetypeLabel: string;
  rootNodeLabel: string;
  checking: string;
  resurgenceNote: (date: string) => string;
  vaultedStatus: (note: string) => string;
  droppingStatus: (count: number, note: string) => string;
  sourceNote: (name: string) => string;
  addedLinked: (name: string) => string;
  addedToBuild: (name: string) => string;
  addedAsGoal: (name: string) => string;
}

const STRINGS: Record<"ja" | "en", WizardStrings> = {
  ja: {
    companionNote: "Companion/Archwing/Necramechはこの一覧にありません（Chain Viewのノードを持たない仕様）。",
    refDataFailedLog: "WFCD参照データの取得に失敗（自由入力は引き続き可能）",
    noMatchFreeform: "一致なし（このまま自由入力できます）",
    enterName: "名前を入力して",
    fetching: "取得中…",
    notFound: "見つかりませんでした（WFCD側の名前と完全一致している必要があります）",
    pickOneSource: "入手先は1つ選択（OR関係なのでどれか1つでよい。レリックとは限らず通常ミッションのドロップも含む）",
    vaultedSuffix: "・Vault済み",
    resurgenceSuffix: (date) => `・Resurgence在庫あり(〜${date})`,
    relicOption: (name, flags) => `${name}（レリック${flags}）`,
    missionOption: (name, chance) => `${name}（${chance}%・通常ミッション）`,
    sourceLabel: "入手先",
    notSelected: "（未選択）",
    noSourceData: "WFCD側にこのパーツの入手先データなし（既定素材として通常のミッション/敵ドロップで入手する想定）",
    syndicateRankNote: (name, standing) => `シンジケートランクを前提条件として追加: <b>${name}</b>（購入コスト ${standing} standing）`,
    questChainTitle: "前提クエストチェーン（Wiki要約ベース、精度は目視要確認）",
    noQuestChain: "本表に前提クエストの登録なし（単体で追加されます）",
    attachToBuild: (name) =>
      `現在の目標「<b>${name}</b>」の中身（contains）に追加する（チェックを入れない場合は種別がGoalになり、単独の探索起点として左サイドバーの一覧から辿れます）`,
    noCurrentBuild: "現在選択中のBuildがないため、このまま追加すると種別がGoalになり、単独の探索起点として左サイドバーの一覧から辿れます",
    alsoAddToLoadouts: "Loadoutsにも追加する（MOD構成の管理対象にする、任意）",
    paradigmLabel: "パラダイム:",
    richLichLabel: "リッチ系:",
    archetypeLabel: "アーキタイプ:",
    rootNodeLabel: "本体ノード:",
    checking: "確認中…",
    resurgenceNote: (date) => `（Resurgence在庫あり〜${date}）`,
    vaultedStatus: (note) => `Vault済み（現在のミッションドロップ対象外）${note}`,
    droppingStatus: (count, note) => `現在${count}ミッションでドロップ中${note}`,
    sourceNote: (name) => `入手先: ${name}`,
    addedLinked: (name) => `「${name}」を追加し、登録元と紐付けました。`,
    addedToBuild: (name) => `「${name}」を追加し、現在の目標の中身（contains）に繋げました。`,
    addedAsGoal: (name) =>
      `「${name}」をGoalとして追加しました。左サイドバーの一覧から単独の探索起点として辿れます。既存の目標の中身（contains）に含めたい場合は、その目標ノードを編集して手動で追加してください。`,
  },
  en: {
    companionNote: "Companion/Archwing/Necramech aren't in this list (by design — they have no Chain View node).",
    refDataFailedLog: "Failed to fetch the WFCD reference data (free entry still works)",
    noMatchFreeform: "No match (you can still type it freely)",
    enterName: "Enter a name",
    fetching: "Fetching…",
    notFound: "Not found (the name has to match WFCD's exactly)",
    pickOneSource: "Pick one source (they're OR-related, so any single one will do — not necessarily a relic, regular mission drops are included too)",
    vaultedSuffix: " · Vaulted",
    resurgenceSuffix: (date) => ` · Resurgence available (until ${date})`,
    relicOption: (name, flags) => `${name} (relic${flags})`,
    missionOption: (name, chance) => `${name} (${chance}% · regular mission)`,
    sourceLabel: "Source",
    notSelected: "(not selected)",
    noSourceData: "WFCD has no source data for this part (assumed to be a standard material from regular mission/enemy drops)",
    syndicateRankNote: (name, standing) => `Adds a syndicate rank as a prerequisite: <b>${name}</b> (costs ${standing} standing)`,
    questChainTitle: "Prerequisite quest chain (based on a wiki summary — accuracy needs a visual check)",
    noQuestChain: "No prerequisite quests registered in this table (it will be added on its own)",
    attachToBuild: (name) =>
      `Add to the current goal "<b>${name}</b>" as contents (leave this unchecked and it becomes a Goal instead — a standalone entry point reachable from the left sidebar list)`,
    noCurrentBuild: "No Build is currently selected, so adding it now makes it a Goal — a standalone entry point reachable from the left sidebar list",
    alsoAddToLoadouts: "Also add to Loadouts (manage its MOD configs there, optional)",
    paradigmLabel: "Paradigm:",
    richLichLabel: "Lich type:",
    archetypeLabel: "Archetype:",
    rootNodeLabel: "Root node:",
    checking: "Checking…",
    resurgenceNote: (date) => ` (Resurgence available until ${date})`,
    vaultedStatus: (note) => `Vaulted (not in the current mission drop tables)${note}`,
    droppingStatus: (count, note) => `Currently dropping in ${count} mission(s)${note}`,
    sourceNote: (name) => `Source: ${name}`,
    addedLinked: (name) => `Added "${name}" and linked it back to where it was registered.`,
    addedToBuild: (name) => `Added "${name}" and attached it to the current goal's contents.`,
    addedAsGoal: (name) =>
      `Added "${name}" as a Goal. It's reachable from the left sidebar list as a standalone entry point. To nest it inside an existing goal's contents, edit that goal node and add it manually.`,
  },
};

function t(): WizardStrings {
  return STRINGS[effective()];
}

// Shape of a /api/wfcd/generate response. Ported ahead of pkg/wfcdgen
// itself (Phase 11) — refine/replace with the real generated type once that
// package is ported; kept local here in the meantime rather than blocking
// on it.
interface RelicCandidate {
  name: string;
  chance: number;
  isRelic: boolean;
  vaulted?: boolean;
  resurgence?: string;
}
interface WfcdPart {
  node: Node;
  relicCandidates?: RelicCandidate[];
}
interface SyndicateRankSuggestion {
  node: Node;
  standing: number;
}
interface WfcdSuggestion {
  paradigm: string;
  richLich?: string;
  archetype?: string;
  root: Node;
  parts?: WfcdPart[];
  syndicateRank?: SyndicateRankSuggestion;
  questChain?: Node[];
}

interface RelicStatusResponse {
  vaulted?: boolean;
  missionCount?: number;
  resurgence?: { available: boolean; expiry: string } | null;
}

let wfcdSuggestion: WfcdSuggestion | null = null;

// Set by initDeepLink() (bottom of this file) when this page was navigated
// to from Loadouts/Collections' "Chain Viewにも追加する" registration
// checkbox (2026-08-30) — tells the import handler which existing
// Loadouts/Collections entry to link the freshly-imported node back onto,
// instead of the normal checkbox-driven/forced-push paths.
let pendingLinkBack: { kind: "loadout-item" | "collections-frames" | "collections-weapons"; id: string } | null = null;

// /api/wfcd/generate's server-side type restriction (main.ts) — the only
// values <select id="wfcd-node-type"> may hold. Labels come from
// NODE_TYPE_LABEL_JA (node-modal.ts's create/edit form) instead of being
// hardcoded a second time in index.html's static markup, so this dropdown
// can't drift back out of sync with the rest of the app's Japanese labels
// (2026-08-27 fix — it had silently stayed on raw English option text
// through the 2026-08-25 item 30 Japanese-labeling pass).
const WFCD_GEN_NODE_TYPES = ["Frame", "Weapon", "Quest"] as const;
el<HTMLSelectElement>("wfcd-node-type").innerHTML = WFCD_GEN_NODE_TYPES.map(
  (type) => `<option value="${type}">${nodeTypeLabel(type)}</option>`,
).join("");

// Companion/Archwing/Necramechの英字表記はweb/loadouts.html/tsの種別
// プルダウン・見出し文言と同じもの（「相棒」等の和訳を独自に当てない——
// のっち指摘、2026-08-28: そのカテゴリの呼称は元々アプリ内で英字のまま
// 統一されている）をそのまま踏襲する。
// 登録先の誘導（Loadoutsの＋アイコンから...）は蛇足と判断し削除（のっち
// 指摘、2026-08-28）——「ここには無い」という事実だけ伝われば足りる。
el("wfcd-note").innerHTML = `${icon("triangle-alert", { size: 13 })}<span>${t().companionNote}</span>`;

// Reference data pool for the name-field keyword filter, swapped per node
// type (Frame/Weapon/Quest) — same pattern as the Loadouts/Collections
// weapon-name combobox (2026-08-23).
const wfcdGenRefData: Record<string, string[]> = { Frame: [], Weapon: [], Quest: [] };
async function loadWfcdGenRefData(): Promise<void> {
  try {
    const [frames, weapons, quests] = await Promise.all([
      fetch("/api/reference/frames").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/weapons").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/quests").then((r) => r.json() as Promise<string[]>),
    ]);
    wfcdGenRefData.Frame = frames;
    wfcdGenRefData.Weapon = weapons;
    wfcdGenRefData.Quest = quests;
  } catch (e) {
    console.warn(t().refDataFailedLog, e);
  }
}
void loadWfcdGenRefData();

const wfcdNameInput = el<HTMLInputElement>("wfcd-name");
const wfcdNameSuggest = el("wfcd-name-suggest");
function hideWfcdNameSuggest(): void {
  wfcdNameSuggest.classList.add("hidden");
}
function updateWfcdNameSuggest(): void {
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  const pool = wfcdGenRefData[nodeType] ?? [];
  const q = wfcdNameInput.value.trim().toLowerCase();
  if (!q) {
    hideWfcdNameSuggest();
    return;
  }

  // Only Quest also keyword-matches the Japanese name (QUEST_JA). The value
  // actually sent stays the WFCD English name (/api/wfcd/generate requires
  // an exact match).
  const matches = pool
    .filter((n) => {
      if (n.toLowerCase().includes(q)) return true;
      return nodeType === "Quest" && questJa(n) !== n && questJa(n).toLowerCase().includes(q);
    })
    .slice(0, 30);
  if (!matches.length) {
    wfcdNameSuggest.innerHTML = `<div class="suggest-empty">${t().noMatchFreeform}</div>`;
  } else {
    wfcdNameSuggest.innerHTML = matches
      .map((n) => {
        const label = nodeType === "Quest" && questJa(n) !== n ? `${questJa(n)}（${n}）` : n;
        return `<div class="suggest-item" data-value="${n.replace(/"/g, "&quot;")}">${label}</div>`;
      })
      .join("");
    wfcdNameSuggest.querySelectorAll(".suggest-item").forEach((itemEl) => {
      itemEl.addEventListener("mousedown", (e) => {
        // fires before blur
        e.preventDefault();
        const raw = (itemEl as HTMLElement).dataset.value ?? "";
        // Show the Japanese name once picked (のっち指摘、2026-08-29) — the
        // raw WFCD English name /api/wfcd/generate needs is recovered via
        // questEn() right before the fetch call below, not stored here.
        wfcdNameInput.value = nodeType === "Quest" ? questJa(raw) : raw;
        hideWfcdNameSuggest();
      });
    });
  }
  wfcdNameSuggest.classList.remove("hidden");
}
wfcdNameInput.addEventListener("input", updateWfcdNameSuggest);
wfcdNameInput.addEventListener("focus", updateWfcdNameSuggest);
wfcdNameInput.addEventListener("blur", () => setTimeout(hideWfcdNameSuggest, 150));
el("wfcd-node-type").addEventListener("change", () => {
  wfcdNameInput.value = "";
  hideWfcdNameSuggest();
});

el("wfcd-import-btn").addEventListener("click", () => {
  el("wfcd-preview").innerHTML = "";
  el("wfcd-modal-import").style.display = "none";
  wfcdSuggestion = null;
  el("wfcd-modal-backdrop").classList.remove("hidden");
});
el("wfcd-modal-cancel").addEventListener("click", () => {
  el("wfcd-modal-backdrop").classList.add("hidden");
});

// Factored out of the click handler below so initDeepLink() (bottom of this
// file) can trigger the same fetch programmatically after pre-filling
// #wfcd-node-type/#wfcd-name, instead of synthesizing a click.
async function runWfcdFetch(): Promise<void> {
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  const typed = el<HTMLInputElement>("wfcd-name").value.trim();
  // Input may hold the Japanese name (picked from the suggestion list, or
  // free-typed) — resolve back to the WFCD English name the API needs.
  const name = nodeType === "Quest" ? questEn(typed) : typed;
  const preview = el("wfcd-preview");
  el("wfcd-modal-import").style.display = "none";
  if (!name) {
    showToast(t().enterName);
    return;
  }
  preview.innerHTML = `<div class="empty">${t().fetching}</div>`;
  const res = await fetch(`/api/wfcd/generate?nodeType=${encodeURIComponent(nodeType)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    preview.innerHTML = `<div class="empty">${t().notFound}</div>`;
    return;
  }
  wfcdSuggestion = (await res.json()) as WfcdSuggestion;
  renderWfcdPreview();
  el("wfcd-modal-import").style.display = "";
}
el("wfcd-fetch-btn").addEventListener("click", () => void runWfcdFetch());

function renderWfcdPreview(): void {
  const s = wfcdSuggestion!;
  const preview = el("wfcd-preview");
  // パーツごとに全く同じ説明文が繰り返し表示されて目障りだった（のっち
  // 指摘、2026-08-28）ため、1回だけ出す共通の注記に格上げ——各パーツの
  // ラベルは「入手先」のみに簡略化。
  const anyCandidates = (s.parts ?? []).some((p) => (p.relicCandidates ?? []).length > 0);
  const partsNote = anyCandidates
    ? `<div class="ph-row" style="opacity:.8;margin-top:10px;">${t().pickOneSource}</div>`
    : "";
  const parts = (s.parts ?? [])
    .map((p, i) => {
      // 縦に長くなりがちなカード一覧をやめてネイティブ<select>に変更
      // （のっち指摘、2026-08-28）。Vault済みバッジ（アイコン付き）は
      // <option>に差し込めないため、テキストの「・Vault済み」に格下げ。
      //
      // 同じレリックが精錬度（無精錬/上鍛錬/超鍛錬/完全鍛錬）ごとに違う
      // ドロップ率で複数エントリ持つことがある（例: Uncommon枠なら
      // 11/13/17/20%の4本、Rare枠なら2/4/6/10%の4本）ため、value（元の
      // relicCandidates配列のindex）は変えず、表示だけレリック名でまとめる。
      //
      // レリック側の%はそのミッションの確率ではなくレリック自体の報酬
      // テーブル内の確率で紛らわしく、かつ入手先ミッション件数（下記
      // updateRelicInfo）を別途表示するようになったので不要——レリックは
      // 名前のみ表示に統一（のっち指摘、2026-08-28）。この結果、精錬度
      // 違いの複数エントリは表示上区別する情報が無くなるため1件に統合する
      // （import時に読むのはcandidate.name/isRelicのみでchanceは未使用
      // なので、代表indexを1つ残すだけで機能上の影響はない）。通常
      // ミッション側の%はそのミッション自体の確率でそのまま意味を持つため
      // 従来どおり表示・optgroupでまとめる。
      const grouped = new Map<string, { c: RelicCandidate; idx: number }[]>();
      (p.relicCandidates ?? []).forEach((c, ci) => {
        const arr = grouped.get(c.name);
        if (arr) arr.push({ c, idx: ci });
        else grouped.set(c.name, [{ c, idx: ci }]);
      });
      // Vault済みは今すぐ入手できない側なので下に沈める（のっち指摘、
      // 2026-08-28）——ただしVault済みでもPrime Resurgence在庫がある
      // レリックは実質「今すぐ買える」側なので、Vault済みのみ（Resurgence
      // 無し）より上に置く3段階ソートに変更（2026-08-30、のっち指摘:
      // 候補が全部Vault表示になって見分けがつかなかった）。各段の中の
      // 相対順はWFCDの元の並びのまま（Array.sortは安定ソート）。
      const rank = (c: RelicCandidate): number => (!c.vaulted ? 0 : c.resurgence ? 1 : 2);
      const candidateOptions = Array.from(grouped.entries())
        .sort((a, b) => rank(a[1][0]!.c) - rank(b[1][0]!.c))
        .map(([name, entries]) => {
          const jaName = locationJa(name);
          const first = entries[0]!.c;
          if (first.isRelic) {
            const vaultedText = first.vaulted ? t().vaultedSuffix : "";
            const resurgenceText = first.resurgence ? t().resurgenceSuffix(first.resurgence.slice(0, 10)) : "";
            return `<option value="${entries[0]!.idx}">${t().relicOption(jaName, `${vaultedText}${resurgenceText}`)}</option>`;
          }
          if (entries.length === 1) {
            const { c, idx } = entries[0]!;
            return `<option value="${idx}">${t().missionOption(jaName, c.chance)}</option>`;
          }
          const inner = entries.map(({ c, idx }) => `<option value="${idx}">${c.chance}%</option>`).join("");
          return `<optgroup label="${jaName}">${inner}</optgroup>`;
        })
        .join("");
      return `
      <div class="wfcd-part">
        <div class="part-name">${itemJa(p.node.name)}</div>
        ${
          (p.relicCandidates ?? []).length
            ? `<label style="margin:0 0 2px;">${t().sourceLabel}</label>
             <select data-part-value="${i}">
               <option value="">${t().notSelected}</option>
               ${candidateOptions}
             </select>
             <div class="wfcd-relic-info" data-relic-info="${i}"></div>`
            : `<div class="empty">${t().noSourceData}</div>`
        }
      </div>`;
    })
    .join("");

  const syndicateRow = s.syndicateRank
    ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-syndicate-check" checked style="margin-top:3px;">
        <span>${t().syndicateRankNote(s.syndicateRank.node.name, s.syndicateRank.standing.toLocaleString())}</span>
      </label>
    </div>`
    : "";

  const questChain = s.questChain
    ? `
    <div class="wfcd-part">
      <div class="part-name">${t().questChainTitle}</div>
      ${
        s.questChain.length > 1
          ? `<div class="ph-row">${s.questChain.map((n) => questJa(n.name)).join(" → ")}</div>`
          : `<div class="empty">${t().noQuestChain}</div>`
      }
    </div>`
    : "";

  // A node that's only added doesn't attach to any Build's contains, so it
  // never shows up in Chain View's Build-rooted BFS display ("doesn't feel
  // like it took effect" report, 2026-08-23). When the currently-selected
  // Build is known, offer to auto-attach it to that Build's contains.
  //
  // Default unchecked (のっち指摘、2026-08-29): this checkbox attaches the
  // generated root itself (the Frame/Weapon/Quest, not its WFCD parts) into
  // whatever Build happens to be focused right now — semantically wrong
  // most of the time (e.g. auto-generating "Mag Prime" or a Quest while
  // "Ash Prime" is focused doesn't mean Ash Prime "contains" either of
  // those). Defaulting to checked silently created bogus contains edges
  // between unrelated nodes. Still opt-in-able for the cases where it's
  // actually correct (e.g. deliberately nesting a real sub-goal).
  const currentBuild = state.graph?.nodes?.[state.report?.buildId ?? ""];
  const attachRow = currentBuild
    ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-attach-check" style="margin-top:3px;">
        <span>${t().attachToBuild(currentBuild.name)}</span>
      </label>
    </div>`
    : `
    <div class="wfcd-part"><div class="empty">${t().noCurrentBuild}</div></div>`;

  // Reverse propagation to Loadouts (2026-08-25 item 27). Chain View's Node
  // types have no Companion/Archwing/Necramech (and WFCD auto-generation only
  // covers Frame/Weapon/Quest), so this is Frame/Weapon only. Chain View's
  // main purpose is tracking not-yet-owned items, so the checkbox defaults
  // unchecked — the opposite default from Loadouts' own registration
  // (owned:true). Collections gets pushed unconditionally either way
  // (see the import handler below), independent of this checkbox.
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  // Hidden when arriving via a loadout-item link-back deep link — that item
  // is already getting linked below in the import handler, so this checkbox
  // would just offer to create a redundant second one.
  const loadoutsRow =
    (nodeType === "Frame" || nodeType === "Weapon") && pendingLinkBack?.kind !== "loadout-item"
      ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-loadouts-check" style="margin-top:3px;">
        <span>${t().alsoAddToLoadouts}</span>
      </label>
    </div>`
      : "";

  preview.innerHTML = `
    <div class="ph-row" style="margin-top:10px;"><b>${t().paradigmLabel}</b> ${s.paradigm}</div>
    ${s.richLich ? `<div class="ph-row"><b>${t().richLichLabel}</b> ${s.richLich}</div>` : ""}
    ${s.archetype ? `<div class="ph-row"><b>${t().archetypeLabel}</b> ${s.archetype}</div>` : ""}
    <div class="ph-row"><b>${t().rootNodeLabel}</b> ${s.root.type === "Quest" ? questJa(s.root.name) : s.root.name}（${s.root.id}）</div>
    ${attachRow}
    ${loadoutsRow}
    ${syndicateRow}
    ${questChain}
    ${partsNote}
    ${parts}
  `;

  // 入手先で選んだレリックの現在のドロップ状況を件数だけ表示（のっち依頼、
  // 2026-08-28）。フルの入手ミッション一覧は1レリックあたり8〜127件
  // （中央値80件）と実用的な量を超えるため、件数のみに絞った経緯は
  // /api/wfcd/relic-status（server/wfcd.tsのrelicMissionCount）参照。
  preview.querySelectorAll<HTMLSelectElement>("[data-part-value]").forEach((sel) => {
    const partIdx = Number(sel.dataset.partValue);
    sel.addEventListener("change", () => void updateRelicInfo(partIdx, sel));
  });
}

async function updateRelicInfo(partIdx: number, sel: HTMLSelectElement): Promise<void> {
  const info = document.querySelector<HTMLElement>(`[data-relic-info="${partIdx}"]`);
  if (!info) return;
  // sel.value === "" for the "（未選択）" placeholder — Number("") is 0, not
  // NaN, so skipping this check would silently re-fetch candidate index 0's
  // info instead of clearing (real bug hit testing this, 2026-08-28).
  const candidate = sel.value === "" ? undefined : wfcdSuggestion?.parts?.[partIdx]?.relicCandidates?.[Number(sel.value)];
  if (!candidate || !candidate.isRelic) {
    info.textContent = "";
    return;
  }
  info.textContent = t().checking;
  try {
    const res = await fetch(`/api/wfcd/relic-status?name=${encodeURIComponent(candidate.name)}`);
    const data = res.ok ? ((await res.json()) as RelicStatusResponse) : null;
    if (!data) {
      info.textContent = "";
      return;
    }
    const resurgenceNote = data.resurgence?.available ? t().resurgenceNote(data.resurgence.expiry.slice(0, 10)) : "";
    info.textContent = data.vaulted
      ? t().vaultedStatus(resurgenceNote)
      : t().droppingStatus(data.missionCount ?? 0, resurgenceNote);
  } catch {
    info.textContent = "";
  }
}

el("wfcd-modal-import").addEventListener("click", async () => {
  if (!wfcdSuggestion) return;
  const nodes: Record<string, unknown>[] = [];
  const root: Record<string, unknown> = { ...wfcdSuggestion.root };

  const attachCheck = document.getElementById("wfcd-attach-check") as HTMLInputElement | null;
  const currentBuild = state.graph?.nodes?.[state.report?.buildId ?? ""];
  const willAttach = !!(attachCheck?.checked && currentBuild);
  // Not attaching to the current Build makes it Goal, an independent root.
  // Leaving it as its raw type (Frame/Weapon/Quest) would orphan it — not
  // reachable from any Build/Goal's contains/requires, so it would never
  // show up in Chain View's Build-rooted BFS display (2026-08-23; changed
  // to Goal on 2026-08-25).
  if (!willAttach) root.type = "Goal";

  nodes.push(root);

  // Quest chain: add every prerequisite quest node other than root as-is
  // (each node's requires already points at its prerequisite quest, set by
  // BuildQuestSuggestion server-side).
  (wfcdSuggestion.questChain ?? []).forEach((n) => {
    if (n.id !== root.id) nodes.push({ ...n });
  });

  // Syndicate rank: if checked, add the rank node and wire it into root's requires.
  if (wfcdSuggestion.syndicateRank) {
    const check = document.getElementById("wfcd-syndicate-check") as HTMLInputElement | null;
    if (check?.checked) {
      const rankNode = wfcdSuggestion.syndicateRank.node;
      if (!nodes.find((n) => n.id === rankNode.id)) {
        nodes.push({ ...rankNode, requires: rankNode.requires ?? [], contains: rankNode.contains ?? [] });
      }
      root.requires = [...((root.requires as string[] | undefined) ?? []), rankNode.id];
    }
  }

  (wfcdSuggestion.parts ?? []).forEach((p, i) => {
    const partNode: Record<string, unknown> = { ...p.node, requires: [] };
    const sel = document.querySelector<HTMLSelectElement>(`[data-part-value="${i}"]`);
    const chosenIdx = sel ? sel.value : "";
    if (chosenIdx !== "" && p.relicCandidates) {
      const candidate = p.relicCandidates[Number(chosenIdx)];
      if (candidate?.isRelic) {
        // Relic-sourced: create a separate node as the thing to be cracked,
        // wired via requires (unchanged).
        const relicId = `relic-${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
        if (!nodes.find((n) => n.id === relicId)) {
          nodes.push({ id: relicId, name: candidate.name, type: "Relic", requires: [], contains: [] });
        }
        partNode.requires = [relicId];
      } else if (candidate) {
        // Normal-mission/assassination drop: there's no "crack this" node
        // like a relic, so no requires link — just record the source in the
        // part's note.
        partNode.note = t().sourceNote(candidate.name);
      }
    }
    nodes.push(partNode);
  });

  const importRes = await fetch("/api/wfcd/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes }),
  });
  // The server resolves each node's id by name against the existing graph
  // (2026-08-29 — ids are opaque random strings now, not name-derived, so
  // the client's own pre-import root.id, computed before that resolution,
  // may not be the id the node actually got saved under). Read the real one
  // back from the response for every step below that needs to reference it.
  const importedNodes = importRes.ok ? ((await importRes.json()) as Node[]) : [];
  const finalRootId = importedNodes.find((n) => n.name === root.name)?.id ?? (root.id as string);

  // Cross-page linking (2026-08-25 item 27). Frame/Weapon only (Chain View
  // has no Companion/Archwing/Necramech node type and WFCD auto-generation
  // only covers Frame/Weapon/Quest).
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  if (nodeType === "Frame" || nodeType === "Weapon") {
    if (pendingLinkBack?.kind === "loadout-item") {
      // Arrived via Loadouts' registration checkbox (2026-08-30) — link the
      // specific item that started this, instead of the checkbox/forced-push
      // paths below (loadoutsRow is hidden for this case, see
      // renderWfcdPreview()).
      const res = await fetch("/api/loadouts");
      const data = res.ok ? ((await res.json()) as { items?: Record<string, { id: string; [key: string]: unknown }> }) : null;
      const item = data?.items?.[pendingLinkBack.id];
      if (item) {
        await fetch("/api/loadout-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...item, chainViewNodeId: finalRootId }),
        });
      }
      await forcePushToCollections(nodeType, root.name as string, false);
    } else if (pendingLinkBack?.kind === "collections-frames" || pendingLinkBack?.kind === "collections-weapons") {
      // Arrived via Collections' Frame/Weapon registration checkbox
      // (2026-08-30) — link the specific entry that started this. Skips the
      // forced Collections push below since that entry already exists.
      const apiPath = pendingLinkBack.kind === "collections-frames" ? "frames" : "weapons";
      const res = await fetch("/api/collections");
      const data = res.ok ? ((await res.json()) as Record<string, Record<string, { id: string; [key: string]: unknown }>>) : null;
      const entry = data?.[apiPath]?.[pendingLinkBack.id];
      if (entry) {
        await fetch(`/api/collections/${apiPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...entry, chainViewNodeId: finalRootId }),
        });
      }
    } else {
      // Normal in-page use (no deep link): Loadouts is optional (checkbox),
      // Collections is always forced regardless (skips if a same-name entry
      // already exists). Chain-View-origin creates it owned:false — "track
      // something not yet owned" is the point here, the opposite default
      // from Loadouts' own registration (owned:true).
      const loadoutsCheck = document.getElementById("wfcd-loadouts-check") as HTMLInputElement | null;
      if (loadoutsCheck?.checked) {
        await forcePushToLoadoutItem(nodeType as "Frame" | "Weapon", root.name as string, finalRootId);
      }
      await forcePushToCollections(nodeType, root.name as string, false);
    }
  }

  // Attach to the current Build's contains (only when willAttach is true).
  let attached = false;
  if (willAttach && currentBuild && !(currentBuild.contains ?? []).includes(finalRootId)) {
    const updatedBuild = { ...currentBuild, contains: [...(currentBuild.contains ?? []), finalRootId] };
    await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedBuild) });
    attached = true;
  }

  el("wfcd-modal-backdrop").classList.add("hidden");
  await loadGraph();
  if (state.focus) await loadReport();
  const rootDisplayName =
    wfcdSuggestion.root.type === "Quest" ? questJa(root.name as string) : (root.name as string);
  const linkedBack = !!pendingLinkBack;
  pendingLinkBack = null; // one-shot: don't let a stale target survive into the next open of this modal
  showToast(
    linkedBack
      ? t().addedLinked(rootDisplayName)
      : attached
        ? t().addedToBuild(rootDisplayName)
        : t().addedAsGoal(rootDisplayName),
    "success",
  );
});

// Deep link from Loadouts/Collections' "Chain Viewにも追加する" registration
// checkbox (2026-08-30) — replaces the old silent background-generate
// (autoGenerateChainViewNode, wfcd-autolink.ts) with actually opening this
// wizard pre-filled, so relic candidates get a chance to be picked instead
// of always being skipped. Mirrors build-sidebar.ts's `?focus=` deep-link
// pattern: read once, strip the params immediately so a reload doesn't
// re-trigger it.
(function initDeepLink(): void {
  const params = new URLSearchParams(location.search);
  const nodeType = params.get("wfcd-generate");
  const name = params.get("wfcd-name");
  const linkBack = params.get("link-back");
  if (!nodeType || !name) return;

  if (linkBack) {
    const sep = linkBack.indexOf(":");
    const kind = sep > 0 ? linkBack.slice(0, sep) : "";
    const id = sep > 0 ? linkBack.slice(sep + 1) : "";
    if (kind === "loadout-item" || kind === "collections-frames" || kind === "collections-weapons") {
      pendingLinkBack = { kind, id };
    }
  }

  const url = new URL(location.href);
  url.searchParams.delete("wfcd-generate");
  url.searchParams.delete("wfcd-name");
  url.searchParams.delete("link-back");
  history.replaceState(null, "", url);

  el<HTMLSelectElement>("wfcd-node-type").value = nodeType;
  el<HTMLInputElement>("wfcd-name").value = name;
  el("wfcd-preview").innerHTML = "";
  el("wfcd-modal-import").style.display = "none";
  wfcdSuggestion = null;
  el("wfcd-modal-backdrop").classList.remove("hidden");
  void runWfcdFetch();
})();
