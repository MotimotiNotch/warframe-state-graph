package scratch

import (
	"fmt"
	"os"
	"sync"

	"warframe-state-graph/pkg/persist"
)

// FileStore は他パッケージ（pkg/loadout等）と同じ設計（単一JSONファイル、ミューテックスで直列化）。
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
		return nil, fmt.Errorf("read scratch file: %w", err)
	}
	if d.Counters == nil {
		d.Counters = []Counter{}
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

// SetNote はクイックメモ本文を丸ごと差し替える。
func (s *FileStore) SetNote(note string) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.Note = note
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// AddCounter は新規カウンターを末尾に追加する（IDはクライアント側で生成して渡す想定、
// web/loadouts.html等と同じ `${prefix}-${Date.now().toString(36)}...` パターン）。
func (s *FileStore) AddCounter(c Counter) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.Counters = append(d.Counters, c)
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// IncrementCounter は指定カウンターの値を+1する。
func (s *FileStore) IncrementCounter(id string) (*Counter, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	for i := range d.Counters {
		if d.Counters[i].ID == id {
			d.Counters[i].Value++
			if err := s.saveLocked(d); err != nil {
				return nil, err
			}
			return &d.Counters[i], nil
		}
	}
	return nil, fmt.Errorf("counter %q not found", id)
}

// DecrementCounter は指定カウンターの値を-1する（0未満も許容、誤操作の巻き戻し用）。
func (s *FileStore) DecrementCounter(id string) (*Counter, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	for i := range d.Counters {
		if d.Counters[i].ID == id {
			d.Counters[i].Value--
			if err := s.saveLocked(d); err != nil {
				return nil, err
			}
			return &d.Counters[i], nil
		}
	}
	return nil, fmt.Errorf("counter %q not found", id)
}

// SetCounterValue は値を直接指定の数値に差し替える（手入力編集用）。
func (s *FileStore) SetCounterValue(id string, value int) (*Counter, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	for i := range d.Counters {
		if d.Counters[i].ID == id {
			d.Counters[i].Value = value
			if err := s.saveLocked(d); err != nil {
				return nil, err
			}
			return &d.Counters[i], nil
		}
	}
	return nil, fmt.Errorf("counter %q not found", id)
}

// RenameCounter はラベルだけを差し替える（値はそのまま）。
func (s *FileStore) RenameCounter(id, label string) (*Counter, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	for i := range d.Counters {
		if d.Counters[i].ID == id {
			d.Counters[i].Label = label
			if err := s.saveLocked(d); err != nil {
				return nil, err
			}
			return &d.Counters[i], nil
		}
	}
	return nil, fmt.Errorf("counter %q not found", id)
}

func (s *FileStore) DeleteCounter(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	kept := d.Counters[:0]
	for _, c := range d.Counters {
		if c.ID != id {
			kept = append(kept, c)
		}
	}
	d.Counters = kept
	return s.saveLocked(d)
}
