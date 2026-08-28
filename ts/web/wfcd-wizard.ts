// Port of web/wfcd-wizard.js. WFCD auto-generation import wizard.
//
// Backend (/api/wfcd/generate, /api/wfcd/import — server/wfcdgen.ts/wfcd.ts)
// is fully wired on the TS server; /api/wfcd/generate is hard-restricted to
// nodeType Frame|Weapon|Quest server-side (main.ts) — Companion/Archwing/
// Necramech deliberately don't get a Chain View node at all, only a
// Collections entry (see loadouts.ts's add-item-btn handler comment).

import type { Node } from "../server/model.ts";
import { el } from "./dom.ts";
import { icon } from "./icons.ts";
import { questJa } from "./quest-i18n.ts";
import { itemJa } from "./item-i18n.ts";
import { locationJa } from "./location-i18n.ts";
import { loadGraph, loadReport, state } from "./graph-state.ts";
import { autoLinkId, forcePushToCollections } from "./wfcd-autolink.ts";
import { NODE_TYPE_LABEL_JA } from "./node-modal.ts";

// Shape of a /api/wfcd/generate response. Ported ahead of pkg/wfcdgen
// itself (Phase 11) — refine/replace with the real generated type once that
// package is ported; kept local here in the meantime rather than blocking
// on it.
interface RelicCandidate {
  name: string;
  chance: number;
  isRelic: boolean;
  vaulted?: boolean;
}
interface WfcdPart {
  node: Node;
  relicCandidates?: RelicCandidate[];
}
interface SyndicateRankSuggestion {
  node: Node;
  standing: number;
}
interface WfcdSuggestion {
  paradigm: string;
  richLich?: string;
  archetype?: string;
  root: Node;
  parts?: WfcdPart[];
  syndicateRank?: SyndicateRankSuggestion;
  questChain?: Node[];
}

interface RelicStatusResponse {
  vaulted?: boolean;
  missionCount?: number;
}

let wfcdSuggestion: WfcdSuggestion | null = null;

// /api/wfcd/generate's server-side type restriction (main.ts) — the only
// values <select id="wfcd-node-type"> may hold. Labels come from
// NODE_TYPE_LABEL_JA (node-modal.ts's create/edit form) instead of being
// hardcoded a second time in index.html's static markup, so this dropdown
// can't drift back out of sync with the rest of the app's Japanese labels
// (2026-08-27 fix — it had silently stayed on raw English option text
// through the 2026-08-25 item 30 Japanese-labeling pass).
const WFCD_GEN_NODE_TYPES = ["Frame", "Weapon", "Quest"] as const;
el<HTMLSelectElement>("wfcd-node-type").innerHTML = WFCD_GEN_NODE_TYPES.map(
  (t) => `<option value="${t}">${NODE_TYPE_LABEL_JA[t] ?? t}</option>`,
).join("");

// Companion/Archwing/Necramechの英字表記はweb/loadouts.html/tsの種別
// プルダウン・見出し文言と同じもの（「相棒」等の和訳を独自に当てない——
// のっち指摘、2026-08-28: そのカテゴリの呼称は元々アプリ内で英字のまま
// 統一されている）をそのまま踏襲する。
// 登録先の誘導（Loadoutsの＋アイコンから...）は蛇足と判断し削除（のっち
// 指摘、2026-08-28）——「ここには無い」という事実だけ伝われば足りる。
el("wfcd-note").innerHTML = `${icon("triangle-alert", { size: 13 })}<span>Companion/Archwing/Necramechはこの一覧にありません（Chain Viewのノードを持たない仕様）。</span>`;

// Reference data pool for the name-field keyword filter, swapped per node
// type (Frame/Weapon/Quest) — same pattern as the Loadouts/Collections
// weapon-name combobox (2026-08-23).
const wfcdGenRefData: Record<string, string[]> = { Frame: [], Weapon: [], Quest: [] };
async function loadWfcdGenRefData(): Promise<void> {
  try {
    const [frames, weapons, quests] = await Promise.all([
      fetch("/api/reference/frames").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/weapons").then((r) => r.json() as Promise<string[]>),
      fetch("/api/reference/quests").then((r) => r.json() as Promise<string[]>),
    ]);
    wfcdGenRefData.Frame = frames;
    wfcdGenRefData.Weapon = weapons;
    wfcdGenRefData.Quest = quests;
  } catch (e) {
    console.warn("WFCD参照データの取得に失敗（自由入力は引き続き可能）", e);
  }
}
void loadWfcdGenRefData();

const wfcdNameInput = el<HTMLInputElement>("wfcd-name");
const wfcdNameSuggest = el("wfcd-name-suggest");
function hideWfcdNameSuggest(): void {
  wfcdNameSuggest.classList.add("hidden");
}
function updateWfcdNameSuggest(): void {
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  const pool = wfcdGenRefData[nodeType] ?? [];
  const q = wfcdNameInput.value.trim().toLowerCase();
  if (!q) {
    hideWfcdNameSuggest();
    return;
  }

  // Only Quest also keyword-matches the Japanese name (QUEST_JA). The value
  // actually sent stays the WFCD English name (/api/wfcd/generate requires
  // an exact match).
  const matches = pool
    .filter((n) => {
      if (n.toLowerCase().includes(q)) return true;
      return nodeType === "Quest" && questJa(n) !== n && questJa(n).toLowerCase().includes(q);
    })
    .slice(0, 30);
  if (!matches.length) {
    wfcdNameSuggest.innerHTML = `<div class="suggest-empty">一致なし（このまま自由入力できます）</div>`;
  } else {
    wfcdNameSuggest.innerHTML = matches
      .map((n) => {
        const label = nodeType === "Quest" && questJa(n) !== n ? `${questJa(n)}（${n}）` : n;
        return `<div class="suggest-item" data-value="${n.replace(/"/g, "&quot;")}">${label}</div>`;
      })
      .join("");
    wfcdNameSuggest.querySelectorAll(".suggest-item").forEach((itemEl) => {
      itemEl.addEventListener("mousedown", (e) => {
        // fires before blur
        e.preventDefault();
        wfcdNameInput.value = (itemEl as HTMLElement).dataset.value ?? "";
        hideWfcdNameSuggest();
      });
    });
  }
  wfcdNameSuggest.classList.remove("hidden");
}
wfcdNameInput.addEventListener("input", updateWfcdNameSuggest);
wfcdNameInput.addEventListener("focus", updateWfcdNameSuggest);
wfcdNameInput.addEventListener("blur", () => setTimeout(hideWfcdNameSuggest, 150));
el("wfcd-node-type").addEventListener("change", () => {
  wfcdNameInput.value = "";
  hideWfcdNameSuggest();
});

el("wfcd-import-btn").addEventListener("click", () => {
  el("wfcd-preview").innerHTML = "";
  el("wfcd-modal-import").style.display = "none";
  wfcdSuggestion = null;
  el("wfcd-modal-backdrop").classList.remove("hidden");
});
el("wfcd-modal-cancel").addEventListener("click", () => {
  el("wfcd-modal-backdrop").classList.add("hidden");
});

el("wfcd-fetch-btn").addEventListener("click", async () => {
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  const name = el<HTMLInputElement>("wfcd-name").value.trim();
  const preview = el("wfcd-preview");
  el("wfcd-modal-import").style.display = "none";
  if (!name) {
    alert("名前を入力して");
    return;
  }
  preview.innerHTML = `<div class="empty">取得中…</div>`;
  const res = await fetch(`/api/wfcd/generate?nodeType=${encodeURIComponent(nodeType)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    preview.innerHTML = `<div class="empty">見つかりませんでした（WFCD側の名前と完全一致している必要があります）</div>`;
    return;
  }
  wfcdSuggestion = (await res.json()) as WfcdSuggestion;
  renderWfcdPreview();
  el("wfcd-modal-import").style.display = "";
});

function renderWfcdPreview(): void {
  const s = wfcdSuggestion!;
  const preview = el("wfcd-preview");
  const parts = (s.parts ?? [])
    .map((p, i) => {
      // 縦に長くなりがちなカード一覧をやめてネイティブ<select>に変更
      // （のっち指摘、2026-08-28）。Vault済みバッジ（アイコン付き）は
      // <option>に差し込めないため、テキストの「・Vault済み」に格下げ。
      //
      // 同じレリックが精錬度（無精錬/上鍛錬/超鍛錬/完全鍛錬）ごとに違う
      // ドロップ率で複数エントリ持つことがある（例: Uncommon枠なら
      // 11/13/17/20%の4本、Rare枠なら2/4/6/10%の4本——WFCDの生データを
      // そのまま列挙すると「同じレリックが%違いで何回も出てくる」ように
      // 見えて紛らわしい、とののっち指摘、2026-08-28）。value（元の
      // relicCandidates配列のindex）は変えず、表示だけレリック名で
      // optgroupにまとめる。
      const grouped = new Map<string, { c: RelicCandidate; idx: number }[]>();
      (p.relicCandidates ?? []).forEach((c, ci) => {
        const arr = grouped.get(c.name);
        if (arr) arr.push({ c, idx: ci });
        else grouped.set(c.name, [{ c, idx: ci }]);
      });
      const candidateOptions = Array.from(grouped.entries())
        .map(([name, entries]) => {
          const jaName = locationJa(name);
          if (entries.length === 1) {
            const { c, idx } = entries[0]!;
            const kindText = c.isRelic ? "・レリック" : "・通常ミッション";
            const vaultedText = c.vaulted ? "・Vault済み" : "";
            return `<option value="${idx}">${jaName}（${c.chance}%${kindText}${vaultedText}）</option>`;
          }
          const inner = entries
            .map(({ c, idx }) => `<option value="${idx}">${c.chance}%${c.vaulted ? "・Vault済み" : ""}</option>`)
            .join("");
          return `<optgroup label="${jaName}">${inner}</optgroup>`;
        })
        .join("");
      return `
      <div class="wfcd-part">
        <div class="part-name">${itemJa(p.node.name)}</div>
        ${
          (p.relicCandidates ?? []).length
            ? `<label style="margin:0 0 2px;">入手先（1つ選択、OR関係なのでどれか1つでよい。レリックとは限らず通常ミッションのドロップも含む）</label>
             <select data-part-value="${i}">
               <option value="">（未選択）</option>
               ${candidateOptions}
             </select>
             <div class="wfcd-relic-info" data-relic-info="${i}"></div>`
            : `<div class="empty">WFCD側にこのパーツの入手先データなし（既定素材として通常のミッション/敵ドロップで入手する想定）</div>`
        }
      </div>`;
    })
    .join("");

  const syndicateRow = s.syndicateRank
    ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-syndicate-check" checked style="margin-top:3px;">
        <span>シンジケートランクを前提条件として追加: <b>${s.syndicateRank.node.name}</b>（購入コスト ${s.syndicateRank.standing.toLocaleString()} standing）</span>
      </label>
    </div>`
    : "";

  const questChain = s.questChain
    ? `
    <div class="wfcd-part">
      <div class="part-name">前提クエストチェーン（Wiki要約ベース、精度は目視要確認）</div>
      ${
        s.questChain.length > 1
          ? `<div class="ph-row">${s.questChain.map((n) => n.name).join(" → ")}</div>`
          : `<div class="empty">本表に前提クエストの登録なし（単体で追加されます）</div>`
      }
    </div>`
    : "";

  // A node that's only added doesn't attach to any Build's contains, so it
  // never shows up in Chain View's Build-rooted BFS display ("doesn't feel
  // like it took effect" report, 2026-08-23). When the currently-selected
  // Build is known, offer to auto-attach it to that Build's contains.
  const currentBuild = state.graph?.nodes?.[state.report?.buildId ?? ""];
  const attachRow = currentBuild
    ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-attach-check" checked style="margin-top:3px;">
        <span>現在のBuild「<b>${currentBuild.name}</b>」のcontainsに追加する（チェックを外すと種別がGoalになり、単独の探索起点として左サイドバーの一覧から辿れます）</span>
      </label>
    </div>`
    : `
    <div class="wfcd-part"><div class="empty">現在選択中のBuildがないため、このまま追加すると種別がGoalになり、単独の探索起点として左サイドバーの一覧から辿れます</div></div>`;

  // Reverse propagation to Loadouts (2026-08-25 item 27). Chain View's Node
  // types have no Companion/Archwing/Necramech (and WFCD auto-generation only
  // covers Frame/Weapon/Quest), so this is Frame/Weapon only. Chain View's
  // main purpose is tracking not-yet-owned items, so the checkbox defaults
  // unchecked — the opposite default from Loadouts' own registration
  // (owned:true). Collections gets pushed unconditionally either way
  // (see the import handler below), independent of this checkbox.
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  const loadoutsRow =
    nodeType === "Frame" || nodeType === "Weapon"
      ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-loadouts-check" style="margin-top:3px;">
        <span>Loadoutsにも追加する（MOD構成の管理対象にする、任意）</span>
      </label>
    </div>`
      : "";

  preview.innerHTML = `
    <div class="ph-row" style="margin-top:10px;"><b>パラダイム:</b> ${s.paradigm}</div>
    ${s.richLich ? `<div class="ph-row"><b>リッチ系:</b> ${s.richLich}</div>` : ""}
    ${s.archetype ? `<div class="ph-row"><b>アーキタイプ:</b> ${s.archetype}</div>` : ""}
    <div class="ph-row"><b>本体ノード:</b> ${s.root.name}（${s.root.id}）</div>
    ${attachRow}
    ${loadoutsRow}
    ${syndicateRow}
    ${questChain}
    ${parts}
  `;

  // 入手先で選んだレリックの現在のドロップ状況を件数だけ表示（のっち依頼、
  // 2026-08-28）。フルの入手ミッション一覧は1レリックあたり8〜127件
  // （中央値80件）と実用的な量を超えるため、件数のみに絞った経緯は
  // /api/wfcd/relic-status（server/wfcd.tsのrelicMissionCount）参照。
  preview.querySelectorAll<HTMLSelectElement>("[data-part-value]").forEach((sel) => {
    const partIdx = Number(sel.dataset.partValue);
    sel.addEventListener("change", () => void updateRelicInfo(partIdx, sel));
  });
}

async function updateRelicInfo(partIdx: number, sel: HTMLSelectElement): Promise<void> {
  const info = document.querySelector<HTMLElement>(`[data-relic-info="${partIdx}"]`);
  if (!info) return;
  // sel.value === "" for the "（未選択）" placeholder — Number("") is 0, not
  // NaN, so skipping this check would silently re-fetch candidate index 0's
  // info instead of clearing (real bug hit testing this, 2026-08-28).
  const candidate = sel.value === "" ? undefined : wfcdSuggestion?.parts?.[partIdx]?.relicCandidates?.[Number(sel.value)];
  if (!candidate || !candidate.isRelic) {
    info.textContent = "";
    return;
  }
  info.textContent = "確認中…";
  try {
    const res = await fetch(`/api/wfcd/relic-status?name=${encodeURIComponent(candidate.name)}`);
    const data = res.ok ? ((await res.json()) as RelicStatusResponse) : null;
    if (!data) {
      info.textContent = "";
      return;
    }
    info.textContent = data.vaulted ? "Vault済み（現在のミッションドロップ対象外）" : `現在${data.missionCount ?? 0}ミッションでドロップ中`;
  } catch {
    info.textContent = "";
  }
}

el("wfcd-modal-import").addEventListener("click", async () => {
  if (!wfcdSuggestion) return;
  const nodes: Record<string, unknown>[] = [];
  const root: Record<string, unknown> = { ...wfcdSuggestion.root };

  const attachCheck = document.getElementById("wfcd-attach-check") as HTMLInputElement | null;
  const currentBuild = state.graph?.nodes?.[state.report?.buildId ?? ""];
  const willAttach = !!(attachCheck?.checked && currentBuild);
  // Not attaching to the current Build makes it Goal, an independent root.
  // Leaving it as its raw type (Frame/Weapon/Quest) would orphan it — not
  // reachable from any Build/Goal's contains/requires, so it would never
  // show up in Chain View's Build-rooted BFS display (2026-08-23; changed
  // to Goal on 2026-08-25).
  if (!willAttach) root.type = "Goal";

  nodes.push(root);

  // Quest chain: add every prerequisite quest node other than root as-is
  // (each node's requires already points at its prerequisite quest, set by
  // BuildQuestSuggestion server-side).
  (wfcdSuggestion.questChain ?? []).forEach((n) => {
    if (n.id !== root.id) nodes.push({ ...n });
  });

  // Syndicate rank: if checked, add the rank node and wire it into root's requires.
  if (wfcdSuggestion.syndicateRank) {
    const check = document.getElementById("wfcd-syndicate-check") as HTMLInputElement | null;
    if (check?.checked) {
      const rankNode = wfcdSuggestion.syndicateRank.node;
      if (!nodes.find((n) => n.id === rankNode.id)) {
        nodes.push({ ...rankNode, requires: rankNode.requires ?? [], contains: rankNode.contains ?? [] });
      }
      root.requires = [...((root.requires as string[] | undefined) ?? []), rankNode.id];
    }
  }

  (wfcdSuggestion.parts ?? []).forEach((p, i) => {
    const partNode: Record<string, unknown> = { ...p.node, requires: [] };
    const sel = document.querySelector<HTMLSelectElement>(`[data-part-value="${i}"]`);
    const chosenIdx = sel ? sel.value : "";
    if (chosenIdx !== "" && p.relicCandidates) {
      const candidate = p.relicCandidates[Number(chosenIdx)];
      if (candidate?.isRelic) {
        // Relic-sourced: create a separate node as the thing to be cracked,
        // wired via requires (unchanged).
        const relicId = `relic-${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
        if (!nodes.find((n) => n.id === relicId)) {
          nodes.push({ id: relicId, name: candidate.name, type: "Relic", requires: [], contains: [] });
        }
        partNode.requires = [relicId];
      } else if (candidate) {
        // Normal-mission/assassination drop: there's no "crack this" node
        // like a relic, so no requires link — just record the source in the
        // part's note.
        partNode.note = `入手先: ${candidate.name}`;
      }
    }
    nodes.push(partNode);
  });

  await fetch("/api/wfcd/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes }) });

  // Cross-page linking (2026-08-25 item 27): Loadouts is optional (checkbox,
  // Frame/Weapon only), Collections is always forced regardless (skips if a
  // same-name entry already exists). Chain-View-origin creates it
  // owned:false — "track something not yet owned" is the point here, the
  // opposite default from Loadouts' own registration (owned:true). Neither
  // path ever has the user pick an id/name.
  const nodeType = el<HTMLSelectElement>("wfcd-node-type").value;
  if (nodeType === "Frame" || nodeType === "Weapon") {
    const loadoutsCheck = document.getElementById("wfcd-loadouts-check") as HTMLInputElement | null;
    if (loadoutsCheck?.checked) {
      await fetch("/api/loadout-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: autoLinkId("item"),
          name: root.name,
          type: nodeType,
          configs: { A: [], B: [], C: [] },
          note: "",
          chainViewNodeId: root.id,
        }),
      });
    }
    await forcePushToCollections(nodeType, root.name as string, false);
  }

  // Attach to the current Build's contains (only when willAttach is true).
  let attached = false;
  if (willAttach && currentBuild && !(currentBuild.contains ?? []).includes(root.id as string)) {
    const updatedBuild = { ...currentBuild, contains: [...(currentBuild.contains ?? []), root.id as string] };
    await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedBuild) });
    attached = true;
  }

  el("wfcd-modal-backdrop").classList.add("hidden");
  await loadGraph();
  if (state.focus) await loadReport();
  alert(
    attached
      ? `「${root.name}」を追加し、現在のBuildのcontainsに繋げました。`
      : `「${root.name}」をGoalとして追加しました。左サイドバーの一覧から単独の探索起点として辿れます。既存のBuildのcontainsに含めたい場合は、そのBuildノードを編集して手動で追加してください。`,
  );
});
