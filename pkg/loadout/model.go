package loadout

type ItemType string

const (
	TypeFrame  ItemType = "Frame"
	TypeWeapon ItemType = "Weapon"
)

type ConfigSlot string

const (
	ConfigA ConfigSlot = "A"
	ConfigB ConfigSlot = "B"
	ConfigC ConfigSlot = "C"
)

// Item はMODを積む対象（フレームまたは武器）。Chain Viewのグラフ（graph.json）とは
// 独立したデータで、そちらの Weapon/Frame ノードと名前だけを緩く対応させる想定。
// A/B/Cは実際のWarframeのMODコンフィグ機能に合わせた3枠。スロット位置・極性・ランクは
// 持たず、MOD名のリストだけを保持する軽量版（意図的な割り切り）。
type Item struct {
	ID      string                  `json:"id"`
	Name    string                  `json:"name"`
	Type    ItemType                `json:"type"`
	Configs map[ConfigSlot][]string `json:"configs"`
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

type Data struct {
	Items     map[string]*Item     `json:"items"`
	BuildSets map[string]*BuildSet `json:"buildSets"`
}

func NewData() *Data {
	return &Data{Items: make(map[string]*Item), BuildSets: make(map[string]*BuildSet)}
}
