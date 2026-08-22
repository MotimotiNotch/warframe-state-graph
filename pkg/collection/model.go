// Package collection は Chain View（依存グラフ）/ Loadouts（MODコンフィグ）とは独立した
// 「入手状況ログ」。Riven/Kuva系武器のような個体差の強いアイテムを、ノードグラフに混ぜずに
// 記録する。Chain Viewのノードとは任意のID参照で緩く紐付けられるが、必須ではない
// （Loadouts.BuildSet↔Chain Viewと同じ設計パターン）。
package collection

// RivenEntry は所持Riven1件分の記録。
// 理論値レンジ計算はスコープ外（02_Requirements_and_Roadmap.md item2）で、
// あくまで「ロール済みステータスの記録」と「回す必要があるかどうか」の管理に留める。
type RivenEntry struct {
	ID            string   `json:"id"`
	WeaponName    string   `json:"weaponName"`
	PositiveStats []string `json:"positiveStats"`

	// PositiveValues はPositiveStatsと同じインデックスで対応する、実際にロールされた数値
	// （%表記の数値をそのまま入れる想定、例: 150.5）。理論値レンジ計算（可能な最大/最小値の
	// 算出）はスコープ外のまま——これは「今の1本にどの数値が出たか」を記録するだけの軽量な
	// 追加項目（2026-08-20、カードのテキストエクスポートに数値も出したいという要望から追加）。
	PositiveValues []float64 `json:"positiveValues,omitempty"`

	NegativeStat string `json:"negativeStat,omitempty"`
	// NegativeValue はNegativeStatに対応する数値。NegativeStatが空なら無視される。
	NegativeValue float64 `json:"negativeValue,omitempty"`

	// Fixed は「完成した・もう回さなくていい」を示す。falseは「まだ回す必要がある」
	// （中間状態を持たないシンプルな二値、本人の明示的な要望どおり）。
	Fixed bool `json:"fixed"`

	// Favorite は「今のビルドで実際に使ってる/優先度高い」という緩い主観マーカー。
	// Fixed（ロールの完成度、客観）とは完全に独立した別軸で、両者はあらゆる組み合わせが成立する
	// （2026-08-18 Collectionsページ詳細設計）。
	Favorite bool `json:"favorite"`

	Note string `json:"note,omitempty"`

	// ChainViewNodeID はChain View側ノード（例: dragon-nikana-riven）への任意の緩い参照。
	// 未設定でも単独で機能する（Loadouts.BuildSet.ChainViewBuildIDと同じ設計）。
	ChainViewNodeID string `json:"chainViewNodeId,omitempty"`
}

// KuvaKind はリッチ系武器の系統。
type KuvaKind string

const (
	KuvaKindKuva  KuvaKind = "Kuva"
	KuvaKindTenet KuvaKind = "Tenet"
	KuvaKindCoda  KuvaKind = "Coda"
)

// KuvaEntry はKuva/Tenet/Coda武器1件分の記録。
type KuvaEntry struct {
	ID         string   `json:"id"`
	WeaponName string   `json:"weaponName"`
	Kind       KuvaKind `json:"kind,omitempty"`
	Owned      bool     `json:"owned"`

	// Favorite は「同じ武器の複数丁のうちどれが本命か」（Valence Fusionの融合先選定等）を示す
	// 主観マーカー。武器名が同じでも個体ごとに別エントリを持てるため、丁ごとに独立して立てる
	// （2026-08-18 Collectionsページ詳細設計）。
	Favorite bool `json:"favorite"`

	// BonusStat はLich撃破時にランダム付与されるボーナス属性（例: "+58% Cold Damage"）。
	// WFCD静的データからは取得不可（個体ごとのランダムロールのため）の手入力欄
	// （03_Data_Source_Research.md 2.6/14節）。
	BonusStat string `json:"bonusStat,omitempty"`

	Note            string `json:"note,omitempty"`
	ChainViewNodeID string `json:"chainViewNodeId,omitempty"`
}

// FrameEntry はフレーム1件の入手状況記録。全フレーム網羅の管理ではなく、気になるフレームだけ
// 手動登録する（Riven/Kuvaと同じ登録制、2026-08-19設計）。
type FrameEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"` // WFCD Warframes.jsonから選択

	Owned bool `json:"owned"`

	// RankedThirty は「ランク30済み」（このフレーム個体がランク30へ到達したかの二値）。
	// アカウント全体のマスタリーランク(MR)とは別物——「マスタリー済み」という呼称は既存の
	// MasteryTrack（Zaw/Kitgun/Amp等のGild状態、satisfiedとは独立の別概念）と紛らわしいため、
	// 明示的に「ランク30済み」で統一する（2026-08-19、精査で発見・本人指定）。
	RankedThirty bool `json:"rankedThirty"`

	// HelminthFed は「このフレームをHelminthへ捧げた（消費した）」側の記録。
	// 受け取る側（アビリティ移植先）の記録は別物で、Loadouts.Item.Note（自由記述、
	// 2026-08-20にHelminthNote専用フィールドから統合）が担う。
	HelminthFed bool `json:"helminthFed"`

	Note            string `json:"note,omitempty"`
	ChainViewNodeID string `json:"chainViewNodeId,omitempty"`
}

// IncarnonEntry はインカーノン対応武器1件の進捗記録。武器単位の登録制
// （Riven/Kuva/Frameと同じ、2026-08-22再々訂正）。デュビリという場所そのものを主体に
// した「達成済み/インカーノン済み」という2軸の集計方式を経由したが、WFCD
// （warframe-itemsのタグ／warframe-drop-dataの報酬表）双方にCircuit経由のインカーノン
// 対象武器一覧が存在しないことを確認し、母数を要する集計を断念——Riven/Kuva/Frameと同じ
// 「気になる武器だけ手動登録」方式に回帰した。デュビリ本編（Lone Story／Orowyrm撃破等の
// ストーリー進捗）のクリア状況はこのツールのスコープ外で、扱わない。
type IncarnonEntry struct {
	ID         string `json:"id"`
	WeaponName string `json:"weaponName"` // WFCD Primary/Secondary/Melee.jsonから選択

	// Obtained は「インカーノン取得済み」（Duviri Circuit経由でIncarnon Genesis
	// アダプターを入手済みか）。
	Obtained bool `json:"obtained"`

	// Completed は「インカーノン済み」（アダプター装着後、進化チャレンジを完了して
	// 実際にIncarnon形態を解放済みか）。ObtainedがfalseでCompletedがtrueの組み合わせは
	// ゲーム的には起こらない想定だが、Riven.Fixed等と同じくUI側で強制はしない。
	Completed bool `json:"completed"`

	Note            string `json:"note,omitempty"`
	ChainViewNodeID string `json:"chainViewNodeId,omitempty"`
}

// CurrentSchemaVersion is the on-disk shape version this build writes.
// Files saved before this field existed decode SchemaVersion as 0, which
// this package's FileStore treats as version 1 (no migration needed yet).
const CurrentSchemaVersion = 1

type Data struct {
	SchemaVersion int                       `json:"schemaVersion"`
	Rivens        map[string]*RivenEntry    `json:"rivens"`
	Kuva          map[string]*KuvaEntry     `json:"kuva"`
	Frames        map[string]*FrameEntry    `json:"frames"`
	Incarnons     map[string]*IncarnonEntry `json:"incarnons"`
}

func NewData() *Data {
	return &Data{
		SchemaVersion: CurrentSchemaVersion,
		Rivens:        make(map[string]*RivenEntry),
		Kuva:          make(map[string]*KuvaEntry),
		Frames:        make(map[string]*FrameEntry),
		Incarnons:     make(map[string]*IncarnonEntry),
	}
}
