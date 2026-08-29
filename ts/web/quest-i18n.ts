// Port of web/quest-i18n.js. Quest name EN->JA lookup (wikiwiki.jp/warframe
// "クエスト" page, confirmed 2026-08-22). Keys are the exact English strings
// from /api/reference/quests (WFCD Quests.json). 3 entries (Clan Key/
// Mutalist Alad V Assassinate/The Hex Finale) had no matching page entry and
// are deliberately left untranslated rather than guessed.
import { itemJa } from "./item-i18n.ts";
const QUEST_JA: Record<string, string> = {
  Awakening: "目覚め",
  "Vor's Prize": "Vorの秘宝",
  "The Teacher": "師範",
  "Vox Solaris": "Vox Solaris",
  "Once Awake": "博士の計略",
  "Heart Of Deimos": "ダイモスの心臓",
  "The Archwing": "アークウイング",
  Natah: "Natah",
  "The Second Dream": "二番目の夢",
  "The War Within": "内なる紛争",
  "Rising Tide": "流転する形勢",
  "Chains Of Harrow": "HARROWの鎖",
  "Apostasy Prologue": "背信のプロローグ",
  "The Sacrifice": "サクリファイス",
  "Chimera Prologue": "争いの序曲",
  Erra: "ERRA",
  "The New War": "新たな大戦",
  "The Duviri Paradox": "デュヴィリ・パラドックス",
  "Whispers In The Walls": "壁の中の囁き",
  "The Lotus Eaters": "ロートパゴス",
  "The Hex": "ヘックス",
  "The Old Peace": "古の同盟",
  "Angels Of The Zariman": "Zarimanの天使",
  "Jade Shadows": "翡翠の影",
  "Jade Shadows: Constellations": "翡翠の影：星座",
  "Saya's Vigil": "Sayaの眼",
  "Stolen Dreams": "奪われた野望",
  "Howl Of The Kubrow": "クブロウ獲得",
  "A Man Of Few Words": "寡黙な人物",
  "Patient Zero": "感染起源は誰",
  Veilbreaker: "ベールブレイカー",
  "Hidden Messages": "隠されたメッセージ",
  "The Limbo Theorem": "LIMBO セオリム",
  "The Jordas Precept": "Jordasの教訓",
  "The New Strange": "新たな怪奇",
  "Sands Of Inaros": "INAROSの砂嵐",
  "The Silver Grove": "銀の果樹園",
  "The Glast Gambit": "グラスト・ギャンビット",
  "Octavia's Anthem": "Octaviaの賛美歌",
  "Mask Of The Revenant": "Revenantの仮面",
  "The Deadlock Protocol": "デッドロック・プロトコル",
  "Call Of The Tempestarii": "嵐を呼ぶ者テンペスタリ",
  "The Waverider": "ウェーブライダー",
};

export function questJa(name: string): string {
  return QUEST_JA[name] ?? name;
}

// Reverse of QUEST_JA, for resolving a displayed Japanese name back to the
// WFCD English name /api/wfcd/generate needs (exact-match lookup). Safe as a
// straight Object.fromEntries — no two entries currently share the same JA
// value, so this stays bijective; a future colliding addition to QUEST_JA
// would silently keep only the last entry here (acceptable — worst case,
// picking a duplicate-JA-name quest from the dropdown still round-trips
// correctly since the dropdown always writes the EN name via data-value,
// this reverse lookup only matters for free-typed Japanese text).
const QUEST_EN: Record<string, string> = Object.fromEntries(Object.entries(QUEST_JA).map(([en, ja]) => [ja, en]));

export function questEn(name: string): string {
  return QUEST_EN[name] ?? name;
}

/** Node display-name helper: wherever a node name is rendered (graph label,
 * sidebar list, Inspector, requires/contains tag combobox), show the
 * wiki-confirmed Japanese name for a Quest, or the WFCD-part/material name
 * for anything matching item-i18n.ts's dictionary (Blueprint/Chassis/
 * Neuroptics/Systems/Oxium/etc. — the exact names wfcd-wizard.ts's part
 * generation and DSL-authored material nodes both use); everything else
 * keeps its stored WFCD English name unchanged (same "storage stays
 * English, translate only at display" convention as itemJa()/locationJa()
 * themselves already follow).
 *
 * wfcd-wizard.ts's own preview screen already calls itemJa() directly on
 * parts before import, but that only covers the preview — once a part node
 * is actually created and rendered elsewhere (graph/sidebar/Inspector), it
 * had no display-time translation at all until this (found 2026-08-29:
 * generated frame parts showed as raw "Blueprint"/"Chassis"/... everywhere
 * outside the wizard's own preview).
 *
 * A WFCD-generated Quest not attached to the current Build gets stored as
 * type "Goal" instead (wfcd-wizard.ts's willAttach branch — done so it
 * isn't orphaned from the graph), which is the common case for quests added
 * this way and would otherwise silently fall through untranslated. Since it
 * still carries the exact WFCD quest name, an exact QUEST_JA key match is
 * treated as a quest too, regardless of stored type. Same reasoning extends
 * to itemJa() below — a WFCD-generated part or a DSL-authored material node
 * gets type "Resource"/"Goal", never a dedicated "Part" type, so matching by
 * exact name (not type) is the only way to catch it. */
export function nodeDisplayName(node: { type: string; name: string }): string {
  if (node.type === "Quest") return questJa(node.name);
  const ja = questJa(node.name);
  if (ja !== node.name) return ja;
  const itemName = itemJa(node.name);
  return itemName !== node.name ? itemName : node.name;
}
