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

// FocusSchools はOperator Focus Schoolの5校。UI上も英語表記のまま使う（本人指定、
// 2026-08-20、02_Requirements_and_Roadmap.md項目23）。
var FocusSchools = []string{"Madurai", "Naramon", "Zenurik", "Vazarin", "Unairu"}

// FocusInvestment は1校あたりの投資段階。実際は10 Way×最大5ランクの細かいツリーだが、
// 「State更新コストの極小化」原則に合わせ3段階の集約区分のみを直接保持する
// （Standing/Intrinsicsと同じ「現在値の直接保持」パターン）。
type FocusInvestment string

const (
	FocusNotInvested FocusInvestment = "not_invested"
	FocusInProgress  FocusInvestment = "in_progress"
	FocusMaxed       FocusInvestment = "maxed"
)

// ValidFocusInvestments はAPI側のバリデーションで使う許容値一覧。
var ValidFocusInvestments = []FocusInvestment{FocusNotInvested, FocusInProgress, FocusMaxed}

func IsValidFocusInvestment(v FocusInvestment) bool {
	for _, want := range ValidFocusInvestments {
		if v == want {
			return true
		}
	}
	return false
}

// RailjackComponentSlots はRailjack本体の4部品。Plexus（modは自由記述メモで別管理、
// RailjackPlexusNote参照）はここに含めない（2026-08-20、02_Requirements_and_Roadmap.md項目23）。
var RailjackComponentSlots = []string{"Shield Array", "Engines", "Plating", "Reactor"}

// RailjackComponent は1部品の粗い現在装備（House×Grade個体差までは追わない）。
// どちらも空文字で「未設定」を許容する。
type RailjackComponent struct {
	House string `json:"house"`
	Grade string `json:"grade"`
}

// ValidRailjackHouses/ValidRailjackGrades はAPI側のバリデーションで使う許容値一覧
// （空文字＝未設定も許容、Wiki確認済み、2026-08-20）。
var ValidRailjackHouses = []string{"", "Zetki", "Lavan", "Vidar"}
var ValidRailjackGrades = []string{"", "Mk I", "Mk II", "Mk III"}

func IsValidRailjackValue(v string, allowed []string) bool {
	for _, want := range allowed {
		if v == want {
			return true
		}
	}
	return false
}

// CurrentSchemaVersion is the on-disk shape version this build writes.
const CurrentSchemaVersion = 1

// Data は永続化される全体データ。Planetsはpkg/starchart.Planet.Keyをキーにする
// （固定リストではなく、ゲームアップデートで惑星が増えても既存キーはそのまま残る想定）。
type Data struct {
	SchemaVersion      int                           `json:"schemaVersion"`
	Planets            map[string]*PlanetProgress    `json:"planets"`
	RailjackIntrinsics map[string]int                `json:"railjackIntrinsics"`
	DrifterIntrinsics  map[string]int                `json:"drifterIntrinsics"`
	FocusInvestment    map[string]FocusInvestment    `json:"focusInvestment"`
	FocusActiveSchool  string                        `json:"focusActiveSchool"`
	RailjackComponents map[string]*RailjackComponent `json:"railjackComponents"`
	RailjackPlexusNote string                        `json:"railjackPlexusNote"`
}

func NewData() *Data {
	d := &Data{
		SchemaVersion:      CurrentSchemaVersion,
		Planets:            make(map[string]*PlanetProgress),
		RailjackIntrinsics: make(map[string]int),
		DrifterIntrinsics:  make(map[string]int),
		FocusInvestment:    make(map[string]FocusInvestment),
		RailjackComponents: make(map[string]*RailjackComponent),
	}
	for _, name := range RailjackCategories {
		d.RailjackIntrinsics[name] = 0
	}
	for _, name := range DrifterCategories {
		d.DrifterIntrinsics[name] = 0
	}
	for _, name := range FocusSchools {
		d.FocusInvestment[name] = FocusNotInvested
	}
	for _, slot := range RailjackComponentSlots {
		d.RailjackComponents[slot] = &RailjackComponent{}
	}
	return d
}
