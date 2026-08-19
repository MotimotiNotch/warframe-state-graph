package standing

import (
	"fmt"
	"os"
	"sync"

	"warframe-state-graph/pkg/persist"
)

// FileStore は pkg/collection と同じ設計（単一JSONファイル、ミューテックスで直列化）。
type FileStore struct {
	path string
	mu   sync.Mutex
}

func NewFileStore(path string) *FileStore {
	return &FileStore{path: path}
}

func (s *FileStore) Load() (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

func (s *FileStore) loadLocked() (*Data, error) {
	// NewData()ではなく空のData{}から始める: NewData()は全シンジケートをHighestRankReached=0で
	// 事前に埋めてしまい、以後のUnmarshalはJSONに無いキーを上書きしないため、
	// 「このフィールドがファイルに存在しない（=移行が必要な旧ファイル）」を検出できなくなる
	// （実際にこのバグでテストが落ちた: 2026-08-19）。
	d := &Data{}
	if err := persist.LoadJSON(s.path, d); err != nil {
		if os.IsNotExist(err) {
			return NewData(), nil
		}
		return nil, fmt.Errorf("read standing file: %w", err)
	}
	if d.Ranks == nil {
		d.Ranks = make(map[string]int)
	}
	if d.HighestRankReached == nil {
		d.HighestRankReached = make(map[string]int)
	}
	// AllSyndicatesに含まれるがファイルにまだ無いシンジケート（新規追加時、16シンジケート
	// 拡張で10件増えた場合も含む）はNeutral(0)で補完する。HighestRankReachedがまだ無い場合
	// （このフィールド追加前の既存ファイルからの移行、または新規シンジケート）は、既存の
	// 現在ランク（正の値のみ、負のランクは「未到達」扱い）をそのまま最高到達ランクの初期値
	// として引き継ぐ——実績を失わせないための一度きりの移行ロジック。
	for _, syn := range AllSyndicates {
		if _, ok := d.Ranks[syn.Name]; !ok {
			d.Ranks[syn.Name] = 0
		}
		if _, ok := d.HighestRankReached[syn.Name]; !ok {
			highest := d.Ranks[syn.Name]
			if highest < 0 {
				highest = 0
			}
			d.HighestRankReached[syn.Name] = highest
		}
	}
	if d.SchemaVersion == 0 {
		d.SchemaVersion = CurrentSchemaVersion
	}
	return d, nil
}

func (s *FileStore) saveLocked(d *Data) error {
	d.SchemaVersion = CurrentSchemaVersion
	return persist.Save(s.path, d)
}

// SetRank は1シンジケートの現在ランクを更新する。rankはMinRank..MaxRankの範囲外でも
// 呼び出し側の入力をそのまま受け入れる（バリデーションはHTTPハンドラ側の責務）。
// 同時に HighestRankReached を「これまでの最高値とrankの大きい方」へ自動更新する
// （負のランクは実績にカウントしない、不可逆な実績値という設計どおり）。
func (s *FileStore) SetRank(syndicateName string, rank int) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.Ranks[syndicateName] = rank
	if rank > d.HighestRankReached[syndicateName] {
		d.HighestRankReached[syndicateName] = rank
	}
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// SetHighestRankReached は1シンジケートの最高到達実績を直接上書きする。SetRankとは違い
// 大きい方だけを採用するクランプはせず、指定値をそのまま入れる——現在ランクの誤選択で
// 意図せず実績が繰り上がってしまった時に、手動で訂正するための操作（2026-08-19追加）。
func (s *FileStore) SetHighestRankReached(syndicateName string, rank int) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.HighestRankReached[syndicateName] = rank
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}
