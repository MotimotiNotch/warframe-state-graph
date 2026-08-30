// JA/EN display-language toggle. Default is Japanese; falls back to the
// browser's own language when nothing has been chosen yet, and a manual
// choice (persisted) always wins after that (same stored() ?? systemDefault()
// shape as theme.ts's light/dark toggle). renderLocaleSwitch() is exported so
// both the persistent header widget below and each modal's own embedded
// switch (needed because modal backdrops sit at z-index:500+, above the
// header bar's z-index:100, making the header button unreachable while a
// modal is open) share one implementation instead of duplicating the
// control. Being rolled out page by page starting 2026-08-30 (Note done;
// see SKILL.md Core Mandate 3 for current coverage) — a page not yet
// converted still shows Japanese-only chrome regardless of this setting.
import { getTopRightBar } from "./icons.ts";

const KEY = "warframe-state-graph:locale";

export type Locale = "ja" | "en";

function stored(): Locale | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "ja" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

function systemDefault(): Locale {
  const lang = (typeof navigator !== "undefined" && navigator.language) || "";
  return lang.toLowerCase().startsWith("en") ? "en" : "ja";
}

export function effective(): Locale {
  return stored() ?? systemDefault();
}

const CHANGE_EVENT = "warframe-state-graph:locale-changed";

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* private-mode etc: page still switches visually, just doesn't persist */
  }
  document.documentElement.setAttribute("lang", locale);
  window.dispatchEvent(new CustomEvent<Locale>(CHANGE_EVENT, { detail: locale }));
}

/** Subscribe to locale changes; returns an unsubscribe function. Callers
 * (modals) should unsubscribe when they close, so the listener doesn't
 * outlive the DOM it was updating. */
export function onLocaleChange(cb: (locale: Locale) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<Locale>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  // Scoped to .locale-select (not a bare `select{}`) so it doesn't leak onto
  // this page's other <select> elements, which already have their own more
  // specific styling (e.g. stats.ts's Focus School/Railjack dropdowns).
  style.textContent = `
      select.locale-select {
        background: var(--bg, #12141a);
        color: var(--text, #e4e6ec);
        border: 1px solid var(--border, #2a2e3a);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 0.78rem;
        cursor: pointer;
      }
    `;
  document.head.appendChild(style);
}

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: "ja", label: "日本語" },
  { locale: "en", label: "English" },
];

/** Renders a "日本語 / English" dropdown into `container` and wires it up.
 * Safe to call more than once for the same container (rebuilds in place),
 * and safe to call on multiple containers at once (header widget + any open
 * modal) — each instance re-renders independently on change. A dropdown
 * rather than a segmented button pair (のっち指摘 2026-08-30: the two-button
 * version's box heights didn't line up inside the modal). */
export function renderLocaleSwitch(container: HTMLElement): void {
  injectStyle();
  const current = effective();
  container.innerHTML = `<select class="locale-select">${OPTIONS.map((o) => `<option value="${o.locale}" ${o.locale === current ? "selected" : ""}>${o.label}</option>`).join("")}</select>`;
  const select = container.querySelector<HTMLSelectElement>("select.locale-select")!;
  select.addEventListener("change", () => {
    const next = select.value as Locale;
    if (next !== effective()) setLocale(next);
  });
}

/** Applies a page's STRINGS table to static HTML markup, for the chrome that
 * isn't built by JS at all (nav headings, static help popovers, etc. — as
 * opposed to spoiler-warning.ts-style content the module itself renders,
 * which just picks its own STRINGS[locale] directly). The page marks each
 * element with `data-i18n="key"` (textContent), `data-i18n-title="key"`
 * (title attribute), `data-i18n-placeholder="key"` (placeholder attribute),
 * or `data-i18n-html="key"` (innerHTML, for content with its own markup
 * like a bullet list) — the JA text stays in the HTML as the authored
 * default, this only overwrites it. A key missing from the current locale's
 * table is left untouched. Call once at page init and again from
 * onLocaleChange() so a live toggle updates this markup too. */
export function applyI18nText(strings: Record<Locale, Record<string, string>>): void {
  const table = strings[effective()];
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const text = table[el.dataset.i18n!];
    if (text !== undefined) el.textContent = text;
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const text = table[el.dataset.i18nTitle!];
    if (text !== undefined) el.title = text;
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]").forEach((el) => {
    const text = table[el.dataset.i18nPlaceholder!];
    if (text !== undefined) el.placeholder = text;
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const html = table[el.dataset.i18nHtml!];
    if (html !== undefined) el.innerHTML = html;
  });
}

function init(): void {
  const bar = getTopRightBar();
  const container = document.createElement("div");
  container.id = "locale-switch-widget"; // manual.ts's "言語切替" topic targets this
  container.className = "locale-switch";
  bar.appendChild(container);
  renderLocaleSwitch(container);
  onLocaleChange(() => renderLocaleSwitch(container));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
