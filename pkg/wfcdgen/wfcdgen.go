// Package wfcdgen は WFCD の生アイテムデータ（pkg/wfcd）から、Chain View に追加できる
// ノード候補を組み立てる。項目10の設計方針どおり「自動確定」ではなく「候補をサジェストして
// 人が選ぶ」レベルに意図的にスコープを絞っている — 特にパーツ→レリックはOR関係（どれか1つで
// 良い）の候補が複数あるため、ユーザーが1つ選んでから requires に追加する前提で、
// このパッケージは選択肢の提示までしか行わない（AND前提の既存engineパッケージはそのままでよい）。
package wfcdgen

import (
	"regexp"
	"strings"

	"warframe-state-graph/pkg/model"
	"warframe-state-graph/pkg/wfcd"
)

type Paradigm string

const (
	// 03_Data_Source_Research.md 2.8/2.10/2.11節でまとめた装備系入手構造の6パラダイム。
	ParadigmSingleBlueprint Paradigm = "single-blueprint" // ①本体設計図のみ型
	ParadigmMultiPart       Paradigm = "multi-part"       // ②パーツ複数型（Prime武器/フレーム/アークウィング等）
	ParadigmModular         Paradigm = "modular"          // ③モジュール自由組立型（Zaw/Kitgun/Amp/Moa/Hound/K-Drive）
	ParadigmInstant         Paradigm = "instant"          // ④即時完成品型（componentsが存在しない）
	ParadigmFrameAssociated Paradigm = "frame-associated" // ⑤フレーム付随型（Exalted Weapon/Venari）
	ParadigmBreeding        Paradigm = "breeding"         // ⑥DNA/繁殖型（Kubrow/Kavat等）
)

// modularTypes は Misc.json の type フィールドがこれらの場合、③モジュール型と分類する。
var modularTypes = map[string]bool{
	"Zaw Component":    true,
	"Kitgun Component": true,
	"Amp":              true,
}

// ClassifyParadigm はアイテム1件をどのパラダイムに分類するかの推定。components/type/category
// だけから判定する簡易ヒューリスティックであり（正確な分類にはFoundryレシピの有無等の
// 追加情報が必要）、最終的な精度はユーザーが候補を見て取捨選択する前提で許容している。
func ClassifyParadigm(item wfcd.Item) Paradigm {
	if modularTypes[item.Type] {
		return ParadigmModular
	}
	if len(item.Components) == 0 {
		if item.Category == wfcd.CategoryPets {
			return ParadigmBreeding
		}
		return ParadigmInstant
	}
	// 複数の別々のドロップ元を持つコンポーネントが2つ以上あれば「各パーツが個別入手先を持つ」
	// パーツ複数型と判定する。単一Blueprint+汎用素材（駒素材はdropsを持たないことが多い）は
	// ①single-blueprintのまま。
	partsWithOwnDrop := 0
	for _, c := range item.Components {
		if len(c.Drops) > 0 {
			partsWithOwnDrop++
		}
	}
	if partsWithOwnDrop >= 2 {
		return ParadigmMultiPart
	}
	return ParadigmSingleBlueprint
}

// richLichPrefixes は2.6節で実データ検証済みの識別方法（名前プレフィックス一致が唯一100%網羅）。
var richLichPrefixes = []string{"Kuva ", "Tenet ", "Coda "}

// DetectRichLich は Kuva/Tenet/Coda リッチ系武器かどうかを名前プレフィックスで判定する。
func DetectRichLich(name string) (kind string, ok bool) {
	for _, p := range richLichPrefixes {
		if strings.HasPrefix(name, p) {
			return strings.TrimSpace(p), true
		}
	}
	return "", false
}

// Archetype は武器の基礎ステータスから見た大まかな設計思想。
type Archetype string

const (
	ArchetypeCrit    Archetype = "Crit"
	ArchetypeStatus  Archetype = "Status"
	ArchetypeHybrid  Archetype = "Hybrid"
	ArchetypeUtility Archetype = "Utility"
)

// 閾値はWarframeコミュニティで一般的に使われる目安（クリティカル率25%以上でクリット武器と
// 見なす等）であり、DE公式の厳密な定義ではないヒューリスティック。02_Requirements_and_Roadmap.md
// item2で「どの組み合わせが理論上最強か」ではなく「アーキタイプ判定まで」とスコープを絞った
// 方針に沿い、目安判定として十分という前提。
const (
	critChanceThreshold = 0.25
	procChanceThreshold = 0.25
)

// DetectArchetype は criticalChance/procChance の基礎値からアーキタイプを判定する。
func DetectArchetype(item wfcd.Item) Archetype {
	crit := item.CriticalChance >= critChanceThreshold
	status := item.ProcChance >= procChanceThreshold
	switch {
	case crit && status:
		return ArchetypeHybrid
	case crit:
		return ArchetypeCrit
	case status:
		return ArchetypeStatus
	default:
		return ArchetypeUtility
	}
}

// rivenStatArchetype は Riven のポジ値ステータス名がどのアーキタイプに属するかの対応表。
var rivenStatArchetype = map[string]Archetype{
	"Critical Chance": ArchetypeCrit,
	"Critical Damage": ArchetypeCrit,
	"Status Chance":   ArchetypeStatus,
	"Status Duration": ArchetypeStatus,
	"Multishot":       ArchetypeHybrid, // 両アーキタイプに寄与するためどちらとも一致扱い
	"Damage":          ArchetypeHybrid,
}

// RivenStatChoices はRiven専用入力UIでポジ値として選択できるステータス名一覧。
// アーキタイプ判定に関与するもの（rivenStatArchetypeのキー）に加え、実際のRivenで
// よく出る代表的なステータスも選択肢として含める（後者は一致判定には影響しない中立枠）。
var RivenStatChoices = []string{
	"Critical Chance", "Critical Damage", "Status Chance", "Status Duration",
	"Multishot", "Damage",
	"Fire Rate", "Reload Speed", "Punch Through", "Range", "Magazine Capacity", "Recoil",
}

// RivenCheck は武器アーキタイプとRivenのポジ値ステータス群を照合した結果。
type RivenCheck struct {
	Archetype    Archetype `json:"archetype"`
	Matches      bool      `json:"matches"`
	MatchedStats []string  `json:"matchedStats,omitempty"`
}

// CheckRiven は「そのRivenのポジ値が武器のアーキタイプと噛み合っているか」を判定する。
// 02_Requirements_and_Roadmap.md item2で確定したスコープ通り、理論値レンジの精密計算は行わず
// あくまで一致マーク表示のためのショーケース判定。
func CheckRiven(item wfcd.Item, positiveStats []string) RivenCheck {
	archetype := DetectArchetype(item)
	var matched []string
	for _, stat := range positiveStats {
		if a, ok := rivenStatArchetype[stat]; ok && (a == archetype || a == ArchetypeHybrid) {
			matched = append(matched, stat)
		}
	}
	return RivenCheck{Archetype: archetype, Matches: len(matched) > 0, MatchedStats: matched}
}

// slugPattern はノードID生成時に許可する文字（英数字とハイフン）以外を除去するためのもの。
var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

// Slug は "Ash Prime Neuroptics" のような名前を "ash-prime-neuroptics" のようなID形式に変換する。
// 既存 data/graph.json の命名規則（ash-prime, dragon-nikana-riven 等）に合わせている。
func Slug(name string) string {
	s := strings.ToLower(name)
	s = slugPattern.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// RelicCandidate はパーツ1つに対する入手先レリックの候補。OR関係（どれか1つで良い）なので
// requiresへの追加は自動化せず、ユーザーが選んだ1件だけをフロント側で追加する想定。
type RelicCandidate struct {
	Name    string  `json:"name"`
	Chance  float64 `json:"chance"`
	Vaulted bool    `json:"vaulted"`
}

// PartSuggestion はパーツ1件分のノード候補＋その入手先レリック候補一覧。
type PartSuggestion struct {
	Node            *model.Node      `json:"node"`
	RelicCandidates []RelicCandidate `json:"relicCandidates,omitempty"`
}

// Suggestion は1アイテムに対するノード自動生成の提案一式。
type Suggestion struct {
	Paradigm  Paradigm  `json:"paradigm"`
	RichLich  string    `json:"richLich,omitempty"`
	Archetype Archetype `json:"archetype,omitempty"`

	Root  *model.Node      `json:"root"`            // Build/Weapon/Frame本体ノード
	Parts []PartSuggestion `json:"parts,omitempty"` // ②パーツ複数型の場合のみ
}

// relicNamePattern は Drop.Location からレリック名部分だけを拾う（例:
// "Void Relic (Axi A22) (25.33%)" のような表記から "Axi A22" を抜き出す）。
// locationの正確なフォーマットはWFCDのバージョンで変わりうるため、緩めのパターンで
// 部分一致させ、見つからない場合はlocation全体をそのまま候補名として扱う。
var relicInLocationPattern = regexp.MustCompile(`(Lith|Meso|Neo|Axi) [A-Z]\d{1,2}`)

func extractRelicName(location string) string {
	if m := relicInLocationPattern.FindString(location); m != "" {
		return m
	}
	return location
}

// BuildSuggestion は1アイテムからノード生成候補を組み立てる。activeRelicsが空/nilの場合は
// Vault判定をfalse固定にする（レリックデータ取得に失敗しても他の提案は成立させるため）。
func BuildSuggestion(item wfcd.Item, nodeType model.NodeType, activeRelics map[string]bool) *Suggestion {
	paradigm := ClassifyParadigm(item)
	richLich, _ := DetectRichLich(item.Name)

	root := &model.Node{
		ID:         Slug(item.Name),
		Name:       item.Name,
		Type:       nodeType,
		UniqueName: item.UniqueName,
	}

	sug := &Suggestion{Paradigm: paradigm, RichLich: richLich, Root: root}
	if nodeType == model.TypeWeapon {
		sug.Archetype = DetectArchetype(item)
	}

	if paradigm != ParadigmMultiPart {
		return sug
	}

	for _, c := range item.Components {
		partNode := &model.Node{
			ID:   root.ID + "-" + Slug(c.Name),
			Name: c.Name,
			Type: model.TypeResource,
		}
		root.Contains = append(root.Contains, partNode.ID)

		var candidates []RelicCandidate
		for _, d := range c.Drops {
			relicName := extractRelicName(d.Location)
			candidates = append(candidates, RelicCandidate{
				Name:    relicName,
				Chance:  d.Chance,
				Vaulted: activeRelics != nil && wfcd.IsRelicVaulted(activeRelics, relicName),
			})
		}
		sug.Parts = append(sug.Parts, PartSuggestion{Node: partNode, RelicCandidates: candidates})
	}
	return sug
}
