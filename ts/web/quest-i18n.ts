// Port of web/quest-i18n.js. Quest name EN->JA lookup (wikiwiki.jp/warframe
// "クエスト" page, confirmed 2026-08-22). Keys are the exact English strings
// from /api/reference/quests (WFCD Quests.json). 3 entries (Clan Key/
// Mutalist Alad V Assassinate/The Hex Finale) had no matching page entry and
// are deliberately left untranslated rather than guessed.
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

/** Node display-name helper: Quest nodes show their wiki-confirmed Japanese
 * name wherever a node name is rendered (graph label, sidebar list,
 * Inspector, requires/contains tag combobox); every other node type keeps
 * its stored WFCD English name unchanged (same "storage stays English,
 * translate only at display" convention as itemJa()/locationJa()). */
export function nodeDisplayName(node: { type: string; name: string }): string {
  return node.type === "Quest" ? questJa(node.name) : node.name;
}
