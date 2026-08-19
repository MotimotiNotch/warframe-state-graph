// Package standing は6大主要シンジケート（Steel Meridian/Arbiters of Hexis/Cephalon Suda/
// The Perrin Sequence/Red Veil/New Loka）の「現在の階級（ランク）」だけを記録する。
//
// Chain View側のシンジケートランクノード（wfcdgen.SyndicateRankSuggestion、特定の
// シンジケート武器を買うのに必要な単一ランクをrequiresに追加するもの）とは別物。あちらは
// 個別ビルドに必要な特定ランクのワンタップトグルにスコープを絞っているのに対し、こちらは
// 「今6大シンジケートそれぞれ何ランクか」というプレイヤーの現状そのものを一覧で保持する。
//
// 【ランクは不可逆ではない】WebSearchで確認済み（2026-08-19）: 6大シンジケートは
// Steel Meridian/Arbiters of Hexis/Cephalon Suda（左陣営）と
// Red Veil/The Perrin Sequence/New Loka（右陣営）の2陣営に分かれ、片方の陣営でStandingを
// 稼ぐと敵対する陣営の評判が下がる。0を割ると降格し、最大Rank -2まで下がりうる
// （Source: https://steamcommunity.com/app/230410/discussions/0/1733213724896619232/ ,
// https://wiki.warframe.com/w/Syndicate ランクシステム説明）。そのため「一度満たしたら
// 戻さないトグル」ではなく、現在ランクの値そのものを保持・更新する設計にしている
// （requires連鎖トグルのCascadeSatisfyRequires等とは異なるモデル）。
package standing

import "strconv"

// Faction はシンジケートが属する陣営。同じ陣営同士は友好、陣営をまたぐと敵対関係になる。
type Faction string

const (
	FactionLeft  Faction = "left"  // Steel Meridian / Arbiters of Hexis / Cephalon Suda
	FactionRight Faction = "right" // Red Veil / The Perrin Sequence / New Loka
)

// RankNames はシンジケート1件のRank1〜5の正式名称（Rank0=Neutral、Rank-1/-2は
// 降格時の状態でありゲーム内に固有名称の記載が見当たらなかったため対象外）。
// warframe-drop-data の syndicates.json（報酬エントリのplace末尾）から実データで
// 抽出済み（2026-08-19、03_Data_Source_Research.md参照）。
type RankNames [5]string

// SacrificeItems はランクアップ生贄アイテム（Rank1〜5到達に必要な消費アイテム、
// インデックス0=Rank1到達分…4=Rank5到達分）。Wiki個別ページで実データ確認済み
// （2026-08-19、03_Data_Source_Research.md 2.17節）。生贄はそのランクへ**初めて**
// 到達した時のみ必要——降格後の再昇格では不要（マイナス圏からの回復を除く）。
type SacrificeItems [5]string

// SyndicateInfo は6大シンジケート1件の固定メタデータ（陣営・ランク名・生贄アイテム）。
type SyndicateInfo struct {
	Name       string         `json:"name"`
	Faction    Faction        `json:"faction"`
	Ranks      RankNames      `json:"ranks"`      // インデックス0=Rank1名 … 4=Rank5名
	Sacrifices SacrificeItems `json:"sacrifices"` // インデックス0=Rank1到達生贄 … 4=Rank5到達生贄
}

// MajorSyndicates は6大シンジケートの固定リスト。表示順は陣営ごとにまとめてある。
var MajorSyndicates = []SyndicateInfo{
	{Name: "Steel Meridian", Faction: FactionLeft, Ranks: RankNames{"Brave", "Valiant", "Defender", "Protector", "General"}, Sacrifices: SacrificeItems{"Morphics×2", "Forma×1", "Orokin Catalyst×1", "Aya×2", "Aya×3"}},
	{Name: "Arbiters of Hexis", Faction: FactionLeft, Ranks: RankNames{"Principled", "Authentic", "Lawful", "Crusader", "Maxim"}, Sacrifices: SacrificeItems{"Gallium×2", "Forma×1", "Orokin Reactor×1", "Aya×2", "Aya×3"}},
	{Name: "Cephalon Suda", Faction: FactionLeft, Ranks: RankNames{"Competent", "Intriguing", "Intelligent", "Wise", "Genius"}, Sacrifices: SacrificeItems{"Control Module×2", "Forma×1", "Orokin Catalyst×1", "Aya×2", "Aya×3"}},
	{Name: "Red Veil", Faction: FactionRight, Ranks: RankNames{"Respected", "Honored", "Esteemed", "Revered", "Exalted"}, Sacrifices: SacrificeItems{"Gallium×2", "Forma×1", "Orokin Catalyst×1", "Aya×2", "Aya×3"}},
	{Name: "The Perrin Sequence", Faction: FactionRight, Ranks: RankNames{"Associate", "Senior Associate", "Executive", "Senior Executive", "Partner"}, Sacrifices: SacrificeItems{"Detonite Ampule×2", "Forma×1", "Orokin Reactor×1", "Aya×2", "Aya×3"}},
	{Name: "New Loka", Faction: FactionRight, Ranks: RankNames{"Humane", "Bountiful", "Benevolent", "Pure", "Flawless"}, Sacrifices: SacrificeItems{"Fieldron Sample×2", "Forma×1", "Orokin Reactor×1", "Aya×2", "Aya×3"}},
}

// RecoverySacrifice はマイナスランク(-1)からNeutral(0)へ回復する際の生贄を返す。
// 実データ3件（Red Veil/Cephalon Suda/The Perrin Sequence）から発見した法則により、
// 常にそのシンジケートのRank3到達生贄と同一（未検証の3シンジケートもこの法則からの推定、
// 2026-08-19、03_Data_Source_Research.md 2.17節）。
func RecoverySacrifice(syndicateName string) string {
	for _, s := range MajorSyndicates {
		if s.Name == syndicateName {
			return s.Sacrifices[2]
		}
	}
	return ""
}

// MinRank/MaxRank はランク値の許容範囲。
const (
	MinRank = -2
	MaxRank = 5
)

// RankLabel はランク値から表示ラベルを作る（範囲外はクランプしない、呼び出し側の責任）。
// 例: RankLabel("Red Veil", 3) => "Esteemed (Rank 3)"
func RankLabel(syndicateName string, rank int) string {
	switch {
	case rank == 0:
		return "Neutral (Rank 0)"
	case rank < 0:
		return "敵対 (Rank " + strconv.Itoa(rank) + ")"
	case rank >= 1 && rank <= 5:
		for _, s := range MajorSyndicates {
			if s.Name == syndicateName {
				return s.Ranks[rank-1] + " (Rank " + strconv.Itoa(rank) + ")"
			}
		}
	}
	return "Rank " + strconv.Itoa(rank)
}

// CurrentSchemaVersion is the on-disk shape version this build writes.
const CurrentSchemaVersion = 1

// Data は永続化される全体データ。Ranks は SyndicateInfo.Name をキーに現在ランクを持つ。
// HighestRankReached は同じキーで「生贄を払い済みの最高到達ランク」という不可逆な実績値
// （現在ランクとは独立、降格しても下がらない。2026-08-19設計）。
// MajorSyndicatesに無いキーが紛れ込んでも読み込み自体は許容する（将来シンジケートが
// 増えた場合の移行を壊さないため）。
type Data struct {
	SchemaVersion      int            `json:"schemaVersion"`
	Ranks              map[string]int `json:"ranks"`
	HighestRankReached map[string]int `json:"highestRankReached"`
}

func NewData() *Data {
	d := &Data{SchemaVersion: CurrentSchemaVersion, Ranks: make(map[string]int), HighestRankReached: make(map[string]int)}
	for _, s := range MajorSyndicates {
		d.Ranks[s.Name] = 0
		d.HighestRankReached[s.Name] = 0
	}
	return d
}
