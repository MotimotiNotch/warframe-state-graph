// Port of web/spoiler-warning.js. One-time first-launch modal: tool purpose,
// data-source credit, spoiler warning. Ack persists in localStorage.
import { effective, onLocaleChange, renderLocaleSwitch, type Locale } from "./locale.ts";

const KEY = "warframe-state-graph:spoilerAcknowledged";

interface Strings {
  title: string;
  intro: string;
  dataSourceHeading: string;
  wfcdCredit: string;
  wikiCredit: string;
  thanks: string;
  spoilerHeading: string;
  spoilerBody: string;
  bullet1: string;
  bullet2: string;
  closeButton: string;
}

const STRINGS: Record<Locale, Strings> = {
  ja: {
    title: "このツールについて",
    intro: "ゲーム内の依存関係グラフと自分の進行状況を接続し、次にやるべきことを動的に導き出す個人用ツールです。",
    dataSourceHeading: "データ出典",
    wfcdCredit: "ゲームデータ: {{wfcd}}（Warframe Community Developers）の公開データ",
    wikiCredit: "クエストの前提関係など: {{wiki}} / {{wikiwiki}}（日本語コミュニティWiki）",
    thanks:
      "そして何より、この非公式ツールの土台になっている{{game}}というゲームと、それを作り届けてくださっているDigital Extremesに感謝します。",
    spoilerHeading: "⚠️ ネタバレについて",
    spoilerBody:
      "このツールはWarframe公開データ（WFCD）をそのまま扱うため、クエスト名・前提関係や特定の入手手段を持つ武器名など、<b>まだプレイしていないコンテンツの名称が画面に表示される</b>ことがあります。",
    bullet1: "先の情報を見たくないページ（特にChain ViewのWFCD自動生成）は利用を控えてください",
    bullet2: "先にStatsページの「クエスト進行状況」パネルでクリア済みクエストを登録しておくと、自分の進行にネタバレの状態を合わせやすくなります",
    closeButton: "閉じる",
  },
  en: {
    title: "About this tool",
    intro:
      "A personal tool that connects the game's dependency graph with your own progress to work out what to do next.",
    dataSourceHeading: "Data sources",
    wfcdCredit: "Game data: public data from {{wfcd}} (Warframe Community Developers)",
    wikiCredit: "Quest prerequisites and similar: {{wiki}} / {{wikiwiki}} (a Japanese community wiki)",
    thanks:
      "And above all, thanks to {{game}} — the game this unofficial tool is built on top of — and to Digital Extremes for making and shipping it.",
    spoilerHeading: "⚠️ About spoilers",
    spoilerBody:
      "Because this tool works directly with public Warframe data (WFCD), it can <b>show the names of content you haven't played yet</b> — quest names, prerequisite relationships, weapons with specific acquisition methods, and the like.",
    bullet1: "Avoid pages you don't want spoiled (especially Chain View's WFCD auto-generation)",
    bullet2:
      'Registering already-cleared quests ahead of time in the Stats page\'s "Quest Progress" panel makes it easier to keep what\'s shown in line with your own progress',
    closeButton: "Close",
  },
};

function alreadyAcknowledged(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // localStorage unavailable: don't show the modal, no reason to block
  }
}

function link(href: string, text: string): string {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:var(--accent,#f6ddaa);">${text}</a>`;
}

function renderContent(box: HTMLElement, locale: Locale, onAck: () => void): void {
  const s = STRINGS[locale];
  const h4 = "font-weight:600;font-size:0.78rem;color:var(--muted,#9aa0ab);margin:0 0 4px;text-transform:uppercase;letter-spacing:0.02em;";
  const ul = "margin:0 0 14px;padding-left:18px;";
  const wfcdCredit = s.wfcdCredit.replace("{{wfcd}}", link("https://github.com/WFCD", "WFCD"));
  const wikiCredit = s.wikiCredit
    .replace("{{wiki}}", link("https://wiki.warframe.com/", "WARFRAME Wiki"))
    .replace("{{wikiwiki}}", link("https://wikiwiki.jp/warframe/", "wikiwiki.jp"));
  const thanks = s.thanks.replace("{{game}}", link("https://www.warframe.com/", locale === "ja" ? "『Warframe』" : "Warframe"));
  box.innerHTML =
    "<div id='spoiler-locale-switch' style='margin-bottom:12px;'></div>" +
    `<div style='font-weight:600;font-size:0.95rem;margin-bottom:10px;'>${s.title}</div>` +
    `<div style='margin-bottom:12px;'>${s.intro}</div>` +
    `<div style='${h4}'>${s.dataSourceHeading}</div>` +
    `<ul style='${ul}'>` +
    `<li>${wfcdCredit}</li>` +
    `<li>${wikiCredit}</li>` +
    "</ul>" +
    `<div style='font-style:italic;color:var(--muted,#9aa0ab);margin-bottom:16px;'>${thanks}</div>` +
    `<div style='font-weight:600;font-size:0.95rem;margin-bottom:8px;'>${s.spoilerHeading}</div>` +
    `<div style='margin-bottom:8px;'>${s.spoilerBody}</div>` +
    `<ul style='margin:0;padding-left:18px;'>` +
    `<li>${s.bullet1}</li>` +
    `<li>${s.bullet2}</li>` +
    "</ul>" +
    "<div style='text-align:right;margin-top:14px;'>" +
    "<button id='spoiler-ack-btn' style='background:transparent;border:1px solid var(--accent,#f6ddaa);" +
    `color:var(--accent,#f6ddaa);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>${s.closeButton}</button>` +
    "</div>";
  renderLocaleSwitch(box.querySelector<HTMLElement>("#spoiler-locale-switch")!);
  // Re-wired on every render since innerHTML rebuild above tore down the
  // previous button along with its listener (a locale switch mid-modal
  // rebuilds this box, so a listener attached only once by the caller would
  // end up bound to a detached element).
  box.querySelector<HTMLButtonElement>("#spoiler-ack-btn")!.addEventListener("click", onAck);
}

function show(): void {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;" +
    "justify-content:center;padding:16px;z-index:500;";
  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--bg,#12141a);color:var(--text,#e4e6ec);border:1px solid var(--border,#2a2e3a);" +
    "border-radius:16px;padding:18px 20px;max-width:560px;font-family:'Noto Sans JP',-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
    "font-size:0.85rem;line-height:1.6;box-shadow:0 12px 30px rgba(0,0,0,0.5);max-height:80vh;overflow-y:auto;";
  function ack(): void {
    unsubscribe();
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* not fatal */
    }
    backdrop.remove();
    // quest-onboarding.ts waits for this event so its own onboarding modal
    // doesn't stack on top of this one.
    window.dispatchEvent(new CustomEvent("warframe-state-graph:spoiler-acknowledged"));
  }
  renderContent(box, effective(), ack);
  const unsubscribe = onLocaleChange((locale) => renderContent(box, locale, ack));
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
}

if (!alreadyAcknowledged()) {
  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show);
}
