// Port of the inline script in web/stats.html.
import type { Node } from "../server/model.ts";
import type { Data as LoadoutData } from "../server/loadout.ts";
import type { Data as StandingData } from "../server/standing.ts";
import type { Planet, Proxima } from "../server/starchart.ts";
import type { Data as StatsData } from "../server/stats.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { questJa } from "./quest-i18n.ts";

// Collections (pkg/collection) is Phase 10 scope, not yet ported — /api/collections
// 404s for now and renderCollectionsAgg falls back to its empty defaults, same
// as every other not-yet-ported cross-page read on this page (accepted
// incompleteness, matches the Loadouts item-27 cross-link pattern). This
// local shape carries only the fields this page's aggregation actually reads.
interface RivenEntry {
  fixed?: boolean;
  favorite?: boolean;
}
interface KuvaEntry {
  owned?: boolean;
  favorite?: boolean;
  kind: "Kuva" | "Tenet" | "Coda";
  weaponName: string;
}
interface FrameEntry {
  owned?: boolean;
  rankedThirty?: boolean;
  helminthFed?: boolean;
}
interface IncarnonEntry {
  obtained?: boolean;
  completed?: boolean;
}
interface CollectionsData {
  rivens: Record<string, RivenEntry>;
  kuva: Record<string, KuvaEntry>;
  frames: Record<string, FrameEntry>;
  incarnons: Record<string, IncarnonEntry>;
}

const state: {
  nodesById: Record<string, Node>;
  loadouts: LoadoutData;
  collections: CollectionsData;
  standing: StandingData;
  planets: Planet[];
  proxima: Proxima[];
  statsData: StatsData;
  allQuests: string[];
  mainQuestNames: string[];
} = {
  nodesById: {},
  loadouts: { schemaVersion: 1, items: {}, buildSets: {} },
  collections: { rivens: {}, kuva: {}, frames: {}, incarnons: {} },
  standing: { schemaVersion: 1, ranks: {}, highestRankReached: {} },
  planets: [],
  proxima: [],
  statsData: {
    schemaVersion: 1,
    planets: {},
    railjackProxima: {},
    railjackIntrinsics: {},
    drifterIntrinsics: {},
    focusInvestment: {},
    focusActiveSchool: "",
    railjackComponents: {},
    railjackPlexusNote: "",
    questsCleared: {},
  },
  allQuests: [],
  mainQuestNames: [],
};

el("refresh-wfcd-btn").innerHTML = icon("refresh-cw");
el("refresh-wfcd-btn").addEventListener("click", async () => {
  const btn = el("refresh-wfcd-btn");
  (btn as HTMLButtonElement).disabled = true;
  btn.classList.add("spinning");
  btn.title = "更新中…";
  await fetch("/api/wfcd/refresh", { method: "POST" });
  // The star chart/Railjack Proxima denominators (per-planet total node
  // count) live in the same cache, so a dedicated starchart-refresh button
  // would be redundant — folded into this one (2026-08-22, feedback).
  await Promise.all([loadPlanets(), loadProxima()]);
  renderStarchart();
  renderProxima();
  btn.classList.remove("spinning");
  btn.classList.add("success");
  btn.innerHTML = icon("check");
  btn.title = "更新完了";
  setTimeout(() => {
    btn.classList.remove("success");
    btn.innerHTML = icon("refresh-cw");
    (btn as HTMLButtonElement).disabled = false;
    btn.title = "新フレーム/新武器の追加や、星図/Proximaのノード数がゲームアップデートに追従してない時に押してください";
  }, 2000);
});

el("help-toggle").innerHTML = icon("info");
el("help-toggle").addEventListener("click", (e) => {
  e.stopPropagation();
  el("help-popover").classList.toggle("hidden");
});
el("help-popover").addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => el("help-popover").classList.add("hidden"));

function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Chain View: per-Build progress (satisfied/total across the requires closure) ----------
// Same logic as minigraph.ts's requires-closure collection (read-only
// aggregation only, so duplicating the logic here is lighter than reusing
// its render-coupled implementation).
function requiresClosureSize(buildId: string): { satisfied: number; total: number } {
  const visited = new Set<string>();
  const stack = [buildId];
  let satisfied = 0;
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id) || !state.nodesById[id]) continue;
    visited.add(id);
    if (state.nodesById[id]!.satisfied) satisfied++;
    (state.nodesById[id]!.requires || []).forEach((r) => stack.push(r));
  }
  return { satisfied, total: visited.size };
}

function renderChainViewAgg(): void {
  const container = el("chainview-agg");
  const builds = Object.values(state.nodesById)
    .filter((n) => n.type === "Build")
    .map((b) => ({ node: b, ...requiresClosureSize(b.id) }))
    .map((b) => ({ ...b, pct: b.total ? Math.round((b.satisfied / b.total) * 100) : 0 }));
  if (!builds.length) {
    container.innerHTML = `<div class="empty">Buildノードがまだありません</div>`;
    return;
  }
  // Least-progressed first (today's most-actionable), name as the stable tie-break (2026-08-22).
  builds.sort((a, b) => a.pct - b.pct || a.node.name.localeCompare(b.node.name));
  container.innerHTML = builds
    .map(
      ({ node, satisfied, total, pct }) =>
        `<div class="tile"><div class="tile-label">${escapeHtml(node.name)}</div><div class="tile-value">${pct}%<span class="unit">(${satisfied}/${total})</span></div></div>`,
    )
    .join("");
}

// ---------- Loadouts ----------
function renderLoadoutsAgg(): void {
  const container = el("loadouts-agg");
  const buildSetCount = Object.keys(state.loadouts.buildSets || {}).length;
  const itemCount = Object.keys(state.loadouts.items || {}).length;
  container.innerHTML = `
    <div class="tile"><div class="tile-label">BuildSet数</div><div class="tile-value">${buildSetCount}</div></div>
    <div class="tile"><div class="tile-label">Item数</div><div class="tile-value">${itemCount}</div></div>
  `;
}

// ---------- Collections ----------
function renderCollectionsAgg(): void {
  const container = el("collections-agg");
  const rivens = Object.values(state.collections.rivens || {});
  const kuva = Object.values(state.collections.kuva || {});
  const frames = Object.values(state.collections.frames || {});
  const incarnons = Object.values(state.collections.incarnons || {});

  const rivenFixed = rivens.filter((r) => r.fixed).length;
  // Unowned entries (a Lich/Sister still being hunted) don't count (same
  // owned!=registered distinction as frames/incarnons, found 2026-08-22).
  // Also counts "distinct originals" (unique by weapon name) rather than
  // copies — owning multiple of the same weapon still counts as one kind;
  // copy count itself (how many are held back as Valence Fusion fodder etc.)
  // is a separate concern the Collections grouped-card "×N" badge covers.
  const kuvaByKind: Record<"Kuva" | "Tenet" | "Coda", number> = { Kuva: 0, Tenet: 0, Coda: 0 };
  const kuvaOwnedNamesByKind: Record<"Kuva" | "Tenet" | "Coda", Set<string>> = {
    Kuva: new Set(),
    Tenet: new Set(),
    Coda: new Set(),
  };
  kuva.forEach((k) => {
    if (k.owned && kuvaOwnedNamesByKind[k.kind]) kuvaOwnedNamesByKind[k.kind].add(k.weaponName);
  });
  (Object.keys(kuvaByKind) as (keyof typeof kuvaByKind)[]).forEach((kind) => {
    kuvaByKind[kind] = kuvaOwnedNamesByKind[kind].size;
  });
  // Favorite isn't filtered by owned(true) — Kuva/Tenet/Coda favorites can
  // legitimately mark a Lich/Sister still being hunted as a priority target,
  // not just a post-acquisition Valence Fusion pick, so unowned entries are
  // deliberately included (2026-08-22, confirmed with the owner — left as-is, not a bug).
  const favoriteCount = rivens.filter((r) => r.favorite).length + kuva.filter((k) => k.favorite).length;
  const framesOwned = frames.filter((f) => f.owned).length;
  const framesRanked30 = frames.filter((f) => f.rankedThirty).length;
  const framesHelminth = frames.filter((f) => f.helminthFed).length;
  const incarnonObtained = incarnons.filter((i) => i.obtained).length;
  const incarnonCompleted = incarnons.filter((i) => i.completed).length;

  container.innerHTML = `
    <div class="tile"><div class="tile-label">Riven</div><div class="tile-value">${rivens.length}<span class="unit">件</span></div></div>
    <div class="tile"><div class="tile-label">Riven FIX済み</div><div class="tile-value">${rivenFixed} / ${rivens.length}</div></div>
    <div class="tile"><div class="tile-label">Kuva</div><div class="tile-value">${kuvaByKind.Kuva}</div></div>
    <div class="tile"><div class="tile-label">Tenet</div><div class="tile-value">${kuvaByKind.Tenet}</div></div>
    <div class="tile"><div class="tile-label">Coda</div><div class="tile-value">${kuvaByKind.Coda}</div></div>
    <div class="tile"><div class="tile-label">お気に入り総数</div><div class="tile-value">${favoriteCount}</div></div>
    <div class="tile"><div class="tile-label">フレーム入手</div><div class="tile-value">${framesOwned}</div></div>
    <div class="tile"><div class="tile-label">ランク30済み</div><div class="tile-value">${framesRanked30} / ${framesOwned}</div></div>
    <div class="tile"><div class="tile-label">ヘルミンス済み</div><div class="tile-value">${framesHelminth} / ${framesOwned}</div></div>
    <div class="tile"><div class="tile-label">インカーノン取得済み</div><div class="tile-value">${incarnonObtained}</div></div>
    <div class="tile"><div class="tile-label">インカーノン済み</div><div class="tile-value">${incarnonCompleted} / ${incarnonObtained}</div></div>
  `;
}

// ---------- Standing ----------
function renderStandingAgg(): void {
  const container = el("standing-agg");
  const highest = Object.values(state.standing.highestRankReached || {});
  const ranks = Object.values(state.standing.ranks || {});
  const maxCount = highest.filter((r) => r >= 5).length;
  const negativeCount = ranks.filter((r) => r < 0).length;
  container.innerHTML = `
    <div class="tile"><div class="tile-label">最高到達Max</div><div class="tile-value">${maxCount} / ${highest.length}</div></div>
    <div class="tile"><div class="tile-label">現在マイナス圏</div><div class="tile-value">${negativeCount}</div></div>
  `;
}

// ---------- Star Chart / Steel Path ----------
// Same "+ button + direct edit" feel as the quick-memo counters
// (scratch.ts), just clamped to each planet's denominator (nodeCount)
// (2026-08-22, owner-specified — a "-" button was explicitly declined, + only).
function planetProgressCellHtml(planetKey: string, field: "cleared" | "steelPathCleared", value: number, max: number): string {
  return `
    <div class="num-stepper">
      <input type="number" inputmode="numeric" class="num-input" min="0" max="${max}" data-planet="${escapeHtml(planetKey)}" data-field="${field}" value="${value}">
      <button class="icon-btn num-inc" data-planet="${escapeHtml(planetKey)}" data-field="${field}" title="+1">${icon("plus")}</button>
      <span class="planet-denom">/ ${max}</span>
    </div>`;
}

// /api/starchart/planets Key -> Japanese label. Only translates entries
// verified against wikiwiki.jp/warframe's "星系" page; unverified (newer)
// areas (Zariman/1999/Tau/Sanctuary/DeepSpace etc.) stay in English (same
// "don't write an unconfirmed translation as settled fact" policy as QUEST_JA).
const PLANET_JA: Record<string, string> = {
  Mercury: "水星",
  Venus: "金星",
  Earth: "地球",
  Mars: "火星",
  Phobos: "フォボス",
  Ceres: "ケレス",
  Jupiter: "木星",
  Europa: "エウロパ",
  Saturn: "土星",
  Uranus: "天王星",
  Neptune: "海王星",
  Pluto: "冥王星",
  Sedna: "セドナ",
  Eris: "エリス",
  Void: "VOID",
  Moon: "ルア",
  Fortress: "KUVA要塞",
  SolarMapDeimosName: "ダイモス",
};
function planetJa(p: Planet): string {
  return PLANET_JA[p.key] || p.displayName;
}

// /api/starchart/proxima Key -> Japanese label. Verified against
// wikiwiki.jp/warframe's "エンペリアン" page (2026-08-22, Update 29.10 entries).
const PROXIMA_JA: Record<string, string> = {
  Earth: "地球プロキシマ",
  Venus: "金星プロキシマ",
  Saturn: "土星プロキシマ",
  Neptune: "海王星プロキシマ",
  Pluto: "冥王星プロキシマ",
  DeepSpace: "ヴェールプロキシマ",
};
function proximaJa(p: Proxima): string {
  return PROXIMA_JA[p.key] || p.displayName;
}

// Generic helper: POST to endpoint/{key} and update state.statsData[dataMapKey][key]
// (star chart/Railjack Proxima share the same PlanetProgress shape, 2026-08-22).
async function saveProgress(
  endpoint: string,
  dataMapKey: "planets" | "railjackProxima",
  key: string,
  field: "cleared" | "steelPathCleared",
  value: number,
  max: number,
): Promise<number> {
  const clamped = Math.max(0, Math.min(max, value));
  const progress = { ...(state.statsData[dataMapKey][key] || { cleared: 0, steelPathCleared: 0 }) };
  progress[field] = clamped;
  const res = await fetch(`${endpoint}/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(progress),
  });
  state.statsData = await res.json();
  return clamped;
}
async function savePlanetField(key: string, field: "cleared" | "steelPathCleared", value: number): Promise<number> {
  const planet = state.planets.find((p) => p.key === key);
  return saveProgress("/api/stats/planets", "planets", key, field, value, planet ? planet.nodeCount : value);
}
async function saveProximaField(key: string, field: "cleared" | "steelPathCleared", value: number): Promise<number> {
  const p = state.proxima.find((x) => x.key === key);
  return saveProgress("/api/stats/railjack-proxima", "railjackProxima", key, field, value, p ? p.nodeCount : value);
}

function planetTableHtml(planets: Planet[]): string {
  return `
    <table class="input-table">
      <thead><tr><th>惑星 / システム</th><th>星図</th><th>鋼の道のり</th></tr></thead>
      <tbody>
        ${planets
          .map((p) => {
            const progress = state.statsData.planets[p.key] || { cleared: 0, steelPathCleared: 0 };
            return `
            <tr>
              <td><div class="planet-name">${escapeHtml(planetJa(p))}</div></td>
              <td>${planetProgressCellHtml(p.key, "cleared", progress.cleared, p.nodeCount)}</td>
              <td>
                ${
                  p.steelPathApplicable
                    ? planetProgressCellHtml(p.key, "steelPathCleared", progress.steelPathCleared, p.nodeCount)
                    : `<span class="steel-path-na">対象外</span>`
                }
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function renderStarchart(): void {
  const container = el("starchart-list");
  if (!state.planets.length) {
    container.innerHTML = `<div class="empty">読み込み中…</div>`;
    return;
  }
  // Split into 2 columns (front half/back half) so it doesn't get too tall (2026-08-22, owner-specified).
  const half = Math.ceil(state.planets.length / 2);
  const left = state.planets.slice(0, half);
  const right = state.planets.slice(half);
  container.innerHTML = `
    <div class="starchart-columns">
      ${planetTableHtml(left)}
      ${planetTableHtml(right)}
    </div>
  `;
  container.querySelectorAll<HTMLInputElement>(".num-input").forEach((inp) => {
    inp.addEventListener("blur", async () => {
      inp.value = String(await savePlanetField(inp.dataset.planet!, inp.dataset.field as "cleared" | "steelPathCleared", Number(inp.value) || 0));
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".num-inc").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const inp = container.querySelector<HTMLInputElement>(
        `.num-input[data-planet="${CSS.escape(btn.dataset.planet!)}"][data-field="${btn.dataset.field}"]`,
      )!;
      inp.value = String(
        await savePlanetField(btn.dataset.planet!, btn.dataset.field as "cleared" | "steelPathCleared", (Number(inp.value) || 0) + 1),
      );
    });
  });
}

// ---------- Intrinsics ----------
// Verified against wikiwiki.jp/warframe's "レールジャック/性能値" and
// "漂流者/性能値" pages (2026-08-22). data-intrinsic values must match the
// API key (pkg/stats.RailjackCategories/DrifterCategories' English keys)
// exactly, so they stay in English — only the display label is Japanese.
const INTRINSIC_JA: Record<string, string> = {
  Tactical: "策略",
  Piloting: "操縦",
  Gunnery: "銃砲",
  Engineering: "技術",
  Command: "指揮",
  Combat: "戦闘",
  Riding: "騎乗",
  Opportunity: "好機",
  Endurance: "持久",
};
function renderIntrinsicsGroup(containerId: string, categories: string[], values: Record<string, number>, endpoint: string): void {
  const container = el(containerId);
  container.innerHTML = categories
    .map(
      (cat) => `
    <div class="intrinsic-field">
      <label>${escapeHtml(INTRINSIC_JA[cat] || cat)}（${escapeHtml(cat)}）</label>
      <input type="range" min="0" max="10" step="1" value="${values[cat] || 0}" data-intrinsic="${escapeHtml(cat)}">
      <span class="rank-value" data-intrinsic-value="${escapeHtml(cat)}">${values[cat] || 0}</span>
    </div>
  `,
    )
    .join("");
  container.querySelectorAll<HTMLInputElement>("[data-intrinsic]").forEach((slider) => {
    const valueLabel = container.querySelector(`[data-intrinsic-value="${CSS.escape(slider.dataset.intrinsic!)}"]`)!;
    slider.addEventListener("input", () => {
      valueLabel.textContent = slider.value;
    });
    slider.addEventListener("change", async () => {
      const res = await fetch(`${endpoint}/${encodeURIComponent(slider.dataset.intrinsic!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: Number(slider.value) }),
      });
      state.statsData = await res.json();
    });
  });
}
function renderIntrinsics(): void {
  renderIntrinsicsGroup(
    "railjack-intrinsics",
    ["Tactical", "Piloting", "Gunnery", "Engineering", "Command"],
    state.statsData.railjackIntrinsics || {},
    "/api/stats/railjack",
  );
  renderIntrinsicsGroup(
    "drifter-intrinsics",
    ["Combat", "Riding", "Opportunity", "Endurance"],
    state.statsData.drifterIntrinsics || {},
    "/api/stats/drifter",
  );
}

// ---------- Focus School (5 schools, 3-stage aggregate + active school) ----------
// School names stay in English in the UI too (owner-specified, not localized).
const FOCUS_SCHOOLS = ["Madurai", "Naramon", "Zenurik", "Vazarin", "Unairu"];
const FOCUS_INVESTMENT_LABELS: Record<string, string> = { not_invested: "未投資", in_progress: "投資中", maxed: "フルマックス" };

function renderFocusGrid(): void {
  const container = el("focus-grid");
  container.innerHTML = FOCUS_SCHOOLS.map((school) => {
    const current = (state.statsData.focusInvestment || {})[school] || "not_invested";
    return `
      <div class="focus-field">
        <label>${escapeHtml(school)}</label>
        <select data-focus-school="${escapeHtml(school)}">
          ${Object.entries(FOCUS_INVESTMENT_LABELS)
            .map(([val, label]) => `<option value="${val}" ${val === current ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </div>`;
  }).join("");
  container.querySelectorAll<HTMLSelectElement>("[data-focus-school]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const res = await fetch(`/api/stats/focus/${encodeURIComponent(sel.dataset.focusSchool!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investment: sel.value }),
      });
      state.statsData = await res.json();
    });
  });
}

function renderFocusActiveSelect(): void {
  const select = el<HTMLSelectElement>("focus-active-select");
  const current = state.statsData.focusActiveSchool || "";
  select.innerHTML =
    `<option value="">未設定</option>` +
    FOCUS_SCHOOLS.map((s) => `<option value="${escapeHtml(s)}" ${s === current ? "selected" : ""}>${escapeHtml(s)}</option>`).join("");
  select.addEventListener("change", async () => {
    const res = await fetch("/api/stats/focus-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ school: select.value }),
    });
    state.statsData = await res.json();
  });
}

// ---------- Railjack hull (4 components x House/Grade + Plexus mod note) ----------
const RAILJACK_SLOTS = ["Shield Array", "Engines", "Plating", "Reactor"];
// wikiwiki.jp/warframe-sourced label table (2026-08-20, same direct-write pattern as standing.ts's SYNDICATE_JA).
const RAILJACK_PART_JA: Record<string, string> = { "Shield Array": "シールドアレイ", Engines: "エンジン", Plating: "プレーティング", Reactor: "リアクター" };
const RAILJACK_HOUSES = ["", "Zetki", "Lavan", "Vidar"];
const RAILJACK_HOUSE_JA: Record<string, string> = { Zetki: "ゼットキ", Lavan: "ラバン", Vidar: "ビダール" };
const RAILJACK_GRADES = ["", "Mk I", "Mk II", "Mk III"];

function renderRailjackGrid(): void {
  const container = el("railjack-grid");
  container.innerHTML = RAILJACK_SLOTS.map((slot) => {
    const current = (state.statsData.railjackComponents || {})[slot] || { house: "", grade: "" };
    return `
      <div class="railjack-field">
        <label>${escapeHtml(slot)}（${escapeHtml(RAILJACK_PART_JA[slot] || slot)}）</label>
        <select data-railjack-slot="${escapeHtml(slot)}" data-field="house">
          ${RAILJACK_HOUSES.map((h) => `<option value="${h}" ${h === current.house ? "selected" : ""}>${h ? escapeHtml(RAILJACK_HOUSE_JA[h] || h) : "未設定"}</option>`).join("")}
        </select>
        <select data-railjack-slot="${escapeHtml(slot)}" data-field="grade" style="margin-top:4px;">
          ${RAILJACK_GRADES.map((g) => `<option value="${g}" ${g === current.grade ? "selected" : ""}>${g || "未設定"}</option>`).join("")}
        </select>
      </div>`;
  }).join("");
  container.querySelectorAll<HTMLSelectElement>("[data-railjack-slot]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const slot = sel.dataset.railjackSlot!;
      const houseSel = container.querySelector<HTMLSelectElement>(`[data-railjack-slot="${CSS.escape(slot)}"][data-field="house"]`)!;
      const gradeSel = container.querySelector<HTMLSelectElement>(`[data-railjack-slot="${CSS.escape(slot)}"][data-field="grade"]`)!;
      const res = await fetch(`/api/stats/railjack-component/${encodeURIComponent(slot)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ house: houseSel.value, grade: gradeSel.value }),
      });
      state.statsData = await res.json();
    });
  });
}

function renderRailjackNote(): void {
  const ta = el<HTMLTextAreaElement>("railjack-plexus-note");
  ta.value = state.statsData.railjackPlexusNote || "";
  ta.addEventListener("blur", async () => {
    const res = await fetch("/api/stats/railjack-plexus-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: ta.value }),
    });
    state.statsData = await res.json();
  });
}

// ---------- Railjack Proxima progress ----------
// Split off from the star chart's nodeCount aggregate (2026-08-22). Reuses
// the same PlanetProgress shape (Cleared/SteelPathCleared) as the star
// chart; Steel Path applies to every Proxima (WebSearch-confirmed), so every
// row gets a Steel Path column. Few enough rows that no 2-column split like
// the star chart's is needed.
function renderProxima(): void {
  const container = el("proxima-list");
  if (!state.proxima.length) {
    container.innerHTML = `<div class="empty">読み込み中…</div>`;
    return;
  }
  container.innerHTML = `
    <table class="input-table">
      <thead><tr><th>Proxima</th><th>通常</th><th>鋼の道のり</th></tr></thead>
      <tbody>
        ${state.proxima
          .map((p) => {
            const progress = (state.statsData.railjackProxima || {})[p.key] || { cleared: 0, steelPathCleared: 0 };
            return `
            <tr>
              <td><div class="planet-name">${escapeHtml(proximaJa(p))}</div></td>
              <td>${planetProgressCellHtml(p.key, "cleared", progress.cleared, p.nodeCount)}</td>
              <td>${planetProgressCellHtml(p.key, "steelPathCleared", progress.steelPathCleared, p.nodeCount)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll<HTMLInputElement>(".num-input").forEach((inp) => {
    inp.addEventListener("blur", async () => {
      inp.value = String(await saveProximaField(inp.dataset.planet!, inp.dataset.field as "cleared" | "steelPathCleared", Number(inp.value) || 0));
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".num-inc").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const inp = container.querySelector<HTMLInputElement>(
        `.num-input[data-planet="${CSS.escape(btn.dataset.planet!)}"][data-field="${btn.dataset.field}"]`,
      )!;
      inp.value = String(
        await saveProximaField(btn.dataset.planet!, btn.dataset.field as "cleared" | "steelPathCleared", (Number(inp.value) || 0) + 1),
      );
    });
  });
}

// ---------- Focus/Railjack panel collapse control ----------
// The Stats-owned "did I actually clear this" fact (state layer) is
// independent of Chain View node registration (build-management convenience,
// intent layer) (2026-08-22, pkg/stats.QuestsCleared — replaced the
// Chain-View-derived check after "shouldn't be uncleared just because it's
// not registered in Chain View" feedback). Rising Tide-style cases where one
// prerequisite quest unlocks multiple sections (hull + Intrinsics) mean a
// clear-state change must propagate to every panel referencing that quest.
// Per-section collapse state persists to localStorage (2026-08-22, "let each
// section remember its own state across reloads" feedback) — same pattern as wallpaper.ts/theme.ts.
const COLLAPSE_KEY_PREFIX = "warframe-state-graph:stats:collapsed:";
function getStoredCollapsed(prefix: string): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY_PREFIX + prefix) === "1";
  } catch {
    return false;
  }
}
function setStoredCollapsed(prefix: string, collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY_PREFIX + prefix, collapsed ? "1" : "0");
  } catch {
    /* localStorage unavailable */
  }
}

// For sections with no spoiler gate (aggregate/quest progress/star chart/Intrinsics outer frame).
// Spoiler-gated sections are handled separately by initCollapsiblePanel.
function initPlainCollapsible(prefix: string): void {
  const body = el(`${prefix}-body`);
  const chevron = el(`${prefix}-chevron`);
  chevron.innerHTML = icon("chevron-down");
  const collapsed = getStoredCollapsed(prefix);
  body.classList.toggle("hidden", collapsed);
  chevron.classList.toggle("expanded", !collapsed);
  function toggle(): void {
    const nowHidden = body.classList.toggle("hidden");
    chevron.classList.toggle("expanded", !nowHidden);
    setStoredCollapsed(prefix, nowHidden);
  }
  chevron.addEventListener("click", toggle);
}

const questGatedPanels: Record<string, { prefix: string; revealedTitle: string }[]> = {};

function isQuestCleared(name: string): boolean {
  return !!(state.statsData.questsCleared && state.statsData.questsCleared[name]);
}

// revealedTitle (the real feature name) only appears in the h2/h3 once the
// corresponding quest is cleared. While uncleared it stays a placeholder
// ("未解放セクション") — "this feature name unlocks with this quest" is
// itself a spoiler that collapse-alone can't prevent (2026-08-20, feedback-driven fix).
function revealPanel(prefix: string, revealedTitle: string, cleared: boolean): void {
  const body = el(`${prefix}-body`);
  const chevron = el(`${prefix}-chevron`);
  const titleEl = el(`${prefix}-title`);
  titleEl.textContent = cleared ? revealedTitle : "未解放セクション";
  // Force-closed while uncleared, for spoiler safety (overrides the
  // localStorage preference). Once cleared, restore whatever open/closed
  // state was last chosen (default expanded) from localStorage
  // (2026-08-22, "let each section remember its own state" feedback).
  const collapsed = cleared ? getStoredCollapsed(prefix) : true;
  body.classList.toggle("hidden", collapsed);
  chevron.classList.toggle("expanded", !collapsed);
}

async function setQuestCleared(questName: string, cleared: boolean): Promise<void> {
  state.statsData.questsCleared[questName] = cleared;
  (questGatedPanels[questName] || []).forEach(({ prefix, revealedTitle }) => revealPanel(prefix, revealedTitle, cleared));
  const res = await fetch(`/api/stats/quest/${encodeURIComponent(questName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cleared }),
  });
  state.statsData = await res.json();
  // The main-quest checkbox's server-side prerequisite cascade affects other
  // checkboxes too, so re-render to keep the view in sync with server state
  // (2026-08-22, fixed a bug where forgetting this left the two out of sync).
  renderQuestProgress();
}

// Checking 46 entries one at a time is tedious, so bulk toggles are provided
// (2026-08-22; originally one combined "clear all/uncleared all" pair, split
// into separate main/sub buttons after "main and sub should be separate"
// feedback). Same as setQuestCleared, propagates to every gated panel the
// affected quests own before re-rendering.
async function setQuestGroupCleared(group: "main" | "sub", cleared: boolean): Promise<void> {
  const res = await fetch(`/api/stats/quests/${group}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cleared }),
  });
  state.statsData = await res.json();
  Object.keys(questGatedPanels).forEach((questName) => {
    questGatedPanels[questName]!.forEach(({ prefix, revealedTitle }) => revealPanel(prefix, revealedTitle, isQuestCleared(questName)));
  });
  renderQuestProgress();
}

el("quest-mark-main-cleared").addEventListener("click", () => setQuestGroupCleared("main", true));
el("quest-mark-main-uncleared").addEventListener("click", () => setQuestGroupCleared("main", false));
el("quest-mark-sub-cleared").addEventListener("click", () => setQuestGroupCleared("sub", true));
el("quest-mark-sub-uncleared").addEventListener("click", () => setQuestGroupCleared("sub", false));

// All quest checkboxes live in one place (quest-progress-panel); every
// section's collapse decision reads only this self-report (2026-08-22,
// consolidated from checkboxes previously embedded per-section). Main vs.
// side is judged by membership in questchain.MainStoryChain
// (state.mainQuestNames) (2026-08-22, "main and sub should be separate"
// feedback) — the same basis setQuestCleared's cascade uses, so "counts as
// main = cascade applies" stays consistent.
function isMainQuest(name: string): boolean {
  return state.mainQuestNames.some((m) => m.toLowerCase() === name.toLowerCase());
}

function questRowHtml(name: string): string {
  const cleared = state.statsData.questsCleared || {};
  return `
    <label class="quest-clear-check" title="${escapeHtml(questJa(name))}">
      <input type="checkbox" data-quest-clear="${escapeHtml(name)}" ${cleared[name] ? "checked" : ""}>
      <span>${escapeHtml(questJa(name))}</span>
    </label>`;
}

function renderQuestProgress(): void {
  const container = el("quest-progress-list");
  // Every main+side quest (state.allQuests, from /api/reference/quests)
  // (2026-08-22, "put every main and side quest on it" feedback — previously
  // only keys already in statsData.questsCleared were shown, so a never-checked quest never appeared).
  const quests = state.allQuests && state.allQuests.length ? state.allQuests : Object.keys(state.statsData.questsCleared || {});
  const mainQuests = quests
    .filter((q) => isMainQuest(q))
    .sort(
      (a, b) =>
        state.mainQuestNames.findIndex((m) => m.toLowerCase() === a.toLowerCase()) -
        state.mainQuestNames.findIndex((m) => m.toLowerCase() === b.toLowerCase()),
    );
  const subQuests = quests.filter((q) => !isMainQuest(q)).sort((a, b) => questJa(a).localeCompare(questJa(b), "ja"));
  container.innerHTML = `
    <div class="quest-group-title">メインクエスト</div>
    ${mainQuests.map(questRowHtml).join("")}
    <div class="quest-group-title">サブクエスト</div>
    ${subQuests.map(questRowHtml).join("")}
  `;
  container.querySelectorAll<HTMLInputElement>("[data-quest-clear]").forEach((cb) => {
    cb.addEventListener("change", () => setQuestCleared(cb.dataset.questClear!, cb.checked));
  });
}

function initCollapsiblePanel(prefix: string, questName: string, revealedTitle: string): void {
  const body = el(`${prefix}-body`);
  const chevron = el(`${prefix}-chevron`);
  el(`${prefix}-icon`).innerHTML = icon("triangle-alert", { size: 15 });
  chevron.innerHTML = icon("chevron-down");

  (questGatedPanels[questName] ??= []).push({ prefix, revealedTitle });
  revealPanel(prefix, revealedTitle, isQuestCleared(questName));

  function toggle(): void {
    const nowHidden = body.classList.toggle("hidden");
    chevron.classList.toggle("expanded", !nowHidden);
    // A toggle while force-closed-for-uncleared is outside the spoiler
    // guard's scope (the click itself always works, but the next load force-closes it regardless), so don't persist it.
    if (isQuestCleared(questName)) setStoredCollapsed(prefix, nowHidden);
  }
  el(`${prefix}-toggle`).addEventListener("click", toggle);
  chevron.addEventListener("click", toggle);
}

// ---------- Load ----------
async function loadChainViewNodes(): Promise<void> {
  try {
    const res = await fetch("/api/graph");
    const graph = await res.json();
    state.nodesById = graph.nodes || {};
  } catch {
    state.nodesById = {};
  }
}
async function loadLoadouts(): Promise<void> {
  try {
    const res = await fetch("/api/loadouts");
    state.loadouts = await res.json();
  } catch {
    /* keep defaults */
  }
}
async function loadCollections(): Promise<void> {
  try {
    const res = await fetch("/api/collections");
    state.collections = await res.json();
  } catch {
    /* keep defaults */
  }
}
async function loadStanding(): Promise<void> {
  try {
    const res = await fetch("/api/standing");
    const body = await res.json();
    state.standing = body.data || state.standing;
  } catch {
    /* keep defaults */
  }
}
async function loadPlanets(): Promise<void> {
  try {
    const res = await fetch("/api/starchart/planets");
    state.planets = res.ok ? await res.json() : [];
  } catch {
    state.planets = [];
  }
}
async function loadProxima(): Promise<void> {
  try {
    const res = await fetch("/api/starchart/proxima");
    state.proxima = res.ok ? await res.json() : [];
  } catch {
    state.proxima = [];
  }
}
async function loadStatsData(): Promise<void> {
  try {
    const res = await fetch("/api/stats");
    state.statsData = await res.json();
  } catch {
    /* keep defaults */
  }
}
async function loadAllQuests(): Promise<void> {
  try {
    const res = await fetch("/api/reference/quests");
    state.allQuests = res.ok ? await res.json() : [];
  } catch {
    state.allQuests = [];
  }
}
async function loadMainQuestNames(): Promise<void> {
  try {
    const res = await fetch("/api/reference/main-quests");
    state.mainQuestNames = res.ok ? await res.json() : [];
  } catch {
    state.mainQuestNames = [];
  }
}

Promise.all([
  loadChainViewNodes(),
  loadLoadouts(),
  loadCollections(),
  loadStanding(),
  loadPlanets(),
  loadProxima(),
  loadStatsData(),
  loadAllQuests(),
  loadMainQuestNames(),
]).then(() => {
  renderChainViewAgg();
  renderLoadoutsAgg();
  renderCollectionsAgg();
  renderStandingAgg();
  renderStarchart();
  renderIntrinsics();
  renderFocusGrid();
  renderFocusActiveSelect();
  renderRailjackGrid();
  renderRailjackNote();
  renderProxima();
  initPlainCollapsible("aggregate");
  initPlainCollapsible("quest-progress");
  initPlainCollapsible("starchart");
  initPlainCollapsible("intrinsics");
  initCollapsiblePanel("focus", "The Second Dream", "フォーカス（Focus School）");
  initCollapsiblePanel("railjack", "Rising Tide", "レールジャック（Railjack）");
  initCollapsiblePanel("railjack-intrinsics", "Rising Tide", "レールジャック性能値");
  initCollapsiblePanel("drifter-intrinsics", "The Duviri Paradox", "ドリフター性能値");
  renderQuestProgress();
});
