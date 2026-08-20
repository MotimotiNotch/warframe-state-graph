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
	if d.FocusInvestment == nil {
		d.FocusInvestment = make(map[string]FocusInvestment)
	}
	for _, name := range FocusSchools {
		if _, ok := d.FocusInvestment[name]; !ok {
			d.FocusInvestment[name] = FocusNotInvested
		}
	}
	if d.RailjackComponents == nil {
		d.RailjackComponents = make(map[string]*RailjackComponent)
	}
	for _, slot := range RailjackComponentSlots {
		if _, ok := d.RailjackComponents[slot]; !ok {
			d.RailjackComponents[slot] = &RailjackComponent{}
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

// SetFocusInvestment は1校の投資段階を更新する。school/investmentの妥当性チェックは
// 呼び出し側（HTTPハンドラ）が行う想定だが、未知のschool名でも素直にmapへ書き込む
// （固定リスト外のキーが増えてもUI表示側で無視されるだけで害はないため）。
func (s *FileStore) SetFocusInvestment(school string, investment FocusInvestment) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.FocusInvestment[school] = investment
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// SetFocusActiveSchool は現在アクティブな校を設定する（空文字で未設定に戻せる）。
func (s *FileStore) SetFocusActiveSchool(school string) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.FocusActiveSchool = school
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// SetRailjackComponent は1部品スロットの現在装備（House×Grade）を更新する。
func (s *FileStore) SetRailjackComponent(slot string, component RailjackComponent) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.RailjackComponents[slot] = &component
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}

// SetRailjackPlexusNote はPlexus mod構成の自由記述メモを更新する。
func (s *FileStore) SetRailjackPlexusNote(note string) (*Data, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	d.RailjackPlexusNote = note
	if err := s.saveLocked(d); err != nil {
		return nil, err
	}
	return d, nil
}
