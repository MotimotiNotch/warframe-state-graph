// Port of web/inspector.js. Right-side node detail panel.

import { el } from "./dom.ts";
import { gameIcon, icon } from "./icons.ts";
import { STATE_COLOR, STATE_LABEL_JA, loadReport, refreshGraph, state } from "./graph-state.ts";
import { refreshSidebar } from "./build-sidebar.ts";
import { NODE_TYPE_LABEL_JA, openNodeModal } from "./node-modal.ts";
import type { Counter } from "../server/model.ts";
import { createLiveEditor } from "./notemd.ts";
import { nodeDisplayName } from "./quest-i18n.ts";
import { showToast } from "./toast.ts";

function genCounterId(): string {
  return `counter-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

interface RelicStatusResponse {
  vaulted?: boolean;
}
interface I18nResponse {
  name?: string;
}
interface ResurgenceInventoryEntry {
  item?: string;
}
interface ResurgenceResponse {
  inventory?: ResurgenceInventoryEntry[];
  expiry?: string;
}

export function renderPanel(): void {
  const panel = el("panel-body");
  if (!state.selected) {
    panel.innerHTML = `<div class="empty">ノードを選択してください</div>`;
    return;
  }
  const node = state.report!.nodes[state.selected]!;
  const isRoot = state.selected === state.report!.buildId;
  const stateLabel = isRoot ? "起点" : (STATE_LABEL_JA[node.state] ?? node.state);
  const badgeColor = isRoot ? STATE_COLOR.ROOT : STATE_COLOR[node.state];

  panel.innerHTML = `
    <div class="ph-name">${nodeDisplayName(node)} <span style="color:var(--muted);font-weight:400;font-size:.75em;" title="ノードID">(${state.selected})</span> <span id="i18n-name" style="color:var(--muted);font-weight:400;font-size:.85em;"></span></div>
    <div class="ph-row">種別: ${NODE_TYPE_LABEL_JA[node.type] ?? node.type}${node.type === "Relic" ? `<span id="vault-badge"></span>` : ""}</div>
    <div class="ph-state" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}">${stateLabel}</div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
      ${isRoot ? "" : `<button class="toggle" id="toggle-btn">${node.satisfied ? "取り消す" : "達成にする"}</button>`}
      ${node.masteryTrack ? `<button class="toggle" id="gild-btn" style="${node.gilded ? "border-color:var(--satisfied);color:var(--satisfied);" : ""}">${node.gilded ? "メッキ済み" : "メッキする"}</button>` : ""}
      <button class="toggle" id="edit-btn">編集</button>
      ${
        node.type === "Build" || node.type === "Goal"
          ? `<button class="toggle" id="archive-btn">${node.archived ? "アーカイブ解除" : "アーカイブする"}</button>`
          : ""
      }
    </div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
      <button class="toggle" id="add-requires-btn">前提を追加</button>
      <button class="toggle" id="add-contains-btn">中身を追加</button>
      <button class="toggle" id="reparent-btn">付け替え</button>
      <button class="toggle" id="detach-btn">独立させる</button>
    </div>
    <div id="reparent-form" class="hidden" style="margin-top:6px;padding:8px;border:1px solid var(--border);border-radius:8px;">
      <div class="ph-row" style="opacity:.8;margin:0 0 6px;">このノード（中身も含めて丸ごと）を、指定したIDのノードの下へ移動します。現在の繋がりからは外れます。</div>
      <select id="reparent-relation" style="margin-bottom:6px;">
        <option value="contains">中身（contains）として</option>
        <option value="requires">前提（requires）として</option>
      </select>
      <input type="text" id="reparent-target-id" placeholder="移動先ノードのID（8桁）" style="margin-bottom:6px;">
      <div class="actions" style="justify-content:flex-start;">
        <button class="toggle" id="reparent-confirm-btn">実行</button>
        <button class="toggle" id="reparent-cancel-btn">キャンセル</button>
      </div>
    </div>
    <div class="s-section-title">メモ</div>
    <div id="insp-note-editor"></div>
    <div class="s-section-title">カウントアップ</div>
    <div id="insp-counters-body"></div>
    <button id="insp-add-counter-btn" class="add-counter-btn">${icon("plus", { size: 12 })}カウントアップを追加</button>
    <div id="linked-from-section"></div>
  `;

  // "メモ"/"カウントアップ" — same live-markdown editor + count-up widget as
  // the quick-memo panel (scratch.ts), scoped to this node instead of the
  // global scratchpad. Style is shared via scratch.ts's unscoped
  // .note-live-editor/.scratch-counter-row/.add-counter-btn rules
  // (2026-08-27, "クイックメモと同じ感じに" — style unification only, the
  // Inspector's existing buttons above are untouched).
  const nodeIdAtRender = state.selected!;
  createLiveEditor(el("insp-note-editor"), node.note ?? "", async (text) => {
    await fetch(`/api/nodes/${encodeURIComponent(nodeIdAtRender)}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: text }),
    });
    node.note = text;
  });
  renderNodeCounters(nodeIdAtRender, node.counters ?? []);
  el("insp-add-counter-btn").onclick = async () => {
    const c: Counter = { id: genCounterId(), label: "", value: 0 };
    const res = await fetch(`/api/nodes/${encodeURIComponent(nodeIdAtRender)}/counters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    if (res.ok) {
      const updated = (await res.json()) as { counters: Counter[] };
      node.counters = updated.counters;
      if (state.selected === nodeIdAtRender) renderNodeCounters(nodeIdAtRender, node.counters);
    }
  };

  const btn = document.getElementById("toggle-btn") as HTMLButtonElement | null;
  if (btn) {
    btn.onclick = async () => {
      btn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/toggle`, { method: "POST" });
      await refreshGraph();
      await loadReport();
    };
  }

  const gildBtn = document.getElementById("gild-btn") as HTMLButtonElement | null;
  if (gildBtn) {
    gildBtn.onclick = async () => {
      gildBtn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/gild-toggle`, { method: "POST" });
      await refreshGraph();
      await loadReport();
    };
  }

  const archiveBtn = document.getElementById("archive-btn") as HTMLButtonElement | null;
  if (archiveBtn) {
    archiveBtn.onclick = async () => {
      archiveBtn.disabled = true;
      await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/archive-toggle`, { method: "POST" });
      await refreshGraph();
      // Hides/unhides this build in the sidebar (2026-08-27). If this was
      // the currently-viewed build and it just got archived, refreshSidebar()
      // switches the view to the next remaining one (which fires its own
      // loadReport()) — the loadReport() below then just re-renders whatever
      // state.focus ends up being, so it stays correct either way (unchanged
      // view, or the just-switched-to one).
      refreshSidebar();
      await loadReport();
    };
  }

  el("edit-btn").onclick = () => openNodeModal("edit", { ...node, id: state.selected! });
  // Creates a new, already-linked node from the selected node (2026-08-25
  // item 28). The user never searches for a connection target by id/name —
  // node-modal.ts wires the new node's id into this node's requires/contains
  // automatically on save.
  el("add-requires-btn").onclick = () =>
    openNodeModal("create", null, { relation: "requires", parentId: state.selected! });
  el("add-contains-btn").onclick = () =>
    openNodeModal("create", null, { relation: "contains", parentId: state.selected! });

  // "付け替え" (2026-08-29) — moves this node (and everything already
  // nested under it, carried along automatically since a subtree is just
  // ids referenced from this node's own requires/contains) from wherever
  // it's currently linked to a different parent's requires or contains.
  const reparentBtn = document.getElementById("reparent-btn") as HTMLButtonElement | null;
  if (reparentBtn) {
    const form = el("reparent-form");
    reparentBtn.onclick = () => form.classList.remove("hidden");
    el("reparent-cancel-btn").onclick = () => form.classList.add("hidden");
    el("reparent-confirm-btn").onclick = async () => {
      const targetId = el<HTMLInputElement>("reparent-target-id").value.trim();
      const relation = el<HTMLSelectElement>("reparent-relation").value as "requires" | "contains";
      if (!targetId) {
        showToast("移動先ノードのIDを入力して");
        return;
      }
      if (targetId === state.selected) {
        showToast("自分自身へは付け替えできません");
        return;
      }
      const res = await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/reparent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, relation }),
      });
      if (!res.ok) {
        showToast("付け替えに失敗しました（移動先IDが存在するか確認して）");
        return;
      }
      form.classList.add("hidden");
      await refreshGraph();
      refreshSidebar();
      await loadReport();
      showToast(`付け替えました（${relation === "contains" ? "中身" : "前提"}として）`, "success");
    };
  }

  // "独立させる" (2026-08-29) — reparentNode()の逆。今の参照元から外し、
  // Resourceに格下げされていたら左サイドバーの一覧に戻れるようGoalへ戻す。
  const detachBtn = document.getElementById("detach-btn") as HTMLButtonElement | null;
  if (detachBtn) {
    detachBtn.onclick = async () => {
      const res = await fetch(`/api/nodes/${encodeURIComponent(state.selected!)}/detach`, { method: "POST" });
      if (!res.ok) {
        showToast("独立させるのに失敗しました");
        return;
      }
      await refreshGraph();
      refreshSidebar();
      await loadReport();
      showToast("独立させました", "success");
    };
  }

  // Relic node: show a Vault-status badge.
  if (node.type === "Relic") {
    fetch(`/api/wfcd/relic-status?name=${encodeURIComponent(node.name)}`)
      .then((r) => (r.ok ? (r.json() as Promise<RelicStatusResponse>) : null))
      .then((res) => {
        const badge = document.getElementById("vault-badge");
        if (badge && res?.vaulted) badge.innerHTML = `<span class="badge-vaulted">${gameIcon("lorc-padlock")}Vault済み</span>`;
      })
      .catch(() => {});
  }

  // WFCD-auto-generated node (has uniqueName): Japanese name + Prime
  // Resurgence inventory match.
  if (node.uniqueName) {
    fetch(`/api/wfcd/i18n?uniqueName=${encodeURIComponent(node.uniqueName)}`)
      .then((r) => (r.ok ? (r.json() as Promise<I18nResponse>) : null))
      .then((res) => {
        const nameEl = document.getElementById("i18n-name");
        if (nameEl && res?.name) nameEl.textContent = `(${res.name})`;
      })
      .catch(() => {});

    fetch("/api/wfcd/resurgence")
      .then((r) => (r.ok ? (r.json() as Promise<ResurgenceResponse>) : null))
      .then((vt) => {
        if (!vt?.inventory) return;
        const hit = vt.inventory.find((e) => e.item?.toLowerCase().includes(node.name.toLowerCase()));
        if (!hit) return;
        const row = panel.querySelector(".ph-row");
        if (row) {
          row.insertAdjacentHTML(
            "beforeend",
            `<span class="badge-resurgence">${gameIcon("lorc-hourglass")}Resurgence在庫あり(〜${(vt.expiry ?? "").slice(0, 10)})</span>`,
          );
        }
      })
      .catch(() => {});
  }

  void renderLinkedFrom(state.selected);
}

/** Renders/wires the selected node's counters list — same layout and
 * increment/decrement/rename/delete flow as scratch.ts's renderCounters(),
 * just pointed at /api/nodes/:id/counters instead of /api/scratch/counters.
 * `counters` is the live array on the report node (mutated in place so
 * later re-renders from the same renderPanel() call stay in sync). */
function renderNodeCounters(nodeId: string, counters: Counter[]): void {
  const body = document.getElementById("insp-counters-body");
  if (!body) return;
  if (!counters.length) {
    body.innerHTML = `<div class="counters-empty">まだありません</div>`;
    return;
  }
  body.innerHTML = counters
    .map(
      (c) => `
      <div class="scratch-counter-row" data-counter-id="${c.id}">
        <input type="text" class="sc-label-input" placeholder="メモ" value="${escapeHtml(c.label)}">
        <button class="sc-dec" title="-1">${icon("minus", { size: 12 })}</button>
        <input type="number" class="sc-value" value="${c.value}">
        <button class="sc-inc" title="+1">${icon("plus", { size: 12 })}</button>
        <button class="sc-del" title="削除">${icon("x", { size: 12 })}</button>
      </div>
    `,
    )
    .join("");

  body.querySelectorAll<HTMLInputElement>(".sc-label-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: input.value }),
      });
      const c = counters.find((x) => x.id === id);
      if (c) c.label = input.value;
    });
  });
  body.querySelectorAll<HTMLButtonElement>(".sc-inc").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}/increment`, { method: "POST" });
      if (res.ok) {
        const updated = (await res.json()) as Counter;
        const c = counters.find((x) => x.id === id);
        if (c) c.value = updated.value;
        renderNodeCounters(nodeId, counters);
      }
    });
  });
  body.querySelectorAll<HTMLButtonElement>(".sc-dec").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}/decrement`, { method: "POST" });
      if (res.ok) {
        const updated = (await res.json()) as Counter;
        const c = counters.find((x) => x.id === id);
        if (c) c.value = updated.value;
        renderNodeCounters(nodeId, counters);
      }
    });
  });
  body.querySelectorAll<HTMLInputElement>(".sc-value").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      const value = parseInt(input.value, 10) || 0;
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}/value`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Counter;
        const c = counters.find((x) => x.id === id);
        if (c) c.value = updated.value;
        renderNodeCounters(nodeId, counters);
      }
    });
  });
  body.querySelectorAll<HTMLButtonElement>(".sc-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest<HTMLElement>(".scratch-counter-row")!.dataset.counterId!;
      await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/counters/${encodeURIComponent(id)}`, { method: "DELETE" });
      const idx = counters.findIndex((x) => x.id === id);
      if (idx !== -1) counters.splice(idx, 1);
      renderNodeCounters(nodeId, counters);
    });
  });
}

interface LoadoutItemLike {
  name: string;
  chainViewNodeId?: string;
}
interface BuildSetLike {
  name: string;
  chainViewBuildId?: string;
}
interface LoadoutsResponse {
  items?: Record<string, LoadoutItemLike>;
  buildSets?: Record<string, BuildSetLike>;
}
interface CollectionEntryLike {
  name?: string;
  weaponName?: string;
  chainViewNodeId?: string;
}
type CollectionsResponse = Record<string, Record<string, CollectionEntryLike> | number | undefined>;

const COLLECTION_CATEGORIES_JA: Record<string, string> = {
  rivens: "Riven",
  kuva: "Kuva/Tenet/Coda",
  frames: "フレーム",
  weapons: "武器",
  companions: "コンパニオン",
  archwings: "Archwing",
  necramechs: "Necramech",
  incarnons: "インカーノン",
};

// Reverse of Loadouts/Collections' minigraph "click a dot to jump here"
// (2026-08-26) — this node may itself be linked *from* one or more
// Items/BuildSets/collection entries; list them so a normal "I'm looking at
// this node, where's it actually used" question doesn't require manually
// hunting through both other pages. Fetches the same full documents those
// pages load themselves (small personal-tool-sized data, a full scan is
// cheap) rather than adding a dedicated reverse-index endpoint.
async function renderLinkedFrom(forNodeId: string): Promise<void> {
  const [loadouts, collections] = await Promise.all([
    fetch("/api/loadouts").then((r) => (r.ok ? (r.json() as Promise<LoadoutsResponse>) : null)),
    fetch("/api/collections").then((r) => (r.ok ? (r.json() as Promise<CollectionsResponse>) : null)),
  ]).catch(() => [null, null]);
  // The user may have selected a different node (or none) by the time these
  // two fetches resolve — a stale result must not overwrite whatever's
  // actually showing now.
  if (state.selected !== forNodeId) return;
  const section = document.getElementById("linked-from-section");
  if (!section) return;

  const links: { label: string; href: string }[] = [];
  for (const item of Object.values(loadouts?.items ?? {})) {
    if (item.chainViewNodeId === forNodeId) links.push({ label: `${item.name}（Loadouts Item）`, href: "/loadouts.html" });
  }
  for (const set of Object.values(loadouts?.buildSets ?? {})) {
    if (set.chainViewBuildId === forNodeId) links.push({ label: `${set.name}（Loadouts BuildSet）`, href: "/loadouts.html" });
  }
  for (const [key, jaLabel] of Object.entries(COLLECTION_CATEGORIES_JA)) {
    const bucket = collections?.[key];
    if (!bucket || typeof bucket !== "object") continue;
    for (const entry of Object.values(bucket)) {
      if (entry.chainViewNodeId === forNodeId) {
        links.push({ label: `${entry.name ?? entry.weaponName ?? "?"}（Collections ${jaLabel}）`, href: "/collections.html" });
      }
    }
  }

  if (!links.length) {
    section.innerHTML = "";
    return;
  }
  section.innerHTML = `
    <div class="ph-row" style="margin-top:10px;color:var(--muted);font-size:0.78rem;">連携元</div>
    <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">
      ${links.map((l, i) => `<button class="toggle" style="text-align:left;margin-top:0;" data-linked-from-idx="${i}">${l.label}</button>`).join("")}
    </div>
  `;
  section.querySelectorAll<HTMLButtonElement>("[data-linked-from-idx]").forEach((btn) => {
    const href = links[Number(btn.dataset.linkedFromIdx)]!.href;
    btn.onclick = () => {
      window.location.href = href;
    };
  });
}
