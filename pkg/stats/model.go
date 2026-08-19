// Package stats は Stats ページ（読み取り専用の4データソース横断集計＋星図/Steel Path/
// Intrinsics進捗の唯一の入力セクション）のうち、実際に永続化が要る「入力される値」を持つ。
// 4データソース横断集計そのもの（Chain View/Loadouts/Collections/Standing由来）は既存の
// 各GET APIをフロントエンドが読み合わせて計算するだけなので、このpackageは持たない
// （2026-08-19設計、02_Requirements_and_Roadmap.md項目20）。
package stats

// PlanetProgress は1惑星/システムの進捗（分子）。分母（総ノード数）はpkg/starchartが
// ExportRegions.jsonから機械集計する別データで、ここでは持たない。
// State更新コストの極小化原則により、ノード個別トグルではなく粗い数値のみ。
type PlanetProgress struct {
	Cleared          int `json:"cleared"`
	SteelPathCleared int `json:"steelPathCleared"`
}

// RailjackCategories はRailjack Intrinsicsの5系統（Tactical/Piloting/Gunnery/Engineering/
// Command）。各ランク0〜10（2026-08-19、Wiki確認済み）。
var RailjackCategories = []string{"Tactical", "Piloting", "Gunnery", "Engineering", "Command"}

// DrifterCategories はDrifter Intrinsicsの4系統（Combat/Riding/Opportunity/Endurance）。
// 各ランク0〜10（2026-08-19、Wiki確認済み）。
var DrifterCategories = []string{"Combat", "Riding", "Opportunity", "Endurance"}

const (
	IntrinsicMinRank = 0
	IntrinsicMaxRank = 10
)

// CurrentSchemaVersion is the on-disk shape version this build writes.
const CurrentSchemaVersion = 1

// Data は永続化される全体データ。Planetsはpkg/starchart.Planet.Keyをキーにする
// （固定リストではなく、ゲームアップデートで惑星が増えても既存キーはそのまま残る想定）。
type Data struct {
	SchemaVersion      int                        `json:"schemaVersion"`
	Planets            map[string]*PlanetProgress `json:"planets"`
	RailjackIntrinsics map[string]int             `json:"railjackIntrinsics"`
	DrifterIntrinsics  map[string]int             `json:"drifterIntrinsics"`
}

func NewData() *Data {
	d := &Data{
		SchemaVersion:      CurrentSchemaVersion,
		Planets:            make(map[string]*PlanetProgress),
		RailjackIntrinsics: make(map[string]int),
		DrifterIntrinsics:  make(map[string]int),
	}
	for _, name := range RailjackCategories {
		d.RailjackIntrinsics[name] = 0
	}
	for _, name := range DrifterCategories {
		d.DrifterIntrinsics[name] = 0
	}
	return d
}
