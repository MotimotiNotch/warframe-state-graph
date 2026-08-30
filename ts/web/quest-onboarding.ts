// Port of web/quest-onboarding.js. One-time first-launch modal offering to
// pre-register already-cleared gating quests (pkg/stats.GatingQuests — only
// the 3 quests that gate Focus School/Railjack/Drifter spoiler sections,
// not the full quest list). Waits for spoiler-warning.ts's ack event so the
// two first-run modals never stack.

import { flashHighlight } from "./highlight.ts";
import { effective, onLocaleChange, renderLocaleSwitch, type Locale } from "./locale.ts";
import { questJa } from "./quest-i18n.ts";

const KEY = "warframe-state-graph:questOnboardingSeen";

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

const SPOILER_KEY = "warframe-state-graph:spoilerAcknowledged";
function spoilerAcknowledged(): boolean {
  try {
    return localStorage.getItem(SPOILER_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* not fatal */
  }
}

// English is the canonical WFCD quest name (matches /api/stats/quest's exact-
// match requirement); the Japanese label is derived via questJa() from
// quest-i18n.ts rather than duplicated here (2026-08-30, was previously its
// own hardcoded `ja` field — quest-i18n.ts is the single source now).
const GATING_QUESTS: { name: string }[] = [{ name: "The Second Dream" }, { name: "Rising Tide" }, { name: "The Duviri Paradox" }];
function gatingQuestLabel(name: string, locale: Locale): string {
  return locale === "ja" ? questJa(name) : name;
}

interface ModalStrings {
  title: string;
  body: string;
  hint: string;
  skipButton: string;
  saveButton: string;
}
const MODAL_STRINGS: Record<Locale, ModalStrings> = {
  ja: {
    title: "クエスト進行状況を先に登録しますか？",
    body: "Statsページの一部セクションは、対応するクエストをクリア済みでないとネタバレ回避のため折りたたまれています。<b>既にクリア済みのもの</b>にチェックを入れると、該当セクションがすぐに開きます。",
    hint: "後からでもStatsページの「クエスト進行状況」パネルでいつでも変更できます。このモーダルは今回限りです。",
    skipButton: "スキップ",
    saveButton: "保存して閉じる",
  },
  en: {
    title: "Register your quest progress now?",
    body: "Some sections of the Stats page stay collapsed to avoid spoilers until their gating quest is marked cleared. Check anything you've <b>already cleared</b> to open that section right away.",
    hint: 'You can change this anytime later in the Stats page\'s "Quest Progress" panel. This modal only shows once.',
    skipButton: "Skip",
    saveButton: "Save and close",
  },
};

interface ToastStrings {
  hint: string;
  openManual: string;
}
const TOAST_STRINGS: Record<Locale, ToastStrings> = {
  ja: { hint: "使い方をハイライト付きで見られます", openManual: "マニュアルを開く" },
  en: { hint: "See a highlighted walkthrough of how to use it", openManual: "Open the manual" },
};

// Follows the onboarding modal (skip or save, either path) — a low-pressure
// invite into the manual window, not another blocking modal. The actual
// window.open() call happens inside this toast's own button click handler
// (not here), so the popup blocker sees a direct user gesture. Auto-dismisses
// after a while so it never lingers for someone who doesn't want it.
function offerManual(): void {
  const toast = document.createElement("div");
  toast.style.cssText =
    "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:501;" +
    "background:var(--bg,#12141a);color:var(--text,#e4e6ec);border:1px solid var(--accent,#f6ddaa);" +
    "border-radius:12px;padding:10px 12px 10px 16px;font-family:'Noto Sans JP',-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
    "font-size:0.82rem;box-shadow:0 8px 24px rgba(0,0,0,0.4);display:flex;align-items:center;gap:12px;";
  const dismiss = () => toast.remove();

  function renderToast(locale: Locale): void {
    const t = TOAST_STRINGS[locale];
    toast.innerHTML =
      "<div id='quest-onboarding-toast-locale' style='display:flex;'></div>" +
      `<span>${t.hint}</span>` +
      "<button id='quest-onboarding-open-manual' style='background:transparent;border:1px solid var(--accent,#f6ddaa);" +
      `color:var(--accent,#f6ddaa);border-radius:6px;padding:5px 12px;font-size:0.78rem;cursor:pointer;white-space:nowrap;'>${t.openManual}</button>` +
      "<button id='quest-onboarding-dismiss-manual' style='background:transparent;border:none;color:var(--muted,#9aa0ab);" +
      "cursor:pointer;font-size:1rem;padding:2px 4px;line-height:1;'>×</button>";
    renderLocaleSwitch(toast.querySelector<HTMLElement>("#quest-onboarding-toast-locale")!);
    toast.querySelector<HTMLButtonElement>("#quest-onboarding-open-manual")!.addEventListener("click", () => {
      window.open("/manual.html", "wsg-manual", "width=440,height=680,resizable=yes,scrollbars=yes");
      dismiss();
    });
    toast.querySelector<HTMLButtonElement>("#quest-onboarding-dismiss-manual")!.addEventListener("click", dismiss);
  }
  renderToast(effective());
  const unsubscribe = onLocaleChange(renderToast);
  document.body.appendChild(toast);
  window.setTimeout(() => {
    unsubscribe();
    dismiss();
  }, 12000);

  // Point at where the manual actually lives, not just tell about it in text
  // (のっち指摘、2026-08-27: トースト文言だけでは実際のボタンの場所が分からない).
  const launcherBtn = document.getElementById("manual-launcher-btn");
  if (launcherBtn) flashHighlight(launcherBtn);
}

function show(): void {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;" +
    "justify-content:center;padding:16px;z-index:500;";
  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--bg,#12141a);color:var(--text,#e4e6ec);border:1px solid var(--border,#2a2e3a);" +
    "border-radius:16px;padding:18px 20px;max-width:480px;font-family:'Noto Sans JP',-apple-system,'Segoe UI','Hiragino Sans',sans-serif;" +
    "font-size:0.85rem;line-height:1.6;box-shadow:0 12px 30px rgba(0,0,0,0.5);max-height:80vh;overflow-y:auto;";

  function readChecked(): boolean[] {
    return GATING_QUESTS.map((_, i) => (document.getElementById(`quest-onboarding-check-${i}`) as HTMLInputElement | null)?.checked ?? false);
  }

  function renderContent(locale: Locale, preservedChecked: boolean[], onSkip: () => void, onSave: () => void): void {
    const s = MODAL_STRINGS[locale];
    const checksHtml = GATING_QUESTS.map(
      (q, i) =>
        `<label style='display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;'>` +
        `<input type='checkbox' id='quest-onboarding-check-${i}' style='width:auto;' ${preservedChecked[i] ? "checked" : ""}>` +
        `${gatingQuestLabel(q.name, locale)}</label>`,
    ).join("");

    box.innerHTML =
      "<div id='quest-onboarding-locale' style='margin-bottom:12px;'></div>" +
      `<div style='font-weight:600;font-size:0.95rem;margin-bottom:10px;'>${s.title}</div>` +
      `<div style='margin-bottom:12px;'>${s.body}</div>` +
      `<div style='margin-bottom:14px;'>${checksHtml}</div>` +
      `<div style='color:var(--muted,#9aa0ab);font-size:0.75rem;margin-bottom:4px;'>${s.hint}</div>` +
      "<div style='text-align:right;margin-top:10px;display:flex;gap:8px;justify-content:flex-end;'>" +
      "<button id='quest-onboarding-skip' style='background:transparent;border:1px solid var(--border,#2a2e3a);" +
      `color:var(--muted,#9aa0ab);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>${s.skipButton}</button>` +
      "<button id='quest-onboarding-save' style='background:transparent;border:1px solid var(--accent,#f6ddaa);" +
      `color:var(--accent,#f6ddaa);border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer;'>${s.saveButton}</button>` +
      "</div>";
    renderLocaleSwitch(box.querySelector<HTMLElement>("#quest-onboarding-locale")!);
    box.querySelector<HTMLButtonElement>("#quest-onboarding-skip")!.addEventListener("click", onSkip);
    box.querySelector<HTMLButtonElement>("#quest-onboarding-save")!.addEventListener("click", onSave);
  }

  function skip(): void {
    unsubscribe();
    markSeen();
    backdrop.remove();
    offerManual();
  }
  async function save(): Promise<void> {
    // Read the checkboxes' state while the modal is still in the document —
    // backdrop.remove() below detaches it, and getElementById can't find an
    // id inside a detached subtree, so re-querying after remove() silently
    // threw (uncaught in this async handler) and skipped offerManual()
    // entirely on every save, checked or not (のっち報告, 2026-08-27).
    const checkedFlags = readChecked();
    unsubscribe();
    markSeen();
    backdrop.remove();
    for (let i = 0; i < GATING_QUESTS.length; i++) {
      if (!checkedFlags[i]) continue; // uncleared side stays at the default false
      try {
        await fetch(`/api/stats/quest/${encodeURIComponent(GATING_QUESTS[i]!.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleared: true }),
        });
      } catch {
        /* the modal still closes on save failure; can be re-registered from the Stats page */
      }
    }
    offerManual();
  }

  renderContent(effective(), GATING_QUESTS.map(() => false), skip, save);
  // Re-render preserves whatever the user already checked before switching
  // language mid-modal, instead of resetting the checkboxes.
  const unsubscribe = onLocaleChange((locale) => renderContent(locale, readChecked(), skip, save));
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
}

function tryShow(): void {
  const proceed = () => {
    if (document.body) show();
  };
  if (spoilerAcknowledged()) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", proceed);
    else proceed();
  } else {
    window.addEventListener("warframe-state-graph:spoiler-acknowledged", proceed, { once: true });
  }
}

if (!alreadySeen()) tryShow();
