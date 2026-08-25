// Port of web/item-i18n.js. WFCD component name (frame/weapon part,
// material) EN->JA lookup, wiki-confirmed entries only (2026-08-23) — see
// the original file's header for scope notes (Zaw/Kitgun/Amp part names,
// Necramech parts, frame-specific special parts, and open-world bounty
// materials are deliberately not covered here).
const ITEM_JA: Record<string, string> = {
  // Standard frame parts
  Blueprint: "設計図",
  Chassis: "シャーシ",
  Neuroptics: "ニューロティック",
  Systems: "システム",
  "Orokin Cell": "オロキンセル",
  // Weapon parts (wiki-confirmed)
  Barrel: "バレル",
  Barrels: "バレル",
  Blade: "ブレード",
  Blades: "ブレード",
  Receiver: "レシーバー",
  Receivers: "レシーバー",
  Stock: "ストック",
  // Weapon parts (unconfirmed, inferred from common katakana convention)
  Handle: "ハンドル",
  Hilt: "ヒルト",
  Grip: "グリップ",
  Guard: "ガード",
  Chain: "チェーン",
  Link: "リンク",
  Core: "コア",
  Disc: "ディスク",
  Engine: "エンジン",
  Gauntlet: "ガントレット",
  "Left Gauntlet": "左ガントレット",
  "Right Gauntlet": "右ガントレット",
  Glove: "グローブ",
  Head: "ヘッド",
  Hook: "フック",
  Motor: "モーター",
  Rivet: "リベット",
  Pouch: "ポーチ",
  "Upper Limb": "アッパーリム",
  "Lower Limb": "ロワーリム",
  String: "弦",
  // Crafting materials
  "Nano Spores": "ナノ胞子",
  Neurodes: "ニューロード",
  "Alloy Plate": "合金板",
  "Nitain Extract": "ニタン抽出物",
  "Argon Crystal": "アルゴンクリスタル",
  Circuits: "回路基板",
  Ferrite: "フェライト",
  Gallium: "ガリウム",
  Oxium: "オキシウム",
  Salvage: "サルベージ",
  Plastids: "プラスチド",
  Rubedo: "ルビドー",
  "Polymer Bundle": "ポリマーバンドル",
  "Control Module": "コントロールモジュール",
  Morphics: "モーフィクス",
  Cryotic: "クライオティック",
  Tellurium: "テルル",
};

export function itemJa(name: string): string {
  return ITEM_JA[name] ?? name;
}
