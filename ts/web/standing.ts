// Port of the inline script in web/standing.html.
import type { Data, SyndicateInfo } from "../server/standing.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";

interface StandingResponse {
  data: Data;
  syndicates: SyndicateInfo[];
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
  Necraloid: "ネクラロイド",
  "Kahl's Garrison": "KAHL守備隊",
  "Operational Supply": "作戦補給班",
  "The Holdfasts": "ホールドファスト",
  "The Quills": "クイル",
};
function synJa(name: string): string {
  return SYNDICATE_JA[name] || name;
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
  const i = item.indexOf("×");
  if (i === -1) return SACRIFICE_ITEM_JA[item] || item;
  const name = item.slice(0, i);
  return (SACRIFICE_ITEM_JA[name] || name) + item.slice(i);
}

el("refresh-wfcd-btn").innerHTML = icon("refresh-cw");
el("refresh-wfcd-btn").addEventListener("click", async () => {
  const btn = el("refresh-wfcd-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.classList.add("spinning");
  btn.title = "更新中…";
  await fetch("/api/wfcd/refresh", { method: "POST" });
  btn.classList.remove("spinning");
  btn.classList.add("success");
  btn.innerHTML = icon("check");
  btn.title = "更新完了";
  setTimeout(() => {
    btn.classList.remove("success");
    btn.innerHTML = icon("refresh-cw");
    btn.disabled = false;
    btn.title = "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください";
  }, 2000);
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
// 10シンジケート（pkg/standing.FactionNone）は常に0〜最高ランクの範囲に収まる
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
  if (rank < 0) return `敵対 (Rank ${rank})`;
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
  if (rs.unconfirmed) return "不明（未確認）";
  if (rs.none) return "なし";
  return (rs.items || []).map(itemJa).join("、");
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
        <td class="sac-status">${paid ? "支払済" : ""}</td>
      </tr>`;
    })
    .join("");
  const note = s.note ? `<div class="syn-note">${escapeHtml(s.note)}</div>` : "";
  const recovery =
    current < 0 ? `<div class="syn-recovery">マイナス圏からNeutralへの回復捧げ物: ${escapeHtml(recoverySacrifice(s))}</div>` : "";
  return `<table>${rows}</table>${note}${recovery}`;
}

// showAchievement: 敵対relationship持ち（6大シンジケート）だけtrue。降格が無い10シンジケートは
// 「現在ランク＝最高到達ランク」が常に一致するため、最高到達実績バッジも捧げ物一覧も冗長——
// プルダウン1つだけに削る。
function renderSyndicateList(containerId: string, list: SyndicateInfo[], showAchievement: boolean): void {
  const container = el(containerId);
  if (!list.length) {
    container.innerHTML = `<div class="empty">読み込み中…</div>`;
    return;
  }
  container.innerHTML = list
    .map((s) => {
      const current = state.ranks[s.name] ?? 0;
      const highest = state.highest[s.name] ?? 0;
      const highestLabel = highest > 0 ? rankLabel(s.name, highest) : "未到達";
      const achievement = showAchievement
        ? `
        <div class="syn-highest">
          最高到達実績: <span class="val">${escapeHtml(highestLabel)}</span>（降格しても下がらない）
          <button type="button" class="icon-btn syn-highest-reset" data-highest-reset="${escapeHtml(s.name)}" title="最高到達実績を訂正（誤って高いランクを選んでしまった時用）">${icon("refresh-cw", { size: 11 })}</button>
        </div>
        <div class="syn-sacrifice-wrap">
          <button type="button" class="syn-sacrifice-toggle" data-sacrifice-toggle="${escapeHtml(s.name)}">${icon("chevron-down", { size: 12 })}ランクアップ捧げ物アイテムを見る</button>
          <div class="popover hidden syn-sacrifice-pop" data-sacrifice-pop="${escapeHtml(s.name)}">${sacrificeTable(s, highest, current)}</div>
        </div>`
        : "";
      return `
      <div class="syn-row">
        <div class="syn-row-head">
          <span class="syn-name">${escapeHtml(synJa(s.name))}</span>
          <span class="syn-saved-flash" data-flash="${escapeHtml(s.name)}">${icon("check", { size: 14 })}保存済み</span>
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
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const name = btn.dataset.highestReset!;
      const syn = state.syndicates.find((s) => s.name === name);
      const max = syn ? maxRank(syn) : 5;
      const current = state.highest[name] ?? 0;
      const input = window.prompt(
        `「${synJa(name)}」の最高到達実績を訂正（0〜${max}、間違って高いランクを選んでしまった時用）`,
        String(current),
      );
      if (input === null) return;
      const rank = Number(input);
      if (!Number.isInteger(rank) || rank < 0 || rank > max) {
        window.alert(`0〜${max}の整数を入力して`);
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
      render();
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

void loadStanding();
