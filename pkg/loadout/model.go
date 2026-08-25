package loadout

type ItemType string

const (
	TypeFrame     ItemType = "Frame"
	TypeWeapon    ItemType = "Weapon"
	TypeCompanion ItemType = "Companion"
	// TypeArchwing/TypeNecramechは2026-08-23追加（「アークウィング、Voidrigはどこに登録する
	// 想定だっけ」を受けて）。通常のウォーフレームとは別枠のパイロット可能装備。
	TypeArchwing  ItemType = "Archwing"
	TypeNecramech ItemType = "Necramech"
)

type ConfigSlot string

const (
	ConfigA ConfigSlot = "A"
	ConfigB ConfigSlot = "B"
	ConfigC ConfigSlot = "C"
)

// Item はMODを積む対象（フレーム/武器/コンパニオン）。Chain Viewのグラフ（graph.json）とは
// 独立したデータで、そちらの Weapon/Frame ノードと名前だけを緩く対応させる想定。
// A/B/Cは実際のWarframeのMODコンフィグ機能に合わせた3枠。スロット位置・極性・ランクは
// 持たず、MOD名のリストだけを保持する軽量版（意図的な割り切り）。
// TypeCompanionは同時運用が1体のみで切り替え頻度も低いため、ConfigAのみを使う
// 単一構成として扱う（B/Cはデータ構造上は存在するがUI側で隠す運用、2026-08-20設計）。
type Item struct {
	ID      string                  `json:"id"`
	Name    string                  `json:"name"`
	Type    ItemType                `json:"type"`
	Configs map[ConfigSlot][]string `json:"configs"`

	// Favorite は「今のメイン編成/優先度高い」という緩い主観マーカー（Collections.RivenEntry/
	// KuvaEntryと同じ「お気に入り」パターン、2026-08-20追加）。Chain View達成状態やMODコンフィグの
	// 完成度とは独立の別軸。
	Favorite bool `json:"favorite,omitempty"`

	// Note はカード上の自由記述メモ欄（2026-08-18 装備カード化設計、Riven/Kuva/BuildSetと
	// 同じ「メモ欄の追加」対象範囲）。BuildSetは既にNoteを持っていたが、Itemには無かったため追加。
	// ヘルミンス移植アビリティ・アルケイン構成のような使用頻度の低い付随情報は、専用フィールドを
	// 個別に増やさずここに自由記述する（専用フィールドだったHelminthNoteは2026-08-20に統合・廃止）。
	Note string `json:"note,omitempty"`

	// ChainViewNodeID はChain View側ノードへの任意の緩い参照。カード上のミニ進捗グラフ表示用
	// （2026-08-18 装備カード化 & Gitグラフ風ミニ進捗表示設計）。BuildSet.ChainViewBuildIDと同じ
	// 「緩い参照」パターンだが、Itemは個別の武器/フレーム単位でも紐付けられるようにする。
	ChainViewNodeID string `json:"chainViewNodeId,omitempty"`

	// LastUsedAt はMODコンフィグを変更した時刻（Unixミリ秒）。お気に入りだけで一覧の並びを
	// 決めると「お気に入りにしてない項目は8件超で見えなくなる」ため、実際に触ってる項目を
	// 一覧の上位に混ぜて拾い上げる目的で追加（2026-08-23、「最近使った順いれて」との要望）。
	// SetConfig（MOD追加/削除）のたびにサーバー側で更新する——お気に入り切替やメモ編集は
	// 「使った」に含めない（対象操作を絞る判断）。
	LastUsedAt int64 `json:"lastUsedAt,omitempty"`
}

// ItemRef はBuildSetがフレーム/武器のどのコンフィグ（A/B/C）を使うかを指す参照。
type ItemRef struct {
	ItemID string     `json:"itemId"`
	Config ConfigSlot `json:"config"`
}

// BuildSet はフレーム1つ＋武器複数（それぞれ使用コンフィグ指定）を束ねた完成ビルド。
// Chain View の Build ノード（依存関係グラフ上の目標）とは全く別の概念 —
// こちらは「実際に持ち出す装備一式」のスナップショット的な記録。
type BuildSet struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Frame   *ItemRef  `json:"frame,omitempty"`
	Weapons []ItemRef `json:"weapons"`
	Note    string    `json:"note,omitempty"`

	// ChainViewBuildID は graph.json 側の Build ノードIDへの緩い参照（あれば）。
	// Chain View（依存関係グラフ）とLoadouts（実際に持ち出す装備一式）は別データ・別ページの
	// ままだが（本人の明示的選択）、任意で紐付けて進捗を横断表示できるようにする
	// （02_Requirements_and_Roadmap.md マイルストーン「BuildSetとChain ViewのBuildノード連携」）。
	ChainViewBuildID string `json:"chainViewBuildId,omitempty"`
}

// CurrentSchemaVersion is the on-disk shape version this build writes.
// Files saved before this field existed decode SchemaVersion as 0, which
// this package's FileStore treats as version 1 (no migration needed yet).
const CurrentSchemaVersion = 1

type Data struct {
	SchemaVersion int                  `json:"schemaVersion"`
	Items         map[string]*Item     `json:"items"`
	BuildSets     map[string]*BuildSet `json:"buildSets"`
}

func NewData() *Data {
	return &Data{SchemaVersion: CurrentSchemaVersion, Items: make(map[string]*Item), BuildSets: make(map[string]*BuildSet)}
}
