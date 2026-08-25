// クエスト日本語名対応表（wikiwiki.jp/warframe「クエスト」ページ、2026-08-22確認）。
// キーは/api/reference/quests（WFCD Quests.json）の英語表記そのまま。3件（Clan Key/
// Mutalist Alad V Assassinate/The Hex Finale）はページ内に対応する記載が見つからず、
// 未確認のまま英語表記を採用（不確かな訳を確定情報として書かない方針）。
// 元々web/stats.htmlのインライン定義だったが、Chain View（WFCD自動生成ウィザードの
// クエスト名サジェスト）でも同じ対応表が必要になったため共有ファイルへ抽出した
// （2026-08-23、2箇所で別々に持つと片方だけ更新漏れするリスクがあるため——ja()関数が
// glossaryストアと別のRIVEN_STAT_JAハードコードを見ていて未配線だった過去のバグと同種の
// 教訓）。
const QUEST_JA = {
  "Awakening": "目覚め",
  "Vor's Prize": "Vorの秘宝",
  "The Teacher": "師範",
  "Vox Solaris": "Vox Solaris",
  "Once Awake": "博士の計略",
  "Heart Of Deimos": "ダイモスの心臓",
  "The Archwing": "アークウイング",
  "Natah": "Natah",
  "The Second Dream": "二番目の夢",
  "The War Within": "内なる紛争",
  "Rising Tide": "流転する形勢",
  "Chains Of Harrow": "HARROWの鎖",
  "Apostasy Prologue": "背信のプロローグ",
  "The Sacrifice": "サクリファイス",
  "Chimera Prologue": "争いの序曲",
  "Erra": "ERRA",
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
  "Veilbreaker": "ベールブレイカー",
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
function questJa(name) { return QUEST_JA[name] || name; }
