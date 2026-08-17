package wfcd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Drop は Component の入手先（レリック/ドロップ元）1件分。
type Drop struct {
	Location string  `json:"location"`
	Chance   float64 `json:"chance"`
}

// Component は Item.Components の1要素（パーツ複数型の各パーツ、またはBlueprint/汎用素材）。
type Component struct {
	Name      string `json:"name"`
	ItemCount int    `json:"itemCount"`
	Drops     []Drop `json:"drops"`
}

// Item は warframe-items の1エントリのうち、ノード自動生成に必要な項目だけを拾う。
// スキーマの他フィールドは無視される（json.Unmarshalは未知フィールドを無視するので安全）。
type Item struct {
	UniqueName string      `json:"uniqueName"`
	Name       string      `json:"name"`
	Category   string      `json:"category"`
	Type       string      `json:"type"` // Misc.json内の "Zaw Component" / "Kitgun Component" / "Amp" 等
	Tags       []string    `json:"tags"`
	Components []Component `json:"components"`

	// Riven武器アーキタイプ判定用（03_Data_Source_Research.md、item2の2026-08-17追加スコープ）。
	Disposition        float64 `json:"disposition"`
	CriticalChance     float64 `json:"criticalChance"`
	CriticalMultiplier float64 `json:"criticalMultiplier"`
	ProcChance         float64 `json:"procChance"`
}

// Category は warframe-items の data/json 配下のカテゴリファイル名（拡張子抜き）。
// 2.5節で調査済みの一覧のうち、ノード生成/Loadouts拡張の候補になるもの。
const (
	CategoryWarframes       = "Warframes"
	CategoryPrimary         = "Primary"
	CategorySecondary       = "Secondary"
	CategoryMelee           = "Melee"
	CategoryArchwing        = "Archwing"
	CategoryArchGun         = "Arch-Gun"
	CategoryArchMelee       = "Arch-Melee"
	CategorySentinels       = "Sentinels"
	CategorySentinelWeapons = "SentinelWeapons"
	CategoryPets            = "Pets"
	CategoryMods            = "Mods"
	CategoryArcanes         = "Arcanes"
	CategoryRelics          = "Relics"
	CategoryResources       = "Resources"
	CategoryMisc            = "Misc"
)

func itemsCategoryURL(category string) string {
	return "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/" + category + ".json"
}

// FetchItemsFull はカテゴリ全件をフルフィールドで取得する（名前だけのCachedNamesと違い、
// components/drops/disposition等ノード自動生成に必要な情報を含む）。
func FetchItemsFull(category string) ([]Item, error) {
	url := itemsCategoryURL(category)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: status %d", url, resp.StatusCode)
	}
	var items []Item
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, fmt.Errorf("decode %s: %w", url, err)
	}
	return items, nil
}

// CachedItemsFull はカテゴリ単位でフルアイテムデータをキャッシュ付き取得する。
func CachedItemsFull(cacheDir, category string) ([]Item, error) {
	return CachedJSON(cacheDir, category+"-full.json", func() ([]Item, error) {
		return FetchItemsFull(category)
	})
}

// FindItemByName は取得済みアイテム一覧から名前完全一致（大小無視）で1件探す。
func FindItemByName(items []Item, name string) (Item, bool) {
	for _, it := range items {
		if strings.EqualFold(it.Name, name) {
			return it, true
		}
	}
	return Item{}, false
}
