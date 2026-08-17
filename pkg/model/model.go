package model

type NodeType string

const (
	TypeGoal      NodeType = "Goal"
	TypeBuild     NodeType = "Build"
	TypeWeapon    NodeType = "Weapon"
	TypeFrame     NodeType = "Frame"
	TypeMod       NodeType = "Mod"
	TypeRiven     NodeType = "Riven"
	TypeSyndicate NodeType = "Syndicate"
	TypeQuest     NodeType = "Quest"
	TypeResource  NodeType = "Resource"
	TypeRelic     NodeType = "Relic"
)

type NodeState string

const (
	StateSatisfied  NodeState = "SATISFIED"
	StateActionable NodeState = "ACTIONABLE"
	StateBlocked    NodeState = "BLOCKED"
)

// Node は Warframe State Graph の全構成要素（Build/Weapon/Mod/Riven/Syndicate等）を表す
// フラットな単位。Obsidian プロトタイプ（Prototype/Nodes/*.md）のフロントマターと1:1対応する。
type Node struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Type       NodeType `json:"type"`
	Satisfied  bool     `json:"satisfied"`
	Requires   []string `json:"requires"`             // 前提条件ノードID: 全てSATISFIEDでないとACTIONABLEにならない
	Contains   []string `json:"contains"`             // 構成要素ノードID: 表示グループ化のみ、状態判定には影響しない
	Evaluation string   `json:"evaluation,omitempty"` // Riven要リロール/完成の主観判定、またはKuva/Tenet/Coda武器のボーナス属性ロールの手入力欄（03_Data_Source_Research.md 2.6/14節、同じ発想の自由記述として共用）
	Priority   int      `json:"priority,omitempty"`
	Note       string   `json:"note,omitempty"`

	// MasteryTrack はこのノードがマスタリー担当パーツ（Zaw/Kitgun/AmpのStrike/Chamber/Prism等、
	// 3パーツ中1つだけがMRを稼ぐという非対称構造）であることを示す。これがtrueのノードだけ
	// UI側でGildトグルを表示する。Gilded自体はbool zero値(false)がJSON上省略されるため、
	// 「Gild未満」と「そもそも対象外」を区別する目印としてこのフラグが要る。
	MasteryTrack bool `json:"masteryTrack,omitempty"`
	// Gilded は MasteryTrack な ノードの Gild（真化）状態。satisfied（パーツ所持・ランク30到達）
	// とは独立 — Gildして初めてマスタリー付与対象になるため（03_Data_Source_Research.md 2.7節）。
	Gilded bool `json:"gilded,omitempty"`

	// UniqueName はWFCD warframe-items側のuniqueNameパス（例: /Lotus/Powersuits/Ninja/AshPrime）。
	// WFCD自動生成インポートで作成されたノードにのみ付与され、i18n（日本語名）・Vault判定・
	// Prime Resurgence在庫照合をあいまいな名前一致ではなく確実なキーで行うために使う。
	// 手動作成ノードでは空のままでよい。
	UniqueName string `json:"uniqueName,omitempty"`
}

type Graph struct {
	Nodes map[string]*Node `json:"nodes"`
}

func NewGraph() *Graph {
	return &Graph{Nodes: make(map[string]*Node)}
}
