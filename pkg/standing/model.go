// Package standing は16シンジケート（Conclave/Cephalon Simarisを除く、DE公式の全シンジケートの
// うちランク制で「今どの階級か」を持つ意味のあるもの）の「現在の階級（ランク）」を記録する。
//
// Chain View側のシンジケートランクノード（wfcdgen.SyndicateRankSuggestion、特定の
// シンジケート武器を買うのに必要な単一ランクをrequiresに追加するもの）とは別物。あちらは
// 個別ビルドに必要な特定ランクのワンタップトグルにスコープを絞っているのに対し、こちらは
// 「今シンジケートそれぞれ何ランクか」というプレイヤーの現状そのものを一覧で保持する。
//
// 【6大シンジケートだけランクは不可逆ではない】WebSearchで確認済み（2026-08-19）: 6大
// シンジケートはSteel Meridian/Arbiters of Hexis/Cephalon Suda（左陣営）と
// Red Veil/The Perrin Sequence/New Loka（右陣営）の2陣営に分かれ、片方の陣営でStandingを
// 稼ぐと敵対する陣営の評判が下がる。0を割ると降格し、最大Rank -2まで下がりうる
// （Source: https://steamcommunity.com/app/230410/discussions/0/1733213724896619232/ ,
// https://wiki.warframe.com/w/Syndicate ランクシステム説明）。そのため「一度満たしたら
// 戻さないトグル」ではなく、現在ランクの値そのものを保持・更新する設計にしている
// （requires連鎖トグルのCascadeSatisfyRequires等とは異なるモデル）。
//
// 【16シンジケートへの拡張（2026-08-19）】残り10シンジケート（Ostron/Solaris United/
// Vox Solaris/Ventkids/Entrati/Necraloid/Kahl's Garrison/Operational Supply/
// The Holdfasts/The Quills）はいずれも敵対relationshipを持たない（陣営はFactionNone、
// MinRankは常に0）。ランク段階数もシンジケートごとにバラバラ（Necraloid/Operational Supplyは
// 3段階のみ、他は5段階）なため、RanksもSacrificesも固定長配列ではなくスライスにした。
package standing

import "strconv"

// Faction はシンジケートが属する陣営。同じ陣営同士は友好、陣営をまたぐと敵対関係になる。
// FactionNoneは6大シンジケート以外の全て——敵対relationshipを持たず、ランクは0以上のみ
// （降格してマイナスになることはない）。
type Faction string

const (
	FactionLeft  Faction = "left"  // Steel Meridian / Arbiters of Hexis / Cephalon Suda
	FactionRight Faction = "right" // Red Veil / The Perrin Sequence / New Loka
	FactionNone  Faction = "none"  // 6大シンジケート以外の全て（敵対relationshipなし）
)

// RankSacrifice はそのランクへ初めて到達する際に必要な貢献アイテム1ランク分。
// Itemsが複数あるのは、Solaris United（負債証書を複数種同時消費）やEntrati（Token系込み）の
// ように1ランクに複数種類のアイテムが同時に必要なシンジケートがあるため。
type RankSacrifice struct {
	// Items は「アイテム名×個数」形式の文字列（例: "Gallium×2"）。複数種類必要な場合は
	// 全部を列挙する。
	Items []string `json:"items,omitempty"`

	// None は「このシンジケートはそもそも貢献アイテムを消費しない」ことが判明済みの場合true
	// （Ventkids=K-Driveのトリック/レース点で昇格、Kahl's Garrison=週次ミッション自動進行）。
	// Itemsが空なだけの「未調査」と区別するためのフラグ。
	None bool `json:"none,omitempty"`

	// Unconfirmed は貢献アイテムの中身がまだ実データで確認できていないことを示す
	// （不確かな個数を確定情報として書かない、という方針。2026-08-19時点でNecraloid等が該当）。
	Unconfirmed bool `json:"unconfirmed,omitempty"`
}

// SyndicateInfo は1シンジケート分の固定メタデータ（陣営・ランク名・貢献アイテム）。
type SyndicateInfo struct {
	Name       string          `json:"name"`
	Faction    Faction         `json:"faction"`
	Ranks      []string        `json:"ranks"`      // インデックス0=Rank1名 … 最後=最高ランク名
	Sacrifices []RankSacrifice `json:"sacrifices"` // Ranksと同じ長さ、パラレル
	// Note はUI上に添える短い注記（イベント専用、Standingを使わない特殊な昇格方式等）。
	Note string `json:"note,omitempty"`
}

// MinRank はこのシンジケートで許容される最小ランク。敵対relationshipを持つ6大シンジケートだけ
// -2まで下がりうる。それ以外は常に0（降格しない）。
func (s SyndicateInfo) MinRank() int {
	if s.Faction == FactionLeft || s.Faction == FactionRight {
		return -2
	}
	return 0
}

// MaxRank はこのシンジケートの最高ランク（= Ranksの長さ）。
func (s SyndicateInfo) MaxRank() int { return len(s.Ranks) }

func sac(items ...string) RankSacrifice { return RankSacrifice{Items: items} }

var noSacrifice = RankSacrifice{None: true}
var unconfirmedSacrifice = RankSacrifice{Unconfirmed: true}

// repeatUnconfirmed はn個のunconfirmedSacrificeを持つスライスを作る（調査未完了のシンジケートの
// Sacrifices初期値に使う）。
func repeatUnconfirmed(n int) []RankSacrifice {
	out := make([]RankSacrifice, n)
	for i := range out {
		out[i] = unconfirmedSacrifice
	}
	return out
}

// MajorSyndicates は6大シンジケートの固定リスト。
var MajorSyndicates = []SyndicateInfo{
	{Name: "Steel Meridian", Faction: FactionLeft, Ranks: []string{"Brave", "Valiant", "Defender", "Protector", "General"}, Sacrifices: []RankSacrifice{sac("Morphics×2"), sac("Forma×1"), sac("Orokin Catalyst×1"), sac("Aya×2"), sac("Aya×3")}},
	{Name: "Arbiters of Hexis", Faction: FactionLeft, Ranks: []string{"Principled", "Authentic", "Lawful", "Crusader", "Maxim"}, Sacrifices: []RankSacrifice{sac("Gallium×2"), sac("Forma×1"), sac("Orokin Reactor×1"), sac("Aya×2"), sac("Aya×3")}},
	{Name: "Cephalon Suda", Faction: FactionLeft, Ranks: []string{"Competent", "Intriguing", "Intelligent", "Wise", "Genius"}, Sacrifices: []RankSacrifice{sac("Control Module×2"), sac("Forma×1"), sac("Orokin Catalyst×1"), sac("Aya×2"), sac("Aya×3")}},
	{Name: "Red Veil", Faction: FactionRight, Ranks: []string{"Respected", "Honored", "Esteemed", "Revered", "Exalted"}, Sacrifices: []RankSacrifice{sac("Gallium×2"), sac("Forma×1"), sac("Orokin Catalyst×1"), sac("Aya×2"), sac("Aya×3")}},
	{Name: "The Perrin Sequence", Faction: FactionRight, Ranks: []string{"Associate", "Senior Associate", "Executive", "Senior Executive", "Partner"}, Sacrifices: []RankSacrifice{sac("Detonite Ampule×2"), sac("Forma×1"), sac("Orokin Reactor×1"), sac("Aya×2"), sac("Aya×3")}},
	{Name: "New Loka", Faction: FactionRight, Ranks: []string{"Humane", "Bountiful", "Benevolent", "Pure", "Flawless"}, Sacrifices: []RankSacrifice{sac("Fieldron Sample×2"), sac("Forma×1"), sac("Orokin Reactor×1"), sac("Aya×2"), sac("Aya×3")}},
}

// ExtendedSyndicates は6大シンジケート以外の10シンジケート（2026-08-19、Web調査で
// ランク名・順序・敵対relationshipの有無を確定。Vox Solaris/The Holdfastsは機械抽出の
// 並び順が誤っていたため公式Wikiで訂正済み、The Quillsも「Architect/Adherent同閾値」説を
// 実データで否定し5段階とも別々のランクと確定した）。貢献アイテムの中身は
// wiki.warframe.comの各シンジケートページから個別に確認済み（Solaris Unitedのみ、
// テーブル抽出だけでは「そのランクでの純増分」か「その時点の累計保有量」かを判別できず、
// 不確かな個数を確定情報として書かないという方針により未確認のまま保留）。
var ExtendedSyndicates = []SyndicateInfo{
	{Name: "Ostron", Faction: FactionNone, Ranks: []string{"Offworlder", "Visitor", "Trusted", "Surah", "Kin"}, Sacrifices: []RankSacrifice{
		sac("Nistlepod×25", "Iradite×25", "Grokdrul×25"),
		sac("Tear Azurite×10", "Pyrol×40", "Fish Scales×60"),
		sac("Cetus Wisp×1", "Maprico×5"),
		sac("Maprico×10", "Fersteel Alloy×40", "Murkray Liver×5"),
		sac("Nyth×1", "Sentirum×1", "Norg Brain×1", "Cuthol Tendrils×1"),
	}},
	{Name: "Solaris United", Faction: FactionNone, Ranks: []string{"Outworlder", "Rapscallion", "Doer", "Cove", "Old Mate"}, Sacrifices: repeatUnconfirmed(5), Note: "1ランクにつき複数種の負債証書(Debt-Bond)を同時消費する。Wikiのテーブル抽出では同じ証書種別の個数がランクを跨いで繰り返し出現しており、「そのランクでの新規消費量」か「その時点で保有すべき累計量」かを判別できなかったため個数は未確認のまま"},
	{Name: "Vox Solaris", Faction: FactionNone, Ranks: []string{"Operative", "Agent", "Hand", "Instrument", "Shadow"}, Sacrifices: []RankSacrifice{
		sac("Calda Toroid×1", "Vega Toroid×1", "Sola Toroid×1"),
		sac("Gyromag Systems×1", "Vega Toroid×1"),
		sac("Atmo Systems×1", "Calda Toroid×1"),
		sac("Repeller Systems×1", "Sola Toroid×1"),
		sac("Crisma Toroid×1"),
	}},
	{Name: "Ventkids", Faction: FactionNone, Ranks: []string{"Glinty", "Whozit", "Proper Felon", "Primo", "Logical"}, Sacrifices: []RankSacrifice{noSacrifice, noSacrifice, noSacrifice, noSacrifice, noSacrifice}, Note: "貢献アイテムを消費しない。K-Driveのトリック/レースで稼いだStandingのみで昇格する"},
	{Name: "Entrati", Faction: FactionNone, Ranks: []string{"Stranger", "Acquaintance", "Associate", "Friend", "Family"}, Sacrifices: []RankSacrifice{
		sac("Benign Infested Tumor×6", "Ferment Bladder×6"),
		sac("Keratinos Blade Blueprint×1", "Father Token×1", "Daughter Token×1"),
		sac("Sly Vulpaphyla Tag×3", "Vizier Predasite Tag×3", "Mother Token×1", "Son Token×1"),
		sac("Zarim Mutagen Blueprint×1", "Arioli Mutagen Blueprint×1", "Father Token×1", "Son Token×1"),
		sac("Seriglass Shard×1", "Mother Token×1", "Father Token×1"),
	}},
	{Name: "Necraloid", Faction: FactionNone, Ranks: []string{"Clearance: Agnesis", "Clearance: Modus", "Clearance: Odima"}, Sacrifices: []RankSacrifice{
		sac("Orokin Orientation Matrix×10", "Void Traces×150", "Zymos Barrel Blueprint×1", "Father Token×20"),
		sac("Orokin Ballistics Matrix×15", "Void Traces×250", "Sepulcrum Barrel Blueprint×1", "Father Token×20"),
		sac("Orokin Animus Matrix×15", "Void Traces×350", "Trumna Barrel Blueprint×1", "Father Token×20"),
	}, Note: "Orokinマトリクス自体もStandingを付与する特殊なアイテム"},
	{Name: "Kahl's Garrison", Faction: FactionNone, Ranks: []string{"Shelter", "Encampment", "Fort", "Settlement", "Home"}, Sacrifices: []RankSacrifice{noSacrifice, noSacrifice, noSacrifice, noSacrifice, noSacrifice}, Note: "Standingという概念自体を使わない。週次ミッション「Kahl's Break」の完了で自動的にランクが進む（シンジケート端末にも表示されない）"},
	{Name: "Operational Supply", Faction: FactionNone, Ranks: []string{"Collaborator", "Defender", "Champion"}, Sacrifices: []RankSacrifice{
		sac("Grokdrul×10"),
		sac("Iradite×10"),
		sac("Nistlepod×10"),
	}, Note: "Operation: Plague Star開催期間中のみ有効なイベント専用シンジケート"},
	{Name: "The Holdfasts", Faction: FactionNone, Ranks: []string{"Fallen", "Watcher", "Guardian", "Seraph", "Angel"}, Sacrifices: []RankSacrifice{
		sac("Voidplume Down×5", "Ferrite×2000", "Alloy Plate×2000"),
		sac("Voidplume Vane×10", "Voidgel Orb×10", "Alloy Plate×5000"),
		sac("Voidplume Crest×10", "Entrati Lanthorn×10", "Ferrite×5000"),
		sac("Voidplume Quill×15", "Thrax Plasm×60", "Voidgel Orb×40"),
		sac("Voidplume Pinion×5", "Thrax Plasm×90", "Entrati Lanthorn×20"),
	}},
	{Name: "The Quills", Faction: FactionNone, Ranks: []string{"Mote", "Observer", "Adherent", "Instrument", "Architect"}, Sacrifices: []RankSacrifice{
		sac("Intact Sentient Core×10"),
		sac("Intact Sentient Core×20"),
		sac("Eidolon Shard×10"),
		sac("Eidolon Shard×20"),
		sac("Eidolon Shard×30"),
	}},
}

// AllSyndicates はMajorSyndicates＋ExtendedSyndicatesの結合（表示順もこの並び）。
var AllSyndicates = append(append([]SyndicateInfo{}, MajorSyndicates...), ExtendedSyndicates...)

// FindSyndicate は名前でAllSyndicatesから1件探す。
func FindSyndicate(name string) (SyndicateInfo, bool) {
	for _, s := range AllSyndicates {
		if s.Name == name {
			return s, true
		}
	}
	return SyndicateInfo{}, false
}

// RecoverySacrifice はマイナスランク(-1)からNeutral(0)へ回復する際の貢献アイテムを返す。
// 実データ3件（Red Veil/Cephalon Suda/The Perrin Sequence）から発見した法則により、
// 常にそのシンジケートのRank3到達貢献と同一（未検証の3シンジケートもこの法則からの推定、
// 2026-08-19、03_Data_Source_Research.md 2.17節）。敵対relationshipを持たないシンジケート
// （マイナスランクが存在しない）に対しては空のRankSacrificeを返す。
func RecoverySacrifice(syndicateName string) RankSacrifice {
	s, ok := FindSyndicate(syndicateName)
	if !ok || (s.Faction != FactionLeft && s.Faction != FactionRight) || len(s.Sacrifices) < 3 {
		return RankSacrifice{}
	}
	return s.Sacrifices[2]
}

// RankLabel はランク値から表示ラベルを作る（範囲外はクランプしない、呼び出し側の責任）。
// 例: RankLabel("Red Veil", 3) => "Esteemed (Rank 3)"
func RankLabel(syndicateName string, rank int) string {
	switch {
	case rank == 0:
		return "Neutral (Rank 0)"
	case rank < 0:
		return "敵対 (Rank " + strconv.Itoa(rank) + ")"
	default:
		if s, ok := FindSyndicate(syndicateName); ok && rank >= 1 && rank <= len(s.Ranks) {
			return s.Ranks[rank-1] + " (Rank " + strconv.Itoa(rank) + ")"
		}
	}
	return "Rank " + strconv.Itoa(rank)
}

// CurrentSchemaVersion is the on-disk shape version this build writes.
const CurrentSchemaVersion = 1

// Data は永続化される全体データ。Ranks は SyndicateInfo.Name をキーに現在ランクを持つ。
// HighestRankReached は同じキーで「貢献アイテムを払い済みの最高到達ランク」という不可逆な
// 実績値（現在ランクとは独立、降格しても下がらない。2026-08-19設計）。
// AllSyndicatesに無いキーが紛れ込んでも読み込み自体は許容する（将来シンジケートが
// 増えた場合の移行を壊さないため）。
type Data struct {
	SchemaVersion      int            `json:"schemaVersion"`
	Ranks              map[string]int `json:"ranks"`
	HighestRankReached map[string]int `json:"highestRankReached"`
}

func NewData() *Data {
	d := &Data{SchemaVersion: CurrentSchemaVersion, Ranks: make(map[string]int), HighestRankReached: make(map[string]int)}
	for _, s := range AllSyndicates {
		d.Ranks[s.Name] = 0
		d.HighestRankReached[s.Name] = 0
	}
	return d
}
