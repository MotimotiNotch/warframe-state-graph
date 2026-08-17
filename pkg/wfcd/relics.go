package wfcd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// missionRewardsURL は warframe-drop-data の全ノード横断ミッション報酬テーブル。
// syndicates.json と同じ data/ 直下の配置規約（03_Data_Source_Research.md 2節で確認済み）。
const missionRewardsURL = "https://raw.githubusercontent.com/WFCD/warframe-drop-data/master/data/missionRewards.json"

// relicNamePattern はミッション報酬テーブル内の値からレリック名だけを拾うための正規表現。
// missionRewards.json の正確な入れ子構造（惑星→ノード→ローテーション→報酬）は
// バージョンによって変わりうるため、構造に依存せず全文字列値を舐めてこのパターンに
// マッチするものだけを集める汎用スキャン方式にしてある（構造変化への耐性を優先）。
var relicNamePattern = regexp.MustCompile(`^(Lith|Meso|Neo|Axi) [A-Z]\d{1,2}(?: Relic)?(?: \([^)]*\))?$`)

// normalizeRelicName は "Axi A22 Relic (Radiant)" のような表記ゆれを "Axi A22" に正規化する。
// レリック自体の識別（Vault済みかどうか）はティア+記号の組だけで決まり、精錬状態(Radiant等)は無関係。
func normalizeRelicName(name string) string {
	name = strings.TrimSpace(name)
	if i := strings.Index(name, " ("); i >= 0 {
		name = name[:i]
	}
	name = strings.TrimSuffix(name, " Relic")
	return strings.TrimSpace(name)
}

// FetchActiveRelicNames は missionRewards.json を1回スキャンし、現行ドロップテーブルに
// 登場する全レリック名の集合を返す（2.12節で実データ検証済みの方式）。
// ここに存在しないレリックは Vault済みと推定する。
func FetchActiveRelicNames() (map[string]bool, error) {
	resp, err := http.Get(missionRewardsURL)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", missionRewardsURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: status %d", missionRewardsURL, resp.StatusCode)
	}

	var raw any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode %s: %w", missionRewardsURL, err)
	}

	active := make(map[string]bool)
	var walk func(v any)
	walk = func(v any) {
		switch t := v.(type) {
		case string:
			if relicNamePattern.MatchString(t) {
				active[normalizeRelicName(t)] = true
			}
		case []any:
			for _, e := range t {
				walk(e)
			}
		case map[string]any:
			for _, e := range t {
				walk(e)
			}
		}
	}
	walk(raw)
	return active, nil
}

// CachedActiveRelicNames はアクティブレリック集合をキャッシュ付き取得する。
// mapは順序を持たないためJSONキャッシュには文字列スライスとして保存/復元する。
func CachedActiveRelicNames(cacheDir string) (map[string]bool, error) {
	names, err := CachedJSON(cacheDir, "active-relics.json", func() ([]string, error) {
		set, err := FetchActiveRelicNames()
		if err != nil {
			return nil, err
		}
		list := make([]string, 0, len(set))
		for name := range set {
			list = append(list, name)
		}
		return list, nil
	})
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(names))
	for _, n := range names {
		set[n] = true
	}
	return set, nil
}

// IsRelicVaulted はレリック名（"Axi A22" 等、精錬状態や"Relic"接尾辞つきでも可）が
// 現行ドロップテーブルに存在しないか（＝Vault済みと推定されるか）を判定する。
func IsRelicVaulted(activeRelics map[string]bool, relicName string) bool {
	return !activeRelics[normalizeRelicName(relicName)]
}

// vaultTraderURL は warframestat.us のライブAPI。WebFetchツールは403で弾かれるが
// Goのnet/httpは到達できることを確認済み（2.13節、ホスト固有TLS問題とは別の非対称性）。
const vaultTraderURL = "https://api.warframestat.us/pc/vaultTrader"

// VaultTraderEntry は Prime Resurgence（Varzia）の今月の在庫1件。
type VaultTraderEntry struct {
	Item    string `json:"item"`
	Ducats  int    `json:"ducats"`
	Credits int    `json:"credits"`
}

// VaultTrader は Varzia の現在ローテーション。
type VaultTrader struct {
	Activation string             `json:"activation"`
	Expiry     string             `json:"expiry"`
	Character  string             `json:"character"`
	Inventory  []VaultTraderEntry `json:"inventory"`
}

func FetchVaultTrader() (VaultTrader, error) {
	resp, err := http.Get(vaultTraderURL)
	if err != nil {
		return VaultTrader{}, fmt.Errorf("fetch %s: %w", vaultTraderURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return VaultTrader{}, fmt.Errorf("fetch %s: status %d", vaultTraderURL, resp.StatusCode)
	}
	var vt VaultTrader
	if err := json.NewDecoder(resp.Body).Decode(&vt); err != nil {
		return VaultTrader{}, fmt.Errorf("decode %s: %w", vaultTraderURL, err)
	}
	return vt, nil
}

// CachedVaultTrader はVarzia在庫をキャッシュ付き取得する。月次ローテーションの時限データだが、
// 項目16の方針通り「キャッシュ＋手動更新ボタン」の対象に含める（自動ポーリングはしない）。
func CachedVaultTrader(cacheDir string) (VaultTrader, error) {
	return CachedJSON(cacheDir, "vault-trader.json", FetchVaultTrader)
}
