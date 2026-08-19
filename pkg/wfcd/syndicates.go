package wfcd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// syndicatesURL は warframe-drop-data の全シンジケート報酬テーブル。実データ検証で
// トップレベルが {"syndicates": {name: [entries]}} という1段ラップ構造だと判明した
// （03_Data_Source_Research.md 2節のサンプルはラップ無しで書かれており実際と異なる）。
const syndicatesURL = "https://raw.githubusercontent.com/WFCD/warframe-drop-data/master/data/syndicates.json"

// SyndicateEntry は1シンジケートの報酬1件分。Standing は「そのランクに到達するために
// 必要な累計standing」ではなく「そのランクで購入する際に消費するstandingコスト（値段）」
// である点に注意（実データで確認済み、既存ドキュメントに無かった重要な区別）。
type SyndicateEntry struct {
	Item     string  `json:"item"`
	Chance   float64 `json:"chance"`
	Rarity   string  `json:"rarity"`
	Place    string  `json:"place"` // "<Syndicate Name>, <Rank Name>" という文字列結合
	Standing int     `json:"standing"`
}

type syndicatesWrap struct {
	Syndicates map[string][]SyndicateEntry `json:"syndicates"`
}

func FetchSyndicates() (map[string][]SyndicateEntry, error) {
	resp, err := http.Get(syndicatesURL)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", syndicatesURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: status %d", syndicatesURL, resp.StatusCode)
	}
	var w syndicatesWrap
	if err := json.NewDecoder(resp.Body).Decode(&w); err != nil {
		return nil, fmt.Errorf("decode %s: %w", syndicatesURL, err)
	}
	return w.Syndicates, nil
}

// CachedSyndicates はシンジケート報酬テーブルをキャッシュ付き取得する。
func CachedSyndicates(cacheDir string) (map[string][]SyndicateEntry, error) {
	return CachedJSON(cacheDir, "syndicates.json", FetchSyndicates)
}

// SyndicateRank は武器の入手に必要なシンジケートランクの逆引き結果。
type SyndicateRank struct {
	Syndicate string // 例: "Red Veil"
	RankLabel string // place末尾のランク名。例: "Exalted"（シンジケートごとに語彙が異なる）
	Standing  int    // そのランクでの購入コスト（累計到達standingではない）
}

// FindSyndicateWeaponRank は武器名（完全一致・大小無視）からその武器を購入できる
// シンジケート・ランクを逆引きする。同じ武器名が複数シンジケートにまたがることは
// 想定していない（Vaykor/Secura/Rakta/Synoid/Telos/Sanctiは各1シンジケート専属のため）。
func FindSyndicateWeaponRank(data map[string][]SyndicateEntry, weaponName string) (SyndicateRank, bool) {
	for syndicate, entries := range data {
		for _, e := range entries {
			if !strings.EqualFold(e.Item, weaponName) {
				continue
			}
			// Place は "<Syndicate>, <Rank>" 形式。カンマ以降をランク名として抜き出す。
			rank := e.Place
			if i := strings.LastIndex(e.Place, ", "); i >= 0 {
				rank = strings.TrimSpace(e.Place[i+2:])
			}
			return SyndicateRank{Syndicate: syndicate, RankLabel: rank, Standing: e.Standing}, true
		}
	}
	return SyndicateRank{}, false
}
