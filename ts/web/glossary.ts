// Port of the inline script in web/glossary.html. Read-only debug view of
// /api/glossary; editing happens from collections.html's settings modal
// (Phase 10), not here.
import type { Data, Entry } from "../server/glossary.ts";
import { el } from "./dom.ts";
import { effective } from "./locale.ts";

const STRINGS: Record<"ja" | "en", { fetchFailed: string; noEntries: string; noCategory: string; entryCount: (n: number) => string; jaHeader: string }> = {
  ja: {
    fetchFailed: "取得に失敗しました",
    noEntries: "登録なし",
    noCategory: "（カテゴリなし）",
    entryCount: (n) => `（${n}件）`,
    jaHeader: "日本語",
  },
  en: {
    fetchFailed: "Failed to fetch",
    noEntries: "Nothing registered",
    noCategory: "(no category)",
    entryCount: (n) => ` (${n})`,
    jaHeader: "Japanese",
  },
};

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function load(): Promise<void> {
  const t = STRINGS[effective()];
  const target = el("content");
  const res = await fetch("/api/glossary");
  if (!res.ok) {
    target.innerHTML = `<div class="empty">${t.fetchFailed}</div>`;
    return;
  }
  const data = (await res.json()) as Data;
  const entries = Object.values(data.entries ?? {});
  if (!entries.length) {
    target.innerHTML = `<div class="empty">${t.noEntries}</div>`;
    return;
  }

  const byCategory: Record<string, Entry[]> = {};
  entries.forEach((e) => {
    const cat = e.category || t.noCategory;
    (byCategory[cat] ??= []).push(e);
  });

  target.innerHTML = Object.keys(byCategory)
    .sort()
    .map((cat) => {
      const rows = byCategory[cat]!
        .sort((a, b) => a.enKey.localeCompare(b.enKey))
        .map((e) => `<tr><td>${escapeHtml(e.enKey)}</td><td>${escapeHtml(e.ja)}</td></tr>`)
        .join("");
      return (
        `<div class="category-label">${escapeHtml(cat)}${t.entryCount(byCategory[cat]!.length)}</div>` +
        `<table><thead><tr><th>English</th><th>${t.jaHeader}</th></tr></thead><tbody>${rows}</tbody></table>`
      );
    })
    .join("");
}

void load();
