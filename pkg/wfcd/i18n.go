package wfcd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// i18nURL は warframe-items の日本語名を含む翻訳データ（約52MB）。
// 全体をメモリ上のmapとしてアンマーシャルするのは非現実的なため（19節の注意点）、
// ディスクキャッシュ後は json.Decoder のトークンストリームで目的のキーだけを拾う。
const i18nURL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/i18n.json"

func ensureI18nCache(cacheDir string) (string, error) {
	path := filepath.Join(cacheDir, "i18n.json")
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}

	resp, err := http.Get(i18nURL)
	if err != nil {
		return "", fmt.Errorf("fetch %s: %w", i18nURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetch %s: status %d", i18nURL, resp.StatusCode)
	}

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return "", fmt.Errorf("mkdir %s: %w", cacheDir, err)
	}
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return "", fmt.Errorf("create %s: %w", tmp, err)
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return "", fmt.Errorf("write %s: %w", tmp, err)
	}
	f.Close()
	if err := os.Rename(tmp, path); err != nil {
		return "", fmt.Errorf("rename %s: %w", tmp, err)
	}
	return path, nil
}

type i18nEntry struct {
	Name string `json:"name"`
}

// LookupI18nName は i18n.json の { uniqueName: { langCode: {name, ...} } } 構造から、
// 該当uniqueNameのlangCode（例: "ja"）訳名だけをストリーム走査で拾う。
// 52MB全体をメモリに載せず、目的のキーが見つかった時点でその値だけをデコードする。
func LookupI18nName(cacheDir, uniqueName, lang string) (string, error) {
	path, err := ensureI18nCache(cacheDir)
	if err != nil {
		return "", err
	}
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	dec := json.NewDecoder(f)
	if _, err := dec.Token(); err != nil { // 先頭の '{'
		return "", fmt.Errorf("decode i18n root: %w", err)
	}
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return "", fmt.Errorf("decode i18n key: %w", err)
		}
		key, _ := keyTok.(string)
		if key != uniqueName {
			var skip json.RawMessage
			if err := dec.Decode(&skip); err != nil {
				return "", fmt.Errorf("skip i18n value for %q: %w", key, err)
			}
			continue
		}
		var langs map[string]i18nEntry
		if err := dec.Decode(&langs); err != nil {
			return "", fmt.Errorf("decode i18n value for %q: %w", key, err)
		}
		entry, ok := langs[lang]
		if !ok || entry.Name == "" {
			return "", fmt.Errorf("lang %q not found for %q", lang, uniqueName)
		}
		return entry.Name, nil
	}
	return "", fmt.Errorf("uniqueName %q not found in i18n data", uniqueName)
}
