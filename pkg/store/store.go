package store

import (
	"fmt"
	"os"
	"sync"

	"warframe-state-graph/pkg/engine"
	"warframe-state-graph/pkg/model"
	"warframe-state-graph/pkg/persist"
)

// FileStore は単一ユーザー向けのローカルJSONファイルをグラフの永続化先とする。
// 同時アクセスはHTTPサーバー内の少数リクエストのみを想定し、ミューテックスで直列化する。
type FileStore struct {
	path string
	mu   sync.Mutex
}

func NewFileStore(path string) *FileStore {
	return &FileStore{path: path}
}

func (s *FileStore) Load() (*model.Graph, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

func (s *FileStore) loadLocked() (*model.Graph, error) {
	g := model.NewGraph()
	if err := persist.LoadJSON(s.path, g); err != nil {
		if os.IsNotExist(err) {
			return model.NewGraph(), nil
		}
		return nil, fmt.Errorf("read graph file: %w", err)
	}
	if g.Nodes == nil {
		g.Nodes = make(map[string]*model.Node)
	}
	if g.SchemaVersion == 0 {
		g.SchemaVersion = model.CurrentSchemaVersion
	}
	return g, nil
}

// UpsertNode はノードを新規作成または上書きする（ノード編集UI用）。
func (s *FileStore) UpsertNode(n *model.Node) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, err := s.loadLocked()
	if err != nil {
		return err
	}
	if n.Requires == nil {
		n.Requires = []string{}
	}
	if n.Contains == nil {
		n.Contains = []string{}
	}
	g.Nodes[n.ID] = n
	return s.saveLocked(g)
}

// UpsertNodes は複数ノードを一括で追加/上書きする（WFCD自動生成インポート用）。
func (s *FileStore) UpsertNodes(nodes []*model.Node) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, err := s.loadLocked()
	if err != nil {
		return err
	}
	for _, n := range nodes {
		if n.Requires == nil {
			n.Requires = []string{}
		}
		if n.Contains == nil {
			n.Contains = []string{}
		}
		g.Nodes[n.ID] = n
	}
	return s.saveLocked(g)
}

// DeleteNode はノードを削除し、他ノードのrequires/containsからも参照を取り除く
// （残すとダングリング参照になり、フロントの描画・エンジンの走査で存在しないノードとして
// 無視されるだけだが、grap.json上のゴミとして残り続けるのを避ける）。
func (s *FileStore) DeleteNode(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, err := s.loadLocked()
	if err != nil {
		return err
	}
	delete(g.Nodes, id)
	for _, n := range g.Nodes {
		n.Requires = removeID(n.Requires, id)
		n.Contains = removeID(n.Contains, id)
	}
	return s.saveLocked(g)
}

func removeID(ids []string, target string) []string {
	out := ids[:0]
	for _, id := range ids {
		if id != target {
			out = append(out, id)
		}
	}
	return out
}

// ToggleGilded はマスタリー担当パーツ（Zaw/Kitgun/AmpのStrike/Chamber/Prism等）の
// Gild状態を反転させる。satisfied（パーツ所持）とは独立した別状態
// （ランク30到達だけではマスタリーが入らず、Gildして初めて完了扱いになるため）。
func (s *FileStore) ToggleGilded(id string) (*model.Node, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	n, ok := g.Nodes[id]
	if !ok {
		return nil, fmt.Errorf("node %q not found", id)
	}
	n.Gilded = !n.Gilded
	if err := s.saveLocked(g); err != nil {
		return nil, err
	}
	return n, nil
}

func (s *FileStore) saveLocked(g *model.Graph) error {
	g.SchemaVersion = model.CurrentSchemaVersion
	return persist.Save(s.path, g)
}

func (s *FileStore) Save(g *model.Graph) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(g)
}

// ToggleSatisfied は指定ノードのsatisfiedを反転させ、即座に永続化する。
// trueに変わった場合はその requires チェーン（前提側）を連鎖達成、
// falseに戻った場合はそのノードに依存している後工程側を連鎖で未達に戻す。
func (s *FileStore) ToggleSatisfied(nodeID string) (*model.Node, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	g, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	node, ok := g.Nodes[nodeID]
	if !ok {
		return nil, fmt.Errorf("node %q not found", nodeID)
	}
	node.Satisfied = !node.Satisfied
	if node.Satisfied {
		engine.CascadeSatisfyRequires(g, nodeID, map[string]bool{})
	} else {
		engine.CascadeUnsatisfyDependents(g, nodeID, map[string]bool{})
	}

	if err := s.saveLocked(g); err != nil {
		return nil, err
	}
	return node, nil
}
