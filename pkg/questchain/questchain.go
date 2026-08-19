// Package questchain はWarframeのメインストーリークエストの前提関係（このクエストを
// 始めるにはどのクエストをクリアしている必要があるか）を静的テーブルとして提供する。
//
// 【なぜ静的ハードコードなのか】WFCD (warframe-items/Quests.json、46件) にも
// calamity-inc/warframe-public-export-plus (ExportKeys.json、574件) にも、クエスト間の
// 前提関係を示すフィールドは存在しないことを実データ検証で確認済み（2026-08-19、
// 03_Data_Source_Research.md参照）。特にExportKeys.jsonの `rewards[].itemType` が
// 次クエストのキーを指すのではないかという仮説も、全574件を解析して直接一致0件で
// 反証済み。前提関係はDEサーバー側のワールドステートロジックにハードコードされており
// 公開データセットには出てこないと推定される。Kuva/Tenet/Coda武器のプレフィックス判定
// （03_Data_Source_Research.md 2.6節）と同じく、この種の「データセットに存在しない知識」は
// 人力メンテのハードコード表として持つほかない、という設計判断。
//
// 【出典・精度についての注意】以下のテーブルは WARFRAME Wiki の Quest ページ
// (https://wiki.warframe.com/w/Quest, 2026-08-19 WebFetch要約で確認)の
// "Quest Progression" セクションを基にしている。ページ本文を直接精査したのではなく
// AI要約を経由しているため、特に枝分かれ（1クエストから複数の後続クエストが伸びる箇所）
// の正確性は保証できない。新クエスト追加時・記載ミス発見時は本表を直接手動更新すること
// （Wikiページを人間の目で確認しながらの更新を推奨）。
package questchain

import (
	"regexp"
	"strings"
)

// Entry はクエスト1件と、それを開始するために必要な前提クエスト（複数可、AND条件）。
// 前提が無い（ストーリーの起点、または前提不明のためエントリ自体を書いていない）場合は
// Prerequisites が空になる。
type Entry struct {
	Name          string
	Prerequisites []string
}

// MainStoryChain は WARFRAME Wiki "Quest" ページの Quest Progression / Arc 構成を
// 基にしたメインストーリークエストの前提関係。Source:
// https://wiki.warframe.com/w/Quest (2026-08-19確認、Update 35.0でMastery Rank要件は
// 大半のメインクエストから撤廃済みとの記載あり、本表ではMR要件は扱わずクエスト前提のみ扱う)。
var MainStoryChain = []Entry{
	// --- Arc 1: Tenno Awakening ---
	{Name: "Awakening"},
	{Name: "Vor's Prize", Prerequisites: []string{"Awakening"}},
	{Name: "The Teacher", Prerequisites: []string{"Vor's Prize"}},
	{Name: "Vox Solaris", Prerequisites: []string{"The Teacher"}},
	{Name: "Once Awake", Prerequisites: []string{"Vox Solaris"}},
	{Name: "Heart of Deimos", Prerequisites: []string{"Once Awake"}},
	{Name: "The Archwing", Prerequisites: []string{"Heart of Deimos"}},
	{Name: "Stolen Dreams", Prerequisites: []string{"The Archwing"}},
	{Name: "The New Strange", Prerequisites: []string{"Stolen Dreams"}},
	{Name: "The Duviri Paradox", Prerequisites: []string{"The New Strange"}},

	// --- Arc 2: This Is What You Are ---
	{Name: "Natah"},
	{Name: "The Second Dream", Prerequisites: []string{"Natah"}},
	{Name: "Octavia's Anthem", Prerequisites: []string{"The Second Dream"}},
	{Name: "The Silver Grove", Prerequisites: []string{"The Second Dream"}},
	{Name: "The War Within", Prerequisites: []string{"The Second Dream"}},
	{Name: "The Glast Gambit", Prerequisites: []string{"The War Within"}},
	{Name: "Rising Tide", Prerequisites: []string{"The War Within"}},
	{Name: "Chains of Harrow", Prerequisites: []string{"Rising Tide"}},
	{Name: "Apostasy Prologue", Prerequisites: []string{"Chains of Harrow"}},
	{Name: "The Sacrifice", Prerequisites: []string{"Apostasy Prologue"}},

	// --- Arc 3: The New War ---
	{Name: "Prelude to War", Prerequisites: []string{"The Sacrifice"}},
	{Name: "Chimera Prologue", Prerequisites: []string{"Prelude to War"}},
	{Name: "Erra", Prerequisites: []string{"Chimera Prologue"}},
	{Name: "The Maker", Prerequisites: []string{"Erra"}},
	// The New War は Duviri Paradox（Arc1末尾）とも絡むとWiki記載あり。ここでは
	// メインライン（Arc3内のThe Maker後）を代表の前提として採用。
	{Name: "The New War", Prerequisites: []string{"The Maker"}},
	{Name: "Angels of the Zariman", Prerequisites: []string{"The New War"}},
	{Name: "Veilbreaker", Prerequisites: []string{"The New War"}},
	{Name: "Jade Shadows", Prerequisites: []string{"Veilbreaker"}},
	{Name: "Jade Shadows: Constellations", Prerequisites: []string{"Jade Shadows"}},

	// --- Arc 4: Void War Saga ---
	{Name: "Whispers in the Walls", Prerequisites: []string{"The New War"}},
	{Name: "The Lotus Eaters", Prerequisites: []string{"Whispers in the Walls"}},
	// The Hex はWikiで「The Duviri Paradoxも前提」と明記されていた（複数前提のAND条件）。
	{Name: "The Hex", Prerequisites: []string{"The Lotus Eaters", "The Duviri Paradox"}},
	{Name: "The Old Peace", Prerequisites: []string{"The Lotus Eaters"}},
}

// entryByName は名前（大小無視）でMainStoryChainから1件引く。
func entryByName(name string) (Entry, bool) {
	for _, e := range MainStoryChain {
		if strings.EqualFold(e.Name, name) {
			return e, true
		}
	}
	return Entry{}, false
}

// slugPattern はwfcdgen.Slugと同じ変換ルール（英数字とハイフン以外を除去）。
// questchainパッケージをwfcdgenに依存させたくない（逆方向依存を避ける）ため複製している。
var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

func Slug(name string) string {
	s := strings.ToLower(name)
	s = slugPattern.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// ResolveChain は questName を起点に、前提クエストを再帰的に遡って登場した
// クエスト名一覧（questName自身を含む、重複なし）を返す。MainStoryChainに
// 登録が無いクエスト名を渡した場合は questName 単体（前提なし）を返す
// （＝サイドクエスト等、本表に載っていないクエストは「前提不明」として扱う）。
func ResolveChain(questName string) []string {
	visited := map[string]bool{}
	var order []string
	var walk func(name string)
	walk = func(name string) {
		key := strings.ToLower(name)
		if visited[key] {
			return
		}
		visited[key] = true
		entry, ok := entryByName(name)
		if !ok {
			order = append(order, name)
			return
		}
		for _, pre := range entry.Prerequisites {
			walk(pre)
		}
		order = append(order, entry.Name)
	}
	walk(questName)
	return order
}

// Prerequisites は questName の直接の前提クエスト名一覧を返す（再帰展開しない1段のみ）。
// 見つからない場合は空スライス。
func Prerequisites(questName string) []string {
	if e, ok := entryByName(questName); ok {
		return e.Prerequisites
	}
	return nil
}
