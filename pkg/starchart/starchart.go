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
// 旧"DeepSpace"エントリ（"Deep Space (Empyrean)"）は2026-08-22に削除した——Proxima分離の
// 過程で、非"_SPACE"接尾辞の"DeepSpace"ノードは実データに1件も存在せず、このキーは
// 実質groupProxima側の"DeepSpace_SPACE"（Veil Proxima）の誤集計だったと判明したため
// （groupPlanetsが到達し得ないデッドエントリになっていた）。
var displayNames = map[string]string{
	"SolarMapDeimosName":    "Deimos",
	"ZarimanRegionName":     "Zariman",
	"1999MapName":           "1999 (Höllvania)",
	"TauRegion":             "Albrecht's Labs (Tau)",
	"RelayStationSanctuary": "Sanctuary (Cephalon Simaris)",
}

// steelPathExcluded は Hotfix 38.5.3 時点でSteel Path要求から撤廃済みのsystem
// （The New War以降のコンテンツ）。Wiki確認済み（2026-08-19、
// 03_Data_Source_Research.md/02_Requirements_and_Roadmap.md項目20参照）。
var steelPathExcluded = map[string]bool{
	"ZarimanRegionName": true,
	"TauRegion":         true,
	"1999MapName":       true,
}

// excludedSystems はこのリストから完全に除外するsystem。Duviriは固定ノードの星図モデルに
// そぐわないため対象外とする（2026-08-19設計）。なお、デュビリ本編（Lone Story等）のクリア
// 状況はこのツール全体でスコープ外——Collections独立セクション（pkg/collection.
// IncarnonEntry）が扱うのはインカーノン進捗のみで、「デュビリ本編クリア」自体はどこにも
// 保持しない（2026-08-22再訂正、当初はCollections側がDuviri完了を保持する想定だったが
// 変更された）。
var excludedSystems = map[string]bool{
	"Duviri": true,
}

// spaceSuffix付きのsystemName（Earth_SPACE等）はRailjack Proxima。当初は同じ惑星の一部として
// 基礎惑星のノード数に合算していたが（2026-08-19）、Railjack側にProxima別の進捗セクションを
// 新設するにあたり二重管理を避けるため分離した（2026-08-22）——星図側(groupPlanets)はこの
// 接尾辞のノードを完全にスキップし、groupProximaが別途集計する。
const spaceSuffix = "_SPACE"

// proximaExcluded はgroupProximaの対象から除外するキー（trimSuffix後）。Uranus_SPACEは
// 通常のRailjack Proxima進行（Earth→Venus→Saturn→Neptune→Pluto→Veil）とは別枠の、
// Jade Shadows: Constellations完了後専用のミッション（Wiki「Uranus Proxima」ページで
// 確認済み、2026-08-22）で、ネタバレ性が高いため除外する（星図のDuviri除外と同じ考え方）。
var proximaExcluded = map[string]bool{
	"Uranus": true,
}

// proximaDisplayNames はRailjack Proximaの表示名。マッピングが無いキーは「<Key> Proxima」
// を機械的に組み立てる（Earth→"Earth Proxima"等、実データと一致）。DeepSpaceだけは例外——
// 実データ上「DeepSpace」という接尾辞無しの星図ノードは存在せず（2026-08-22精査で確認）、
// "DeepSpace_SPACE"は実質Railjackの最終/最難関エリアVeil Proximaそのものなので専用の
// 表示名を割り当てる。
var proximaDisplayNames = map[string]string{
	"DeepSpace": "Veil Proxima",
}

func proximaDisplayNameFor(key string) string {
	if n, ok := proximaDisplayNames[key]; ok {
		return n
	}
	return key + " Proxima"
}

// Proxima はRailjack Proxima1地域分の集計結果。Steel PathはProxima全域で適用されるため
// （2026-08-22、WebSearchで確認）、Planetと異なりSteelPathApplicableは持たない。
type Proxima struct {
	Key         string `json:"key"`
	DisplayName string `json:"displayName"`
	NodeCount   int    `json:"nodeCount"`
}

// FetchProxima はExportRegions.jsonを取得し、Railjack Proxima地域ごとのノード総数を
// 集計して返す（表示名アルファベット順）。
func FetchProxima() ([]Proxima, error) {
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
	return groupProxima(raw), nil
}

func groupProxima(raw map[string]regionNode) []Proxima {
	counts := make(map[string]int)
	for nodeID, node := range raw {
		if strings.HasPrefix(nodeID, "ClanNode") {
			continue
		}
		segs := strings.Split(node.SystemName, "/")
		key := segs[len(segs)-1]
		if !strings.HasSuffix(key, spaceSuffix) {
			continue
		}
		key = strings.TrimSuffix(key, spaceSuffix)
		if key == "" || proximaExcluded[key] {
			continue
		}
		counts[key]++
	}

	proxima := make([]Proxima, 0, len(counts))
	for key, count := range counts {
		proxima = append(proxima, Proxima{
			Key:         key,
			DisplayName: proximaDisplayNameFor(key),
			NodeCount:   count,
		})
	}
	sort.Slice(proxima, func(i, j int) bool { return proxima[i].DisplayName < proxima[j].DisplayName })
	return proxima
}

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
		if strings.HasSuffix(key, spaceSuffix) {
			continue // Railjack Proxima。groupProximaが別途集計する。
		}
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
