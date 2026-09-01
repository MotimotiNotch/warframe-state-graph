// Port of the inline script in web/standing.html.
import type { Data, SyndicateInfo } from "../server/standing.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { showToast } from "./toast.ts";
import { initWfcdRefresh } from "./wfcd-refresh.ts";
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

interface StandingResponse {
  data: Data;
  syndicates: SyndicateInfo[];
}

// UI-chrome strings (2026-08-30, part of the page-by-page i18n rollout —
// see locale.ts). Game-data dicts (SYNDICATE_JA/SACRIFICE_ITEM_JA below) are
// separate: English just falls back to their own EN keys, no new
// translation needed there (のっち承認済み方針).
interface UIStrings {
  [key: string]: string; // lets this satisfy applyI18nText()'s Record<string, string> bound
  refreshUpdating: string;
  refreshDone: string;
  refreshTitle: string;
  helpToggleTitle: string;
  helpPopover: string;
  majorSynHeading: string;
  otherSynHeading: string;
  toggleOpenClose: string;
  synWarning: string;
  cancel: string;
  save: string;
  loading: string;
  notReached: string;
  hostile: string;
  highestAchievementLabel: string;
  highestAchievementNote: string;
  correctHighestTitle: string;
  savedFlash: string;
  viewSacrifice: string;
  unknownUnconfirmed: string;
  none: string;
  paid: string;
  recoveryPrefix: string;
  rankCorrectTitle: string; // {name} placeholder
  rankCorrectHint: string; // {max} placeholder
  invalidRankToast: string; // {max} placeholder
}
const STRINGS: Record<Locale, UIStrings> = {
  ja: {
    refreshUpdating: "更新中…",
    refreshDone: "更新完了",
    refreshTitle: "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください",
    helpToggleTitle: "このページについて",
    helpPopover:
      "<div style='margin-bottom:8px;'>全18シンジケート（Conclave/Cephalon Simarisを除く）の現在ランクを記録する場所です。</div>" +
      "<ul style='margin:0 0 10px;padding-left:18px;'>" +
      "<li>6大シンジケート（Steel Meridian/Arbiters of Hexis/Cephalon Suda ⇔ Red Veil/The Perrin Sequence/New Loka）は2陣営が敵対関係にあり、片方を上げるともう片方が下がりうる（0を割ると降格し最大Rank -2まで下降）。そのためChain Viewの<code>requires</code>連鎖トグルとは別に、現在ランクの値そのものを直接保持・更新します</li>" +
      "<li>他の12シンジケートは敵対関係を持たず、ランクは0以上のみ</li>" +
      "<li>貢献アイテムの中身は一部シンジケートで実データからの解釈が確定できず「不明」表示のままのものがあります</li>" +
      "<li>武器購入に必要な特定ランクの管理はChain View側のノード生成（WFCD自動生成のシンジケート候補）を使ってください</li>" +
      "</ul>" +
      "<div>⚠️ シンジケート武器名など、未プレイのコンテンツ名が表示されることがあります。</div>",
    majorSynHeading: "6大シンジケート",
    otherSynHeading: "その他のシンジケート",
    toggleOpenClose: "開閉",
    synWarning: "クエストやイベント進行で解放されるシンジケートです。ネタバレを含むため閲覧に注意してください。",
    cancel: "キャンセル",
    save: "保存",
    loading: "読み込み中…",
    notReached: "未到達",
    hostile: "敵対",
    highestAchievementLabel: "最高到達実績: ",
    highestAchievementNote: "（降格しても下がらない）",
    correctHighestTitle: "最高到達実績を訂正（誤って高いランクを選んでしまった時用）",
    savedFlash: "保存済み",
    viewSacrifice: "ランクアップ捧げ物アイテムを見る",
    unknownUnconfirmed: "不明（未確認）",
    none: "なし",
    paid: "支払済",
    recoveryPrefix: "マイナス圏からNeutralへの回復捧げ物: ",
    rankCorrectTitle: "「{name}」の最高到達実績を訂正",
    rankCorrectHint: "0〜{max}（間違って高いランクを選んでしまった時用）",
    invalidRankToast: "0〜{max}の整数を入力して",
  },
  en: {
    refreshUpdating: "Updating…",
    refreshDone: "Updated",
    refreshTitle: "Press this if a new frame/weapon etc. added by a game update isn't showing up as a candidate",
    helpToggleTitle: "About this page",
    helpPopover:
      "<div style='margin-bottom:8px;'>Records your current rank across all 18 syndicates (excluding Conclave/Cephalon Simaris).</div>" +
      "<ul style='margin:0 0 10px;padding-left:18px;'>" +
      "<li>The 6 major syndicates (Steel Meridian/Arbiters of Hexis/Cephalon Suda ⇔ Red Veil/The Perrin Sequence/New Loka) have 2 hostile pairs — raising one can lower its opposite (dropping below 0 demotes it, down to Rank -2). So unlike Chain View's <code>requires</code>-chain toggle, this page holds and updates the current rank value directly.</li>" +
      "<li>The other 12 syndicates have no hostile relationship and only ever range from Rank 0 upward.</li>" +
      "<li>The contribution-item breakdown couldn't be confirmed from the underlying data for a few syndicates, so those stay marked \"Unknown\".</li>" +
      "<li>To track the specific rank needed to buy a weapon, use Chain View's own node generation (the WFCD auto-generated syndicate candidates) instead.</li>" +
      "</ul>" +
      "<div>⚠️ Syndicate weapon names and similar may be shown here even for content you haven't played yet.</div>",
    majorSynHeading: "Major Syndicates",
    otherSynHeading: "Other Syndicates",
    toggleOpenClose: "Toggle",
    synWarning: "These syndicates unlock through quest/event progress. May contain spoilers — view with care.",
    cancel: "Cancel",
    save: "Save",
    loading: "Loading…",
    notReached: "Not reached",
    hostile: "Hostile",
    highestAchievementLabel: "Highest reached: ",
    highestAchievementNote: "(doesn't drop back down on demotion)",
    correctHighestTitle: "Correct your highest-reached rank (for when you picked too high a rank by mistake)",
    savedFlash: "Saved",
    viewSacrifice: "View rank-up sacrifice items",
    unknownUnconfirmed: "Unknown (unconfirmed)",
    none: "None",
    paid: "Paid",
    recoveryPrefix: "Recovery sacrifice (negative rank back to Neutral): ",
    rankCorrectTitle: "Correct “{name}”'s highest-reached rank",
    rankCorrectHint: "0–{max} (for when you picked too high a rank by mistake)",
    invalidRankToast: "Enter a whole number between 0 and {max}",
  },
};
function t(): UIStrings {
  return STRINGS[effective()];
}

const state: { syndicates: SyndicateInfo[]; ranks: Record<string, number>; highest: Record<string, number> } = {
  syndicates: [],
  ranks: {},
  highest: {},
};

// 公式サイト（warframe.com/ja「シンジケートガイド」）記載の日本語表記に合わせた対応表
// （2026-08-19、WebFetchで確認済み）。pkg/standing側のキー（英語名）はAPI/データの
// 識別子としてそのまま使い、表示だけこちらに差し替える。
const SYNDICATE_JA: Record<string, string> = {
  "Steel Meridian": "スティール・メリディアン",
  "Arbiters of Hexis": "アービターズ・オブ・ヘクシス",
  "Cephalon Suda": "セファロン・スーダ",
  "Red Veil": "レッド・ベール",
  "The Perrin Sequence": "ペリン・シークエンス",
  "New Loka": "ニュー・ロカ",
  Ostron: "オストロン",
  "Solaris United": "ソラリス連合",
  Ventkids: "ベントキッド",
  Entrati: "エントラティ",
  Necraloid: "ネクロロイド",
  Cavia: "カビア",
  "The Hex": "ヘックス",
  "Kahl's Garrison": "KAHL守備隊",
  "Operational Supply": "作戦補給班",
  "The Holdfasts": "ホールドファスト",
  "The Quills": "クイル",
};
// English mode just falls back to the (already-English) dict key — no
// separate translation needed for this or SACRIFICE_ITEM_JA below
// (2026-08-30 i18n rollout, のっち承認済み方針).
function synJa(name: string): string {
  return effective() === "en" ? name : SYNDICATE_JA[name] || name;
}

const SACRIFICE_ITEM_JA: Record<string, string> = {
  Gallium: "ガリウム",
  Morphics: "モーフィクス",
  "Control Module": "コントロールモジュール",
  "Detonite Ampule": "デトナイト アンプル",
  "Fieldron Sample": "フィールドロン サンプル",
  Forma: "フォーマ",
  "Orokin Catalyst": "オロキン カタリスト",
  "Orokin Reactor": "オロキン リアクター",
  Aya: "アヤ",
};
function itemJa(item: string): string {
  if (effective() === "en") return item;
  const i = item.indexOf("×");
  if (i === -1) return SACRIFICE_ITEM_JA[item] || item;
  const name = item.slice(0, i);
  return (SACRIFICE_ITEM_JA[name] || name) + item.slice(i);
}

initWfcdRefresh({
  labels: () => ({ updating: t().refreshUpdating, done: t().refreshDone, title: t().refreshTitle }),
});

el("help-toggle").innerHTML = icon("info");
el("help-toggle").addEventListener("click", (e) => {
  e.stopPropagation();
  el("help-popover").classList.toggle("hidden");
});

// 「その他のシンジケート」は初回は閉じておく（クエスト/イベント進行で解放される
// ＝未プレイのコンテンツ名を目にする可能性があるため、既定では見せない設計）。
el("other-syn-icon").innerHTML = icon("triangle-alert", { size: 15 });
el("other-syn-chevron").innerHTML = icon("chevron-down");
function toggleOtherSyndicates(): void {
  el("other-syndicate-list").classList.toggle("hidden");
  el("other-syn-chevron").classList.toggle("expanded");
}
el("other-syn-toggle").addEventListener("click", toggleOtherSyndicates);
el("other-syn-chevron").addEventListener("click", toggleOtherSyndicates);
el("help-popover").addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => {
  el("help-popover").classList.add("hidden");
  document.querySelectorAll(".syn-sacrifice-pop").forEach((p) => p.classList.add("hidden"));
  document.querySelectorAll(".panel.raised").forEach((p) => p.classList.remove("raised"));
});

function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 6大シンジケート（敵対relationshipあり）だけがマイナスランクまで下がりうる。それ以外の
// 12シンジケート（server/standing.tsのfaction:"none"）は常に0〜最高ランクの範囲に収まる
// （server/standing.tsのminRank/maxRankと同じロジックをフロント側でも複製）。
function minRank(s: SyndicateInfo): number {
  return s.faction === "left" || s.faction === "right" ? -2 : 0;
}
function maxRank(s: SyndicateInfo): number {
  return (s.ranks || []).length;
}

// server/standing.tsのrankLabelとロジックを揃えた表示ラベル生成。保存前のプレビュー用に
// フロント側で複製している（選択の度にサーバー往復して確認する必要をなくすため）。
function rankLabel(syndicateName: string, rank: number): string {
  if (rank === 0) return "Neutral (Rank 0)";
  if (rank < 0) return `${t().hostile} (Rank ${rank})`;
  const syn = state.syndicates.find((s) => s.name === syndicateName);
  if (syn && rank >= 1 && rank <= maxRank(syn)) return `${syn.ranks[rank - 1]} (Rank ${rank})`;
  return `Rank ${rank}`;
}

function rankOptions(syndicateName: string, current: number): string {
  const syn = state.syndicates.find((s) => s.name === syndicateName);
  if (!syn) return "";
  let opts = "";
  for (let r = minRank(syn); r <= maxRank(syn); r++) {
    opts += `<option value="${r}" ${r === current ? "selected" : ""}>${escapeHtml(rankLabel(syndicateName, r))}</option>`;
  }
  return opts;
}

function sacrificeLabel(rs: SyndicateInfo["sacrifices"][number] | undefined): string {
  if (!rs) return "";
  if (rs.unconfirmed) return t().unknownUnconfirmed;
  if (rs.none) return t().none;
  return (rs.items || []).map(itemJa).join(effective() === "en" ? ", " : "、");
}

// ランクアップ貢献はそのランクへ初めて到達した時のみ必要（降格→再昇格では不要、
// マイナス圏からの回復を除く）。server/standing.tsのrecoverySacrificeと同じ
// 「Rank3到達貢献と同一」という法則をフロント側でも複製している。
function recoverySacrifice(s: SyndicateInfo): string {
  return s.sacrifices && s.sacrifices.length >= 3 ? sacrificeLabel(s.sacrifices[2]) : "";
}

function sacrificeTable(s: SyndicateInfo, highest: number, current: number): string {
  const rows = (s.sacrifices || [])
    .map((rs, i) => {
      const rank = i + 1;
      const paid = rank <= highest;
      return `
      <tr class="${paid ? "paid" : ""}">
        <td>Rank ${rank}</td>
        <td class="sac-item">${escapeHtml(sacrificeLabel(rs))}</td>
        <td class="sac-status">${paid ? t().paid : ""}</td>
      </tr>`;
    })
    .join("");
  const note = s.note ? `<div class="syn-note">${escapeHtml(s.note)}</div>` : "";
  const recovery =
    current < 0 ? `<div class="syn-recovery">${t().recoveryPrefix}${escapeHtml(recoverySacrifice(s))}</div>` : "";
  return `<table>${rows}</table>${note}${recovery}`;
}

// showAchievement: 敵対relationship持ち（6大シンジケート）だけtrue。降格が無い12シンジケートは
// 「現在ランク＝最高到達ランク」が常に一致するため、最高到達実績バッジも捧げ物一覧も冗長——
// プルダウン1つだけに削る。
function renderSyndicateList(containerId: string, list: SyndicateInfo[], showAchievement: boolean): void {
  const container = el(containerId);
  if (!list.length) {
    container.innerHTML = `<div class="empty">${t().loading}</div>`;
    return;
  }
  container.innerHTML = list
    .map((s) => {
      const current = state.ranks[s.name] ?? 0;
      const highest = state.highest[s.name] ?? 0;
      const highestLabel = highest > 0 ? rankLabel(s.name, highest) : t().notReached;
      const achievement = showAchievement
        ? `
        <div class="syn-highest">
          ${t().highestAchievementLabel}<span class="val">${escapeHtml(highestLabel)}</span>${t().highestAchievementNote}
          <button type="button" class="icon-btn syn-highest-reset" data-highest-reset="${escapeHtml(s.name)}" title="${escapeHtml(t().correctHighestTitle)}">${icon("refresh-cw", { size: 11 })}</button>
        </div>
        <div class="syn-sacrifice-wrap">
          <button type="button" class="syn-sacrifice-toggle" data-sacrifice-toggle="${escapeHtml(s.name)}">${icon("chevron-down", { size: 12 })}${t().viewSacrifice}</button>
          <div class="popover hidden syn-sacrifice-pop" data-sacrifice-pop="${escapeHtml(s.name)}">${sacrificeTable(s, highest, current)}</div>
        </div>`
        : "";
      return `
      <div class="syn-row">
        <div class="syn-row-head">
          <span class="syn-name">${escapeHtml(synJa(s.name))}</span>
          <span class="syn-saved-flash" data-flash="${escapeHtml(s.name)}">${icon("check", { size: 14 })}${t().savedFlash}</span>
        </div>
        <select data-syndicate="${escapeHtml(s.name)}">${rankOptions(s.name, current)}</select>
        ${achievement}
      </div>`;
    })
    .join("");

  container.querySelectorAll<HTMLButtonElement>("[data-sacrifice-toggle]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const pop = container.querySelector<HTMLElement>(
        `[data-sacrifice-pop="${CSS.escape(btn.dataset.sacrificeToggle!)}"]`,
      )!;
      const willShow = pop.classList.contains("hidden");
      container.querySelectorAll(".syn-sacrifice-pop").forEach((p) => p.classList.add("hidden"));
      // .panel同士はbackdrop-filterでそれぞれ独立した重なりコンテキストを作るため、
      // ポップオーバー自身のz-indexだけでは次のパネルの下に隠れてしまう。開いている間だけ
      // 親.panelごと前面へ持ち上げる（CSSの.panel.raisedコメント参照）。
      const panel = container.closest(".panel");
      if (willShow) {
        pop.classList.remove("hidden");
        panel?.classList.add("raised");
      } else {
        panel?.classList.remove("raised");
      }
    }),
  );
  container.querySelectorAll(".syn-sacrifice-pop").forEach((pop) => pop.addEventListener("click", (e) => e.stopPropagation()));
  container.querySelectorAll<HTMLButtonElement>("[data-highest-reset]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRankCorrectModal(btn.dataset.highestReset!);
    }),
  );
  container.querySelectorAll<HTMLSelectElement>("[data-syndicate]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const name = sel.dataset.syndicate!;
      const rank = Number(sel.value);
      const res = await fetch(`/api/standing/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank }),
      });
      const data = (await res.json()) as Data;
      state.ranks = data.ranks || state.ranks;
      state.highest = data.highestRankReached || state.highest;
      render();
      const flashEl = document.querySelector<HTMLElement>(`[data-flash="${CSS.escape(name)}"]`);
      if (flashEl) {
        flashEl.classList.add("show");
        setTimeout(() => flashEl.classList.remove("show"), 1200);
      }
    });
  });
}

// 最高到達実績の訂正モーダル（window.prompt()/window.alert()廃止、ADR05実装、
// 2026-08-28）。「間違って高いランクを選んでしまった時用」の訂正なので
// 頻度は低いが、他の全箇所と同じくのっち指示で対象——このページ唯一の
// モーダル利用箇所（standing.htmlに.modal-backdrop/.modalを新規追加）。
let rankCorrectSyndicate: string | null = null;

function openRankCorrectModal(name: string): void {
  rankCorrectSyndicate = name;
  const syn = state.syndicates.find((s) => s.name === name);
  const max = syn ? maxRank(syn) : 5;
  const current = state.highest[name] ?? 0;
  el("rank-correct-title").textContent = t().rankCorrectTitle.replace("{name}", synJa(name));
  el("rank-correct-hint").textContent = t().rankCorrectHint.replace("{max}", String(max));
  const input = el<HTMLInputElement>("rank-correct-input");
  input.min = "0";
  input.max = String(max);
  input.value = String(current);
  el("rank-correct-modal-backdrop").classList.remove("hidden");
  input.focus();
}

function closeRankCorrectModal(): void {
  el("rank-correct-modal-backdrop").classList.add("hidden");
  rankCorrectSyndicate = null;
}

async function saveRankCorrectModal(): Promise<void> {
  const name = rankCorrectSyndicate;
  if (!name) return;
  const syn = state.syndicates.find((s) => s.name === name);
  const max = syn ? maxRank(syn) : 5;
  const rank = Number(el<HTMLInputElement>("rank-correct-input").value);
  if (!Number.isInteger(rank) || rank < 0 || rank > max) {
    showToast(t().invalidRankToast.replace("{max}", String(max)));
    return;
  }
  const res = await fetch(`/api/standing/${encodeURIComponent(name)}/highest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rank }),
  });
  const data = (await res.json()) as Data;
  state.ranks = data.ranks || state.ranks;
  state.highest = data.highestRankReached || state.highest;
  closeRankCorrectModal();
  render();
}

el("rank-correct-cancel").addEventListener("click", closeRankCorrectModal);
el("rank-correct-save").addEventListener("click", () => void saveRankCorrectModal());
el<HTMLInputElement>("rank-correct-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") void saveRankCorrectModal();
});

function render(): void {
  const isMajor = (s: SyndicateInfo) => s.faction === "left" || s.faction === "right";
  renderSyndicateList("major-syndicate-list", state.syndicates.filter(isMajor), true);
  renderSyndicateList(
    "other-syndicate-list",
    state.syndicates.filter((s) => !isMajor(s)),
    false,
  );
}

async function loadStanding(): Promise<void> {
  const res = await fetch("/api/standing");
  const body = (await res.json()) as StandingResponse;
  state.syndicates = body.syndicates || [];
  state.ranks = body.data?.ranks || {};
  state.highest = body.data?.highestRankReached || {};
  render();
}

applyI18nText(STRINGS);
onLocaleChange(() => {
  applyI18nText(STRINGS);
  render();
});

void loadStanding();
