// Package wfcd は WFCD (Warframe Community Developers) の公開データ
// (github.com/WFCD/warframe-items の data/json 配下) から、フレーム/武器名だけを
// 軽量に取得・キャッシュする。03_Data_Source_Research.md で調査した
// 「オンデマンド取得・軽量キャッシュ」方針の実装。
//
// 注意: このホストではcurl（schannel）がTLS失効確認まわりで失敗する既知の問題があるが、
// Go標準のnet/httpは同じホストから問題なくraw.githubusercontent.comに到達できることを確認済み。
package wfcd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
)

const (
	frameSourceURL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Warframes.json"
)

var weaponSourceURLs = []string{
	"https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Primary.json",
	"https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Secondary.json",
	"https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Melee.json",
}

type nameEntry struct {
	Name string `json:"name"`
}

func fetchNames(url string) ([]string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: status %d", url, resp.StatusCode)
	}
	var entries []nameEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil, fmt.Errorf("decode %s: %w", url, err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.Name != "" {
			names = append(names, e.Name)
		}
	}
	return names, nil
}

// CachedNames はcacheDir配下のcacheFileにある名前リストを返す。無ければfetchで取得して保存する。
// フレーム/武器名は頻繁に変わらないため、キャッシュファイルが存在する限り再取得しない
// （更新したい場合はキャッシュファイルを消せば次回再取得される、というシンプルな運用）。
func CachedNames(cacheDir, cacheFile string, fetch func() ([]string, error)) ([]string, error) {
	path := filepath.Join(cacheDir, cacheFile)
	if data, err := os.ReadFile(path); err == nil {
		var names []string
		if json.Unmarshal(data, &names) == nil {
			return names, nil
		}
	}

	names, err := fetch()
	if err != nil {
		return nil, err
	}
	sort.Strings(names)

	if err := os.MkdirAll(cacheDir, 0755); err == nil {
		if data, err := json.MarshalIndent(names, "", "  "); err == nil {
			_ = os.WriteFile(path, data, 0644)
		}
	}
	return names, nil
}

func FetchFrameNames() ([]string, error) {
	return fetchNames(frameSourceURL)
}

func FetchWeaponNames() ([]string, error) {
	seen := map[string]bool{}
	var names []string
	for _, url := range weaponSourceURLs {
		part, err := fetchNames(url)
		if err != nil {
			return nil, err
		}
		for _, n := range part {
			if !seen[n] {
				seen[n] = true
				names = append(names, n)
			}
		}
	}
	return names, nil
}

// FetchCompanionNames はコンパニオン本体の名前一覧。Pets.jsonはコンパニオン本体
// （Type=="Pets"）だけでなくPet Parts/Pet Resource（交配素材等）も同居しているため
// Typeで絞り込む（03_Data_Source_Research.md 2.10節、実データ検証で確認済み）。
// MOA(Lambeo/Nychus/Oloro/Para)はPets.json側に含まれるが、Sentinel本体は別ファイル
// (Sentinels.json、全件Type=="Sentinel")なので合算する。
func FetchCompanionNames() ([]string, error) {
	pets, err := FetchItemsFull(CategoryPets)
	if err != nil {
		return nil, err
	}
	sentinels, err := FetchItemsFull(CategorySentinels)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, it := range pets {
		if it.Type == "Pets" {
			names = append(names, it.Name)
		}
	}
	for _, it := range sentinels {
		names = append(names, it.Name)
	}
	return names, nil
}
