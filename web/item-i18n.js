// WFCDコンポーネント名（フレーム/武器パーツ・素材）の日本語対応表。
// wikiwiki.jp/warframe「生産材料」「装備強化指針」「STROPHA」等で確認済みの用語のみ収録
// （2026-08-23確認）。未確認の訳を確定情報として書かない方針はQUEST_JA
// （web/quest-i18n.js）と同じ——載っていない名前はitemJa()が英語のまま返す。
//
// 武器パーツ側は「バレル/ブレード/レシーバー/ストック」等Wikiで直接確認できた名称に加え、
// Warframeの武器パーツ名は素直なカタカナ表記が大半という既存の傾向（バレル/ブレード等）に
// 沿って、個別未確認だが同種の一般的な部品名も収録した（ハンドル/グリップ/ガード等）。
// 弓のString(弦)のみ、カタカナ表記より自然な訳語として「弦」を採用（未確認、要目視確認）。
//
// 未収録: Zaw/Kitgun/Amp等モジュール武器の部品名（Strike/Chamber/Prism等の固有名詞は
// 別武器名がそのままパーツ名として使われるパターンで、翻訳ではなく別の設計課題——
// 「③モジュール型組み立てUI」調査で扱う）、Necramech専用部品（Bonewidow/Voidrig等）、
// Equinox（Day/Night Aspect）等フレーム固有の特殊部品、Cetus/Fortuna/Deimos等の
// バウンティ産レア素材（Aggristone/Cetus Wisp等、種類が多く個別確認が必要なため後回し）。
const ITEM_JA = {
  // フレーム標準部品
  "Blueprint": "設計図",
  "Chassis": "シャーシ",
  "Neuroptics": "ニューロティック",
  "Systems": "システム",
  "Orokin Cell": "オロキンセル",
  // 武器パーツ（Wiki確認済み）
  "Barrel": "バレル",
  "Barrels": "バレル",
  "Blade": "ブレード",
  "Blades": "ブレード",
  "Receiver": "レシーバー",
  "Receivers": "レシーバー",
  "Stock": "ストック",
  // 武器パーツ（未確認、一般的なカタカナ表記から推定）
  "Handle": "ハンドル",
  "Hilt": "ヒルト",
  "Grip": "グリップ",
  "Guard": "ガード",
  "Chain": "チェーン",
  "Link": "リンク",
  "Core": "コア",
  "Disc": "ディスク",
  "Engine": "エンジン",
  "Gauntlet": "ガントレット",
  "Left Gauntlet": "左ガントレット",
  "Right Gauntlet": "右ガントレット",
  "Glove": "グローブ",
  "Head": "ヘッド",
  "Hook": "フック",
  "Motor": "モーター",
  "Rivet": "リベット",
  "Pouch": "ポーチ",
  "Upper Limb": "アッパーリム",
  "Lower Limb": "ロワーリム",
  "String": "弦",
  // 生産素材
  "Nano Spores": "ナノ胞子",
  "Neurodes": "ニューロード",
  "Alloy Plate": "合金板",
  "Nitain Extract": "ニタン抽出物",
  "Argon Crystal": "アルゴンクリスタル",
  "Circuits": "回路基板",
  "Ferrite": "フェライト",
  "Gallium": "ガリウム",
  "Oxium": "オキシウム",
  "Salvage": "サルベージ",
  "Plastids": "プラスチド",
  "Rubedo": "ルビドー",
  "Polymer Bundle": "ポリマーバンドル",
  "Control Module": "コントロールモジュール",
  "Morphics": "モーフィクス",
  "Cryotic": "クライオティック",
  "Tellurium": "テルル",
};
function itemJa(name) { return ITEM_JA[name] || name; }
