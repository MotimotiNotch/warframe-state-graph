// Shared WFCD refresh control: the ⟳ button every data page carries, plus
// the "as of" reading next to it (Issue #4).
//
// The reading matters because staleness here doesn't look like missing data,
// it looks like wrong data: Vault status is inferred from a relic's *absence*
// from the drop tables, so a cache that predates a Prime Resurgence rotation
// reports a farmable relic as vaulted with no visible sign anything is off.
// Showing when the data was fetched is what lets the user tell the two apart.
//
// The button's own behaviour was copy-pasted across five pages before this
// (identical except for the extra reload Stats does), so it lives here now
// and each page passes in its own label text — Stats' tooltip says something
// different from the rest.
import { el, maybeEl } from "./dom.ts";
import { icon } from "./icons.ts";
import { effective, onLocaleChange, type Locale } from "./locale.ts";

/** Mirrors CacheStatus in server/wfcd.ts. */
interface CacheStatus {
  asOf: string | null;
  newest: string | null;
  files: number;
}

export interface RefreshLabels {
  /** Tooltip while the refresh is running. */
  updating: string;
  /** Tooltip right after it finishes. */
  done: string;
  /** The button's resting tooltip (page-specific). */
  title: string;
}

interface AsOfStrings {
  prefix: string;
  never: string;
  tipSingle: string; // {date}
  tipRange: string; // {date} {newest} {files}
  tipNever: string;
}

const AS_OF: Record<Locale, AsOfStrings> = {
  ja: {
    prefix: "WFCD ",
    never: "未取得",
    tipSingle: "外部データ（WFCD）の取得日時: {date}",
    tipRange:
      "外部データ（WFCD）はファイル単位で取り込まれます。もっとも古いもので {date}、もっとも新しいもので {newest}（{files}件）。" +
      "レリックのVault判定はこのデータの「載っていないこと」を根拠にしているため、古いままだと入手可能なレリックがVault済みと出ることがあります。" +
      "左の更新ボタンで全部取り直せます。",
    tipNever: "外部データ（WFCD）はまだ取得していません。必要になった時点で自動的に取得されます。",
  },
  en: {
    prefix: "WFCD ",
    never: "not fetched",
    tipSingle: "External (WFCD) data fetched: {date}",
    tipRange:
      "External (WFCD) data is cached file by file. Oldest {date}, newest {newest} ({files} files). " +
      "Relic Vault status is inferred from a relic being absent from this data, so a stale cache can report an " +
      "obtainable relic as vaulted. The refresh button on the left re-fetches all of it.",
    tipNever: "External (WFCD) data hasn't been fetched yet. It is fetched automatically the first time it is needed.",
  },
};

const LABEL_ID = "wfcd-asof";

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  // Hidden on narrow windows rather than wrapped: the toolbar it sits in is
  // already tight there, and the same text stays reachable as the button's
  // own tooltip.
  style.textContent = `
      #${LABEL_ID} {
        font-size: 0.72rem;
        color: var(--muted, #9aa0ab);
        white-space: nowrap;
        margin-right: 6px;
        cursor: help;
      }
      @media (max-width: 700px) { #${LABEL_ID} { display: none; } }
    `;
  document.head.appendChild(style);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(effective() === "en" ? "en-US" : "ja-JP", {
    year: "numeric",
    month: effective() === "en" ? "short" : "numeric",
    day: "numeric",
  });
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

let lastStatus: CacheStatus | null = null;

function render(): void {
  const label = maybeEl(LABEL_ID);
  if (!label) return;
  const s = AS_OF[effective()];
  if (!lastStatus || !lastStatus.asOf) {
    label.textContent = s.prefix + s.never;
    label.title = s.tipNever;
    return;
  }
  const asOf = formatDate(lastStatus.asOf);
  label.textContent = s.prefix + asOf;
  label.title =
    lastStatus.newest && lastStatus.newest !== lastStatus.asOf
      ? fill(s.tipRange, { date: asOf, newest: formatDate(lastStatus.newest), files: String(lastStatus.files) })
      : fill(s.tipSingle, { date: asOf });
}

async function reload(): Promise<void> {
  try {
    const res = await fetch("/api/wfcd/status");
    lastStatus = res.ok ? ((await res.json()) as CacheStatus) : null;
  } catch {
    lastStatus = null; // server unreachable: fall back to the "not fetched" reading
  }
  render();
}

/** Wires #refresh-wfcd-btn and inserts the "as of" reading in front of it.
 * `labels()` is called fresh each time so it follows the page's own locale
 * switch; `onRefreshed` runs after the cache is wiped, for pages that also
 * have to re-pull what they're displaying. */
export function initWfcdRefresh(opts: {
  labels: () => RefreshLabels;
  onRefreshed?: () => Promise<void> | void;
}): void {
  const btn = el<HTMLButtonElement>("refresh-wfcd-btn");
  btn.innerHTML = icon("refresh-cw");

  injectStyle();
  const label = document.createElement("span");
  label.id = LABEL_ID;
  btn.parentElement?.insertBefore(label, btn);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.classList.add("spinning");
    btn.title = opts.labels().updating;
    await fetch("/api/wfcd/refresh", { method: "POST" });
    await opts.onRefreshed?.();
    // After the refresh the cache is empty and the reading falls back to the
    // refresh marker the server just wrote — i.e. "as of now", which is what
    // the next lazy fetch will actually deliver.
    await reload();
    btn.classList.remove("spinning");
    btn.classList.add("success");
    btn.innerHTML = icon("check");
    btn.title = opts.labels().done;
    setTimeout(() => {
      btn.classList.remove("success");
      btn.innerHTML = icon("refresh-cw");
      btn.disabled = false;
      btn.title = opts.labels().title;
    }, 2000);
  });

  onLocaleChange(render);
  void reload();
}
