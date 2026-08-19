package loadout

import (
	"fmt"
	"os"
	"sync"

	"warframe-state-graph/pkg/persist"
)

// FileStore は Chain View 側の pkg/store と同じ設計（単一JSONファイル、ミューテックスで直列化）。
// データが別概念なのでファイルも完全に分離する（graph.jsonとは無関係）。
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
		return nil, fmt.Errorf("read loadout file: %w", err)
	}
	if d.Items == nil {
		d.Items = make(map[string]*Item)
	}
	if d.BuildSets == nil {
		d.BuildSets = make(map[string]*BuildSet)
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

// UpsertItem はアイテム（フレーム/武器）を新規作成または上書きする。
func (s *FileStore) UpsertItem(item *Item) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	if item.Configs == nil {
		item.Configs = map[ConfigSlot][]string{}
	}
	d.Items[item.ID] = item
	return s.saveLocked(d)
}

// SetConfig は指定アイテムの指定コンフィグ（A/B/C）のMOD名リストを丸ごと差し替える。
func (s *FileStore) SetConfig(itemID string, slot ConfigSlot, mods []string) (*Item, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	item, ok := d.Items[itemID]
	if !ok {
		return nil, fmt.Errorf("item %q not found", itemID)
	}
	if item.Configs == nil {
		item.Configs = map[ConfigSlot][]string{}
	}
	item.Configs[slot] = mods
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *FileStore) DeleteItem(itemID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	delete(d.Items, itemID)
	return s.saveLocked(d)
}

// UpsertBuildSet はビルドセットを新規作成または上書きする。
func (s *FileStore) UpsertBuildSet(set *BuildSet) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	if set.Weapons == nil {
		set.Weapons = []ItemRef{}
	}
	d.BuildSets[set.ID] = set
	return s.saveLocked(d)
}

func (s *FileStore) DeleteBuildSet(setID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return err
	}
	delete(d.BuildSets, setID)
	return s.saveLocked(d)
}
