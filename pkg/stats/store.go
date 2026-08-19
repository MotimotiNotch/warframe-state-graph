package stats

import (
	"fmt"
	"os"
	"sync"

	"warframe-state-graph/pkg/persist"
)

// FileStore は pkg/standing と同じ設計（単一JSONファイル、ミューテックスで直列化）。
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
	d := &Data{}
	if err := persist.LoadJSON(s.path, d); err != nil {
		if os.IsNotExist(err) {
			return NewData(), nil
		}
		return nil, fmt.Errorf("read stats file: %w", err)
	}
	if d.Planets == nil {
		d.Planets = make(map[string]*PlanetProgress)
	}
	if d.RailjackIntrinsics == nil {
		d.RailjackIntrinsics = make(map[string]int)
	}
	if d.DrifterIntrinsics == nil {
		d.DrifterIntrinsics = make(map[string]int)
	}
	for _, name := range RailjackCategories {
		if _, ok := d.RailjackIntrinsics[name]; !ok {
			d.RailjackIntrinsics[name] = 0
		}
	}
	for _, name := range DrifterCategories {
		if _, ok := d.DrifterIntrinsics[name]; !ok {
			d.DrifterIntrinsics[name] = 0
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

// SetPlanetProgress は1惑星/システムの分子（クリア済み数/Steel Pathクリア済み数）を更新する。
func (s *FileStore) SetPlanetProgress(planetKey string, progress PlanetProgress) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.Planets[planetKey] = &progress
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// SetRailjackIntrinsic は1系統のRailjack Intrinsicsランクを更新する。
func (s *FileStore) SetRailjackIntrinsic(category string, rank int) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.RailjackIntrinsics[category] = rank
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// SetDrifterIntrinsic は1系統のDrifter Intrinsicsランクを更新する。
func (s *FileStore) SetDrifterIntrinsic(category string, rank int) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.DrifterIntrinsics[category] = rank
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}
