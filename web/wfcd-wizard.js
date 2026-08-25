// ===== WFCD自動生成インポートウィザード =====
let wfcdSuggestion = null;

// 名前欄のキーワード絞り込み用参照データ。種別（Frame/Weapon/Quest）ごとにプールを切り替える
// （Loadouts/Collectionsの武器名コンボボックスと同じパターン、2026-08-23追加）。
const wfcdGenRefData = { Frame: [], Weapon: [], Quest: [] };
async function loadWfcdGenRefData() {
  try {
    const [frames, weapons, quests] = await Promise.all([
      fetch("/api/reference/frames").then(r => r.json()),
      fetch("/api/reference/weapons").then(r => r.json()),
      fetch("/api/reference/quests").then(r => r.json()),
    ]);
    wfcdGenRefData.Frame = frames;
    wfcdGenRefData.Weapon = weapons;
    wfcdGenRefData.Quest = quests;
  } catch (e) {
    console.warn("WFCD参照データの取得に失敗（自由入力は引き続き可能）", e);
  }
}
loadWfcdGenRefData();

const wfcdNameInput = document.getElementById("wfcd-name");
const wfcdNameSuggest = document.getElementById("wfcd-name-suggest");
function hideWfcdNameSuggest() { wfcdNameSuggest.classList.add("hidden"); }
function updateWfcdNameSuggest() {
  const nodeType = document.getElementById("wfcd-node-type").value;
  const pool = wfcdGenRefData[nodeType] || [];
  const q = wfcdNameInput.value.trim().toLowerCase();
  if (!q) { hideWfcdNameSuggest(); return; }

  // Questのみ日本語名も対象にキーワード一致させる（QUEST_JA、web/quest-i18n.js）。
  // 送信する実際の値は引き続きWFCD側の英語名（/api/wfcd/generateが完全一致要求のため）。
  const matches = pool.filter(n => {
    if (n.toLowerCase().includes(q)) return true;
    return nodeType === "Quest" && questJa(n) !== n && questJa(n).toLowerCase().includes(q);
  }).slice(0, 30);
  if (!matches.length) {
    wfcdNameSuggest.innerHTML = `<div class="suggest-empty">一致なし（このまま自由入力できます）</div>`;
  } else {
    wfcdNameSuggest.innerHTML = matches.map(n => {
      const label = nodeType === "Quest" && questJa(n) !== n ? `${questJa(n)}（${n}）` : n;
      return `<div class="suggest-item" data-value="${n.replace(/"/g, "&quot;")}">${label}</div>`;
    }).join("");
    wfcdNameSuggest.querySelectorAll(".suggest-item").forEach(el => {
      el.addEventListener("mousedown", (e) => { // blurより先に発火させるためmousedown
        e.preventDefault();
        wfcdNameInput.value = el.dataset.value;
        hideWfcdNameSuggest();
      });
    });
  }
  wfcdNameSuggest.classList.remove("hidden");
}
wfcdNameInput.addEventListener("input", updateWfcdNameSuggest);
wfcdNameInput.addEventListener("focus", updateWfcdNameSuggest);
wfcdNameInput.addEventListener("blur", () => setTimeout(hideWfcdNameSuggest, 150));
document.getElementById("wfcd-node-type").addEventListener("change", () => {
  wfcdNameInput.value = "";
  hideWfcdNameSuggest();
});

document.getElementById("wfcd-import-btn").addEventListener("click", () => {
  document.getElementById("wfcd-preview").innerHTML = "";
  document.getElementById("wfcd-modal-import").style.display = "none";
  wfcdSuggestion = null;
  document.getElementById("wfcd-modal-backdrop").classList.remove("hidden");
});
document.getElementById("wfcd-modal-cancel").addEventListener("click", () => {
  document.getElementById("wfcd-modal-backdrop").classList.add("hidden");
});

document.getElementById("wfcd-fetch-btn").addEventListener("click", async () => {
  const nodeType = document.getElementById("wfcd-node-type").value;
  const name = document.getElementById("wfcd-name").value.trim();
  const preview = document.getElementById("wfcd-preview");
  document.getElementById("wfcd-modal-import").style.display = "none";
  if (!name) { alert("名前を入力して"); return; }
  preview.innerHTML = `<div class="empty">取得中…</div>`;
  const res = await fetch(`/api/wfcd/generate?nodeType=${encodeURIComponent(nodeType)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    preview.innerHTML = `<div class="empty">見つかりませんでした（WFCD側の名前と完全一致している必要があります）</div>`;
    return;
  }
  wfcdSuggestion = await res.json();
  renderWfcdPreview();
  document.getElementById("wfcd-modal-import").style.display = "";
});

function renderWfcdPreview() {
  const s = wfcdSuggestion;
  const preview = document.getElementById("wfcd-preview");
  const parts = (s.parts || []).map((p, i) => {
    // Vault済みバッジ（アイコン付き）を差し込むため、ネイティブ<select>ではなく
    // クリック選択式のカードリストにしている。選択状態は各partごとの
    // [data-part-value]隠しinputに保持し、import側の読み取りはそこだけを見る。
    const candidateRows = (p.relicCandidates || []).map((c, ci) => {
      const kindText = c.isRelic ? "・レリック" : "・通常ミッション";
      const vaultedBadge = c.vaulted ? `<span class="badge-vaulted">${gameIcon("lorc-padlock")}Vault済み</span>` : "";
      return `<div class="candidate-item" data-part-idx="${i}" data-cand-idx="${ci}">${locationJa(c.name)}（${c.chance}%${kindText}）${vaultedBadge}</div>`;
    }).join("");
    return `
      <div class="wfcd-part">
        <div class="part-name">${itemJa(p.node.name)}</div>
        ${(p.relicCandidates || []).length
          ? `<label style="margin:0 0 2px;">入手先（1つ選択、OR関係なのでどれか1つでよい。レリックとは限らず通常ミッションのドロップも含む）</label>
             <div class="candidate-list">
               <div class="candidate-item selected" data-part-idx="${i}" data-cand-idx="">（未選択）</div>
               ${candidateRows}
             </div>
             <input type="hidden" data-part-value="${i}" value="">`
          : `<div class="empty">WFCD側にこのパーツの入手先データなし（既定素材として通常のミッション/敵ドロップで入手する想定）</div>`}
      </div>`;
  }).join("");

  const syndicateRow = s.syndicateRank ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-syndicate-check" checked style="margin-top:3px;">
        <span>シンジケートランクを前提条件として追加: <b>${s.syndicateRank.node.name}</b>（購入コスト ${s.syndicateRank.standing.toLocaleString()} standing）</span>
      </label>
    </div>` : "";

  const questChain = s.questChain ? `
    <div class="wfcd-part">
      <div class="part-name">前提クエストチェーン（Wiki要約ベース、精度は目視要確認）</div>
      ${s.questChain.length > 1
        ? `<div class="ph-row">${s.questChain.map(n => n.name).join(" → ")}</div>`
        : `<div class="empty">本表に前提クエストの登録なし（単体で追加されます）</div>`}
    </div>` : "";

  // 追加しただけのノードはどのBuildのcontainsにも繋がらないため、Chain ViewはBuild起点の
  // BFS表示なので画面に一切出てこない（「反映されてない気がする」との報告を受けて追加、
  // 2026-08-23）。現在選択中のBuildが分かる場合は、そのcontainsへ自動で追加するか選べる
  // ようにする。
  const currentBuild = state.graph?.nodes?.[state.report?.buildId];
  const attachRow = currentBuild ? `
    <div class="wfcd-part">
      <label style="display:flex;align-items:flex-start;gap:6px;">
        <input type="checkbox" id="wfcd-attach-check" checked style="margin-top:3px;">
        <span>現在のBuild「<b>${currentBuild.name}</b>」のcontainsに追加する（チェックを外すと種別がGoalになり、単独の探索起点として左上のプルダウンから辿れます）</span>
      </label>
    </div>` : `
    <div class="wfcd-part"><div class="empty">現在選択中のBuildがないため、このまま追加すると種別がGoalになり、単独の探索起点として左上のプルダウンから辿れます</div></div>`;

  preview.innerHTML = `
    <div class="ph-row" style="margin-top:10px;"><b>パラダイム:</b> ${s.paradigm}</div>
    ${s.richLich ? `<div class="ph-row"><b>リッチ系:</b> ${s.richLich}</div>` : ""}
    ${s.archetype ? `<div class="ph-row"><b>アーキタイプ:</b> ${s.archetype}</div>` : ""}
    <div class="ph-row"><b>本体ノード:</b> ${s.root.name}（${s.root.id}）</div>
    ${attachRow}
    ${syndicateRow}
    ${questChain}
    ${parts}
  `;

  preview.querySelectorAll(".candidate-item").forEach(row => {
    row.addEventListener("click", () => {
      const partIdx = row.dataset.partIdx;
      const hidden = preview.querySelector(`[data-part-value="${partIdx}"]`);
      if (hidden) hidden.value = row.dataset.candIdx;
      preview.querySelectorAll(`.candidate-item[data-part-idx="${partIdx}"]`).forEach(r => r.classList.toggle("selected", r === row));
    });
  });
}

document.getElementById("wfcd-modal-import").addEventListener("click", async () => {
  if (!wfcdSuggestion) return;
  const nodes = [];
  const root = { ...wfcdSuggestion.root };

  const attachCheck = document.getElementById("wfcd-attach-check");
  const currentBuild = state.graph?.nodes?.[state.report?.buildId];
  const willAttach = !!(attachCheck && attachCheck.checked && currentBuild);
  // 現在のBuildに繋がない場合、種別をGoalにして単独の探索起点にする。そのままの種別
  // （Frame/Weapon/Quest）で放置すると、どのBuild/Goalのcontains/requiresからも辿れない
  // 孤立ノードになり、Chain ViewはBuild起点のBFS表示のため画面に一切出てこない
  // （「反映されてない気がする」との報告を受けて2026-08-23に追加、2026-08-25にGoal化へ変更）。
  if (!willAttach) root.type = "Goal";

  nodes.push(root);

  // クエストチェーン: root以外の前提クエストノードをそのまま追加（各ノードのrequiresは
  // BuildQuestSuggestion側で前提クエストへのIDとして設定済み）。
  (wfcdSuggestion.questChain || []).forEach(n => {
    if (n.id !== root.id) nodes.push({ ...n });
  });

  // シンジケートランク: チェックがONならランクノードを追加し、本体ノードのrequiresに繋ぐ。
  if (wfcdSuggestion.syndicateRank) {
    const check = document.getElementById("wfcd-syndicate-check");
    if (check && check.checked) {
      const rankNode = wfcdSuggestion.syndicateRank.node;
      if (!nodes.find(n => n.id === rankNode.id)) {
        nodes.push({ ...rankNode, requires: rankNode.requires || [], contains: rankNode.contains || [] });
      }
      root.requires = [...(root.requires || []), rankNode.id];
    }
  }

  (wfcdSuggestion.parts || []).forEach((p, i) => {
    const partNode = { ...p.node, requires: [] };
    const sel = document.querySelector(`[data-part-value="${i}"]`);
    const chosenIdx = sel ? sel.value : "";
    if (chosenIdx !== "") {
      const candidate = p.relicCandidates[Number(chosenIdx)];
      if (candidate.isRelic) {
        // レリック由来: 開封対象として別ノードを作り、requiresで繋ぐ（従来通り）。
        const relicId = "relic-" + candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        if (!nodes.find(n => n.id === relicId)) {
          nodes.push({ id: relicId, name: candidate.name, type: "Relic", requires: [], contains: [] });
        }
        partNode.requires = [relicId];
      } else {
        // 通常ミッション/抹殺のドロップ: レリックのような「開封対象」の別ノードは存在しない
        // ため、requiresは繋がずパーツ側のnoteに入手先を記録するだけに留める。
        partNode.note = `入手先: ${candidate.name}`;
      }
    }
    nodes.push(partNode);
  });

  await fetch("/api/wfcd/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes }) });

  // 現在のBuildのcontainsへ追加（willAttachがtrueの場合のみ）。
  let attached = false;
  if (willAttach && !(currentBuild.contains || []).includes(root.id)) {
    const updatedBuild = { ...currentBuild, contains: [...(currentBuild.contains || []), root.id] };
    await fetch("/api/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedBuild) });
    attached = true;
  }

  document.getElementById("wfcd-modal-backdrop").classList.add("hidden");
  await loadGraph();
  if (state.focus) await loadReport();
  alert(attached
    ? `「${root.name}」を追加し、現在のBuildのcontainsに繋げました。`
    : `「${root.name}」をGoalとして追加しました。左上のプルダウンから単独の探索起点として辿れます。既存のBuildのcontainsに含めたい場合は、そのBuildノードを編集して手動で追加してください。`);
});
