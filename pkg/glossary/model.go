// Package glossary は、アプリ内に散らばるゲーム内用語の英→日対応を、Goソースへの
// ハードコードではなく本人が直接編集できる設定データとして持つための汎用ストア。
//
// きっかけはRivenステータス名（`web/collections.html`のRIVEN_STAT_JA、コミュニティWiki出典で
// 公式表記との一致が未検証）だったが、「ゲーム内の用語はアプリ内で設定できるようにする」という
// 要望自体はRivenに限らないため、カテゴリタグ付きの汎用マッピングとして設計した
// （2026-08-19、AskUserQuestionで対象範囲を確認）。
//
// 【重要】既存のハードコード箇所（RIVEN_STAT_JA、pkg/standingのシンジケートランク名等）は
// 今回のこのストア追加では書き換えていない。一括リファクタはせず、次回以降このストアを
// 参照する形へ漸進的に移行する方針（本人合意済み）。今回はストア本体とUI（設定モーダルの
// 「用語」タブ）だけを追加し、初回起動時にRiven28種をデフォルトシードする。
package glossary

// Entry は用語1件。EnKey がデータ全体でのユニークキー（英語の原語）。
type Entry struct {
	EnKey    string `json:"enKey"`
	Ja       string `json:"ja"`
	Category string `json:"category"`
}

// CurrentSchemaVersion is the on-disk shape version this build writes.
const CurrentSchemaVersion = 1

// Data は永続化される全体データ。Entries は Entry.EnKey をキーにする。
type Data struct {
	SchemaVersion int              `json:"schemaVersion"`
	Entries       map[string]Entry `json:"entries"`
}

func NewData() *Data {
	return &Data{SchemaVersion: CurrentSchemaVersion, Entries: make(map[string]Entry)}
}

// CategoryRiven はRivenステータス名の用語カテゴリタグ。
const CategoryRiven = "Riven"

// DefaultRivenEntries は03_Data_Source_Research.md 2.20節でWeb調査済みの28種
// （出典: コミュニティWiki、公式クライアント表記との一致は未検証——本人が「用語」タブから
// 直接修正できることがこのストアの存在意義そのもの）。初回起動時のデフォルトシードに使う。
var DefaultRivenEntries = []Entry{
	{EnKey: "Grineer Damage", Ja: "対グリニアダメージ", Category: CategoryRiven},
	{EnKey: "Corpus Damage", Ja: "対コーパスダメージ", Category: CategoryRiven},
	{EnKey: "Infestation Damage", Ja: "対感染体ダメージ", Category: CategoryRiven},
	{EnKey: "Weapon Damage / Melee Damage", Ja: "基礎ダメージ / 近接ダメージ", Category: CategoryRiven},
	{EnKey: "Slash Damage", Ja: "切断ダメージ", Category: CategoryRiven},
	{EnKey: "Puncture Damage", Ja: "貫通ダメージ", Category: CategoryRiven},
	{EnKey: "Impact Damage", Ja: "衝撃ダメージ", Category: CategoryRiven},
	{EnKey: "Heat Damage", Ja: "火炎ダメージ", Category: CategoryRiven},
	{EnKey: "Cold Damage", Ja: "冷気ダメージ", Category: CategoryRiven},
	{EnKey: "Electricity Damage", Ja: "電気ダメージ", Category: CategoryRiven},
	{EnKey: "Toxin Damage", Ja: "毒ダメージ", Category: CategoryRiven},
	{EnKey: "Critical Chance", Ja: "クリティカル率", Category: CategoryRiven},
	{EnKey: "Critical Damage", Ja: "クリティカルダメージ", Category: CategoryRiven},
	{EnKey: "Status Chance", Ja: "状態異常確率", Category: CategoryRiven},
	{EnKey: "Status Duration", Ja: "状態異常の持続時間", Category: CategoryRiven},
	{EnKey: "Fire Rate / Attack Speed", Ja: "発射速度 / 攻撃速度", Category: CategoryRiven},
	{EnKey: "Multishot", Ja: "マルチショット", Category: CategoryRiven},
	{EnKey: "Reload Speed", Ja: "リロード速度", Category: CategoryRiven},
	{EnKey: "Magazine Capacity", Ja: "マガジンサイズ", Category: CategoryRiven},
	{EnKey: "Ammo Maximum", Ja: "弾薬所持上限", Category: CategoryRiven},
	{EnKey: "Projectile Speed", Ja: "弾速", Category: CategoryRiven},
	{EnKey: "Punch Through", Ja: "貫通距離", Category: CategoryRiven},
	{EnKey: "Recoil", Ja: "反動", Category: CategoryRiven},
	{EnKey: "Zoom", Ja: "ズーム", Category: CategoryRiven},
	{EnKey: "Finisher Damage", Ja: "追撃ダメージ", Category: CategoryRiven},
	{EnKey: "Slide Critical Chance", Ja: "スライド攻撃のクリティカル率", Category: CategoryRiven},
	{EnKey: "Combo Duration", Ja: "コンボ持続時間", Category: CategoryRiven},
	{EnKey: "Heavy Attack Efficiency", Ja: "ヘビー攻撃効率", Category: CategoryRiven},
	{EnKey: "Range", Ja: "範囲", Category: CategoryRiven},
}
