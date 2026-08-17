package collection

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

// FileStore は pkg/loadout と同じ設計（単一JSONファイル、ミューテックスで直列化）。
// データが別概念なのでファイルも完全に分離する。
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
	raw, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return NewData(), nil
	}
	if err != nil {
		return nil, fmt.Errorf("read collections file: %w", err)
	}
	d := NewData()
	if err := json.Unmarshal(raw, d); err != nil {
		return nil, fmt.Errorf("parse collections file: %w", err)
	}
	if d.Rivens == nil {
		d.Rivens = make(map[string]*RivenEntry)
	}
	if d.Kuva == nil {
		d.Kuva = make(map[string]*KuvaEntry)
	}
	return d, nil
}

func (s *FileStore) saveLocked(d *Data) error {
	raw, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal collections data: %w", err)
	}
	if err := os.WriteFile(s.path, raw, 0644); err != nil {
		return fmt.Errorf("write collections file: %w", err)
	}
	return nil
}

func (s *FileStore) UpsertRiven(entry *RivenEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	d.Rivens[entry.ID] = entry
	return s.saveLocked(d)
}

func (s *FileStore) DeleteRiven(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	delete(d.Rivens, id)
	return s.saveLocked(d)
}

func (s *FileStore) UpsertKuva(entry *KuvaEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	d.Kuva[entry.ID] = entry
	return s.saveLocked(d)
}

func (s *FileStore) DeleteKuva(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	delete(d.Kuva, id)
	return s.saveLocked(d)
}
