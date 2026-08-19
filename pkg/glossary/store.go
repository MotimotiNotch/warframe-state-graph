package glossary

import (
	"fmt"
	"os"
	"sync"

	"warframe-state-graph/pkg/persist"
)

// FileStore は pkg/standing / pkg/collection と同じ設計（単一JSONファイル、ミューテックスで直列化）。
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
	d := NewData()
	if err := persist.LoadJSON(s.path, d); err != nil {
		if os.IsNotExist(err) {
			return s.seedDefaultLocked()
		}
		return nil, fmt.Errorf("read glossary file: %w", err)
	}
	if d.Entries == nil {
		d.Entries = make(map[string]Entry)
	}
	if d.SchemaVersion == 0 {
		d.SchemaVersion = CurrentSchemaVersion
	}
	return d, nil
}

// seedDefaultLocked は初回起動時（ファイル未作成）にRiven28種をデフォルトシードして保存する。
func (s *FileStore) seedDefaultLocked() (*Data, error) {
	d := NewData()
	for _, e := range DefaultRivenEntries {
		d.Entries[e.EnKey] = e
	}
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *FileStore) saveLocked(d *Data) error {
	d.SchemaVersion = CurrentSchemaVersion
	return persist.Save(s.path, d)
}

// Upsert は1件の用語を新規作成または上書きする。
func (s *FileStore) Upsert(e Entry) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.Entries[e.EnKey] = e
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// Delete は1件の用語を削除する。存在しないキーの削除はno-op。
func (s *FileStore) Delete(enKey string) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	delete(d.Entries, enKey)
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}
