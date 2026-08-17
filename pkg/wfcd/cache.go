package wfcd

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// CachedJSON は cacheDir/cacheFile に JSON としてキャッシュ済みの値があればそれを返し、
// 無ければ fetch で取得してキャッシュに書き込む（項目16: 「キャッシュ＋手動更新」方式の共通実装）。
// 更新したい場合は RefreshCache でキャッシュディレクトリごと消せば次回アクセス時に再取得される。
func CachedJSON[T any](cacheDir, cacheFile string, fetch func() (T, error)) (T, error) {
	path := filepath.Join(cacheDir, cacheFile)
	if data, err := os.ReadFile(path); err == nil {
		var v T
		if json.Unmarshal(data, &v) == nil {
			return v, nil
		}
	}

	v, err := fetch()
	if err != nil {
		var zero T
		return zero, err
	}

	if err := os.MkdirAll(cacheDir, 0755); err == nil {
		if data, err := json.MarshalIndent(v, "", "  "); err == nil {
			_ = os.WriteFile(path, data, 0644)
		}
	}
	return v, nil
}

// RefreshCache はキャッシュディレクトリを丸ごと消す。次回アクセス時に各エンドポイントが
// 自然に再取得する（項目16の「更新ボタン」実装: ボタン押下時はこれを呼ぶだけでよい）。
func RefreshCache(cacheDir string) error {
	return os.RemoveAll(cacheDir)
}
