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
	NegativeStat  string   `json:"negativeStat,omitempty"`

	// Fixed は「完成した・もう回さなくていい」を示す。falseは「まだ回す必要がある」
	// （中間状態を持たないシンプルな二値、本人の明示的な要望どおり）。
	Fixed bool `json:"fixed"`

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

	// BonusStat はLich撃破時にランダム付与されるボーナス属性（例: "+58% Cold Damage"）。
	// WFCD静的データからは取得不可（個体ごとのランダムロールのため）の手入力欄
	// （03_Data_Source_Research.md 2.6/14節）。
	BonusStat string `json:"bonusStat,omitempty"`

	Note            string `json:"note,omitempty"`
	ChainViewNodeID string `json:"chainViewNodeId,omitempty"`
}

type Data struct {
	Rivens map[string]*RivenEntry `json:"rivens"`
	Kuva   map[string]*KuvaEntry  `json:"kuva"`
}

func NewData() *Data {
	return &Data{Rivens: make(map[string]*RivenEntry), Kuva: make(map[string]*KuvaEntry)}
}
