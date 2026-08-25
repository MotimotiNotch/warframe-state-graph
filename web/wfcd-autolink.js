// Loadouts/Chain View起点のページ横断自動リンク共通ヘルパー（2026-08-25項目27）。
// 「ID/名前検索をユーザーに見せない」という必要条件のため、候補選択UIは出さず既定値のまま
// 全部登録する。web/wfcd-wizard.jsの手動インポート（レリック候補をユーザーが選ぶ）とは別物。
// 5ページ共通スクリプトと同じ位置づけ（icons.js等と並んで読み込む）。

// WFCD名からChain Viewノードを自動生成する。ウィザードの既定チェック状態
// （シンジケートランクは含める／レリック候補は選ばない＝partsは開封先未指定のまま）を踏襲。
// 「現在のBuild」という文脈がこの呼び出し元には無いため、ルートは常にtype:"Goal"で独立させる
// （2026-08-25項目30の統合方針にも合わせ、Buildは使わない）。
async function autoGenerateChainViewNode(nodeType, name) {
  const res = await fetch(`/api/wfcd/generate?nodeType=${encodeURIComponent(nodeType)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const s = await res.json();
  const nodes = [];
  const root = { ...s.root, type: "Goal" };
  nodes.push(root);

  (s.questChain || []).forEach(n => { if (n.id !== root.id) nodes.push({ ...n }); });

  if (s.syndicateRank) {
    const rankNode = s.syndicateRank.node;
    if (!nodes.find(n => n.id === rankNode.id)) {
      nodes.push({ ...rankNode, requires: rankNode.requires || [], contains: rankNode.contains || [] });
    }
    root.requires = [...(root.requires || []), rankNode.id];
  }

  (s.parts || []).forEach(p => {
    // レリック候補はユーザー判断が要るため自動選択しない（開封先requiresは空のまま）。
    nodes.push({ ...p.node, requires: [] });
  });

  const importRes = await fetch("/api/wfcd/import", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes }),
  });
  if (!importRes.ok) return null;
  return root.id;
}

// Loadouts.Item種別 → Collections登録先APIパスの対応。CompanionEntry/ArchwingEntry/
// NecramechEntryはWeaponEntry/FrameEntryと同型（owned/rankedThirty/note/chainViewNodeId）。
const COLLECTIONS_API_PATH_BY_TYPE = {
  Frame: "frames", Weapon: "weapons", Companion: "companions", Archwing: "archwings", Necramech: "necramechs",
};

function autoLinkId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Collectionsへ強制登録する（同名なら既存のIDをそのまま返し、新規作成しない——項目27の
// 名前重複防止ルールをページ横断で共有）。呼び出し元ページはCollectionsのstateを
// 持たないため、都度APIから確認する。
async function forcePushToCollections(itemType, name, owned) {
  const apiPath = COLLECTIONS_API_PATH_BY_TYPE[itemType];
  if (!apiPath) return null;
  const res = await fetch("/api/collections");
  if (!res.ok) return null;
  const data = await res.json();
  const bucket = data[apiPath] || {};
  const q = name.trim().toLowerCase();
  const existing = Object.values(bucket).find(e => e.name.trim().toLowerCase() === q);
  if (existing) return existing.id;

  const entry = { id: autoLinkId(itemType.toLowerCase()), name, owned, rankedThirty: false, note: "" };
  const createRes = await fetch(`/api/collections/${apiPath}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry),
  });
  if (!createRes.ok) return null;
  return entry.id;
}
