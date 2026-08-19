// Package starchart は星図(Star Chart)/Steel Path進捗の「分母」（惑星/システムごとの
// 総ノード数）を calamity-inc/warframe-public-export-plus の ExportRegions.json
// （ノードID→ミッションノードのマップ、各エントリの systemName で惑星を判別できる）から
// 機械集計する。
//
// 「State更新コストの極小化」原則と数百ノード規模の星図は真っ向から衝突するため、
// ノード個別トグルは持たない。ここで提供するのは惑星単位の粗い総数（分母）だけで、
// 分子（クリア済み数）はこのpackageのスコープ外——pkg/standingと同じ「現在値を直接
// 保持・更新」方式でStats機能側が持つ（2026-08-19設計、02_Requirements_and_Roadmap.md
// 項目20）。
package starchart

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
)

const regionsSourceURL = "https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/senpai/ExportRegions.json"

// displayNames は systemName の末尾セグメント（生のキー）から読める表示名への対応。
// マッピングが無いキーはそのままKeyを表示名として使う（Mercury/Venus/Earth等はこれで足りる）。
var displayNames = map[string]string{
	"SolarMapDeimosName":    "Deimos",
	"ZarimanRegionName":     "Zariman",
	"1999MapName":           "1999 (Höllvania)",
	"TauRegion":             "Albrecht's Labs (Tau)",
	"RelayStationSanctuary": "Sanctuary (Cephalon Simaris)",
	"DeepSpace":             "Deep Space (Empyrean)",
}

// steelPathExcluded は Hotfix 38.5.3 時点でSteel Path要求から撤廃済みのsystem
// （The New War以降のコンテンツ）。Wiki確認済み（2026-08-19、
// 03_Data_Source_Research.md/02_Requirements_and_Roadmap.md項目20参照）。
var steelPathExcluded = map[string]bool{
	"ZarimanRegionName": true,
	"TauRegion":         true,
	"1999MapName":       true,
}

// excludedSystems はこのリストから完全に除外するsystem。Duviriは武器単位の登録制ではなく
// Collections独立セクション（pkg/collection.DuviriData）を唯一の真実源とするため、ここでは
// 二重管理を避けて意図的にフィルタする（2026-08-19設計）。
var excludedSystems = map[string]bool{
	"Duviri": true,
}

// spaceSuffix付きのsystemName（Earth_SPACE等、Railjack Proxima）は同じ惑星の一部として
// 基礎惑星のノード数に合算する——「Earth」「Earth_SPACE」という似た名前の別行が並ぶ方が
// 「惑星単位の粗い分数」という割り切りの趣旨から見て紛らわしいと判断（2026-08-19）。
const spaceSuffix = "_SPACE"

// Planet は星図の1惑星/システム分の集計結果。
type Planet struct {
	// Key は systemName の末尾セグメント（例: "Earth"）。表示名ではなく安定した識別子として
	// 保存・APIキーに使う想定（displayNamesの更新で表示だけ変わっても既存の入力データが
	// 迷子にならないように）。
	Key                 string `json:"key"`
	DisplayName         string `json:"displayName"`
	NodeCount           int    `json:"nodeCount"`
	SteelPathApplicable bool   `json:"steelPathApplicable"`
}

func displayNameFor(key string) string {
	if n, ok := displayNames[key]; ok {
		return n
	}
	return key
}

// FetchPlanets はExportRegions.jsonを取得し、惑星/システムごとのノード総数を集計して返す
// （表示名アルファベット順）。ClanNodeエントリ（Dojo）は対象外。
func FetchPlanets() ([]Planet, error) {
	resp, err := http.Get(regionsSourceURL)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", regionsSourceURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: status %d", regionsSourceURL, resp.StatusCode)
	}

	var raw map[string]regionNode
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode %s: %w", regionsSourceURL, err)
	}
	return groupPlanets(raw), nil
}

type regionNode struct {
	SystemName string `json:"systemName"`
}

// groupPlanets はExportRegions.jsonの生データ（ノードID→ノード）を惑星/システム単位に
// 集計する。HTTPから切り離してあるのでユニットテストしやすい。
func groupPlanets(raw map[string]regionNode) []Planet {
	counts := make(map[string]int)
	for nodeID, node := range raw {
		if strings.HasPrefix(nodeID, "ClanNode") {
			continue
		}
		segs := strings.Split(node.SystemName, "/")
		key := segs[len(segs)-1]
		key = strings.TrimSuffix(key, spaceSuffix)
		if key == "" || excludedSystems[key] {
			continue
		}
		counts[key]++
	}

	planets := make([]Planet, 0, len(counts))
	for key, count := range counts {
		planets = append(planets, Planet{
			Key:                 key,
			DisplayName:         displayNameFor(key),
			NodeCount:           count,
			SteelPathApplicable: !steelPathExcluded[key],
		})
	}
	sort.Slice(planets, func(i, j int) bool { return planets[i].DisplayName < planets[j].DisplayName })
	return planets
}
