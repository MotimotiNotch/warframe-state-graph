package collection

import (
	"fmt"
	"os"
	"sync"

	"warframe-state-graph/pkg/persist"
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
	d := NewData()
	if err := persist.LoadJSON(s.path, d); err != nil {
		if os.IsNotExist(err) {
			return NewData(), nil
		}
		return nil, fmt.Errorf("read collections file: %w", err)
	}
	if d.Rivens == nil {
		d.Rivens = make(map[string]*RivenEntry)
	}
	if d.Kuva == nil {
		d.Kuva = make(map[string]*KuvaEntry)
	}
	if d.Frames == nil {
		d.Frames = make(map[string]*FrameEntry)
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

func (s *FileStore) UpsertFrame(entry *FrameEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	d.Frames[entry.ID] = entry
	return s.saveLocked(d)
}

func (s *FileStore) DeleteFrame(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	delete(d.Frames, id)
	return s.saveLocked(d)
}

func (s *FileStore) SetDuviri(duviri DuviriData) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	d.Duviri = duviri
	return s.saveLocked(d)
}
