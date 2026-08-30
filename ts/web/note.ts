// Entry script for note.html — a single persistent "big memo" page
// (2026-08-29, のっち依頼), distinct from scratch.ts's クイックメモ (a small
// floating sticky-note widget meant for transient jotting shared across
// every page). This page is the opposite: one Markdown document, checked
// periodically, its own dedicated page.
import "./booster.ts";
import "./spoiler-warning.ts";
import "./quest-onboarding.ts";
import "./manual-launcher.ts";
import "./scratch.ts";
import "./kofi-link.ts";
import "./theme.ts";
import "./wallpaper.ts";
import "./scroll-top.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { createLiveEditor } from "./notemd.ts";
import { effective, onLocaleChange, type Locale } from "./locale.ts";

interface NoteData {
  content: string;
}

interface HelpStrings {
  toggleTitle: string;
  body: string;
}
const HELP_STRINGS: Record<Locale, HelpStrings> = {
  ja: {
    toggleTitle: "記法チートシート",
    body:
      "<code>**太字**</code> で太字<br>" +
      "<code>- </code> で箇条書き<br>" +
      "<code>- [ ]</code> / <code>- [x]</code> でチェックリスト（クリックで切替）<br>" +
      "編集中の行だけ生のMarkdown表示、他の行は整形表示になります。",
  },
  en: {
    toggleTitle: "Syntax cheat sheet",
    body:
      "<code>**bold**</code> for bold<br>" +
      "<code>- </code> for a bullet<br>" +
      "<code>- [ ]</code> / <code>- [x]</code> for a checklist (click to toggle)<br>" +
      "Only the line you're editing shows raw Markdown — every other line shows its formatted form.",
  },
};

// scratch.ts's quick-memo panel has this same「！」記法チートシート next to
// its own editor instance; note.ts's plain createLiveEditor() call never got
// the equivalent markup, so this page had no way to see the syntax reference
// at all (2026-08-30、のっち報告 — 見出しの markup は note.html 側に直書き済み).
function initHelpToggle(): void {
  const toggleBtn = el("note-help-toggle");
  const popover = el("note-help-popover");
  toggleBtn.innerHTML = icon("circle-alert", { size: 14 });

  function renderHelpText(locale: Locale): void {
    toggleBtn.title = HELP_STRINGS[locale].toggleTitle;
    popover.innerHTML = HELP_STRINGS[locale].body;
  }
  renderHelpText(effective());
  onLocaleChange(renderHelpText);

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.classList.toggle("hidden");
  });
  popover.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => popover.classList.add("hidden"));
}

async function init(): Promise<void> {
  initHelpToggle();
  const res = await fetch("/api/note");
  const data: NoteData = res.ok ? await res.json() : { content: "" };

  createLiveEditor(el<HTMLDivElement>("note-editor"), data.content, async (newContent) => {
    await fetch("/api/note", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
  });
}

void init();
