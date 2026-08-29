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
import { el } from "./dom.ts";
import { createLiveEditor } from "./notemd.ts";

interface NoteData {
  content: string;
}

async function init(): Promise<void> {
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
