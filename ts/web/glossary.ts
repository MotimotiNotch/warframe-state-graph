// Port of the inline script in web/glossary.html. Read-only debug view of
// /api/glossary; editing happens from collections.html's settings modal
// (Phase 10), not here.
import type { Data, Entry } from "../server/glossary.ts";
import { el } from "./dom.ts";

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function load(): Promise<void> {
  const target = el("content");
  const res = await fetch("/api/glossary");
  if (!res.ok) {
    target.innerHTML = `<div class="empty">取得に失敗しました</div>`;
    return;
  }
  const data = (await res.json()) as Data;
  const entries = Object.values(data.entries ?? {});
  if (!entries.length) {
    target.innerHTML = `<div class="empty">登録なし</div>`;
    return;
  }

  const byCategory: Record<string, Entry[]> = {};
  entries.forEach((e) => {
    const cat = e.category || "（カテゴリなし）";
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
        `<div class="category-label">${escapeHtml(cat)}（${byCategory[cat]!.length}件）</div>` +
        `<table><thead><tr><th>English</th><th>日本語</th></tr></thead><tbody>${rows}</tbody></table>`
      );
    })
    .join("");
}

void load();
