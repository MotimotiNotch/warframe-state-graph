package engine

import "warframe-state-graph/pkg/model"

// ResolveState はノードの充足状態を再帰的に判定する。
// requires が空、または全て SATISFIED なら ACTIONABLE。循環参照は BLOCKED 扱いで打ち切る。
func ResolveState(g *model.Graph, nodeID string, stack map[string]bool) model.NodeState {
	node, ok := g.Nodes[nodeID]
	if !ok {
		return model.StateBlocked
	}
	if node.Satisfied {
		return model.StateSatisfied
	}
	if stack[nodeID] {
		return model.StateBlocked // 循環防御
	}
	if len(node.Requires) == 0 {
		return model.StateActionable
	}

	next := make(map[string]bool, len(stack)+1)
	for k := range stack {
		next[k] = true
	}
	next[nodeID] = true

	for _, reqID := range node.Requires {
		if ResolveState(g, reqID, next) != model.StateSatisfied {
			return model.StateBlocked
		}
	}
	return model.StateActionable
}

// CascadeSatisfyRequires は、あるノードが達成済みになった時、その requires チェーンを
// 再帰的に遡って全て達成済みにする。「後の工程が終わっているなら前提工程も終わっているはず」
// という requires（前提条件）特有の意味論に基づく（例: Natah を達成したなら The War Within や
// Saya's Vigil 等の前提クエストは必然的に既に完了している）。
//
// contains（構成関係）には同じ含意が無いため対象外。全体をコンテナに含めても中身が
// 完了しているとは限らない、というflat DAG原則（進捗リング実装時の判断）と対称的な設計。
func CascadeSatisfyRequires(g *model.Graph, nodeID string, seen map[string]bool) {
	if seen[nodeID] {
		return
	}
	seen[nodeID] = true

	node, ok := g.Nodes[nodeID]
	if !ok {
		return
	}
	for _, reqID := range node.Requires {
		if reqNode, ok := g.Nodes[reqID]; ok {
			reqNode.Satisfied = true
			CascadeSatisfyRequires(g, reqID, seen)
		}
	}
}

// CascadeUnsatisfyDependents は CascadeSatisfyRequires と逆向きの走査。
// あるノードが未達に戻った時、そのノードを requires で指定している依存先（後工程）ノードも
// 再帰的に未達へ巻き戻す。「前提が崩れたなら、それに依存していた後工程の完了実績も
// 本当は成立していない」という requires の意味論に基づく
// （例: Natah を取り消すなら、Natahを前提にしていた Steel Path 解放も未達に戻る）。
//
// 前提側（CascadeSatisfyRequiresの対象）は触らない — Natahを取り消してもThe War Within等の
// 完了実績自体は消えないため。
func CascadeUnsatisfyDependents(g *model.Graph, nodeID string, seen map[string]bool) {
	if seen[nodeID] {
		return
	}
	seen[nodeID] = true

	for id, node := range g.Nodes {
		for _, reqID := range node.Requires {
			if reqID == nodeID {
				node.Satisfied = false
				CascadeUnsatisfyDependents(g, id, seen)
				break
			}
		}
	}
}

// CollectMembers は指定ノードから contains と requires の両方を再帰的に辿り、
// 関連する全ノードIDを集める（対象ノード自身は含まない）。
//
// contains のみを辿ると、真の Next Action（例: シンジケートランク上げ）が
// レポートから欠落する（Obsidian Dashboard.md 実装時に発見したギャップ）ため、
// 両エッジを統合して走査する。
func CollectMembers(g *model.Graph, nodeID string, seen map[string]bool) []string {
	if seen[nodeID] {
		return nil
	}
	seen[nodeID] = true

	node, ok := g.Nodes[nodeID]
	if !ok {
		return nil
	}

	members := []string{nodeID}
	for _, childID := range append(append([]string{}, node.Contains...), node.Requires...) {
		members = append(members, CollectMembers(g, childID, seen)...)
	}
	return members
}

// NodeView はノード本体（requires/contains含む）に、算出済みStateを添えたもの。
// フロントエンドがグラフ描画（レイアウト計算・エッジ描画）に必要な情報を、
// エッジ走査ロジックを再実装せずに一度で取得できるようにする。
type NodeView struct {
	*model.Node
	State model.NodeState `json:"state"`
}

type NextActionReport struct {
	BuildID    string              `json:"buildId"`
	Progress   Progress            `json:"progress"`
	Actionable []string            `json:"actionable"`
	Blocked    []string            `json:"blocked"`
	Satisfied  []string            `json:"satisfied"`
	Nodes      map[string]NodeView `json:"nodes"` // buildID自身を含む、メンバー全ノードのビュー
}

type Progress struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

// DeriveNextActions は buildID を起点に、状態別（ACTIONABLE/BLOCKED/SATISFIED）に
// 関連ノードを分類したレポートを返す。
func DeriveNextActions(g *model.Graph, buildID string) NextActionReport {
	seen := make(map[string]bool)
	members := CollectMembers(g, buildID, seen)

	report := NextActionReport{BuildID: buildID, Nodes: make(map[string]NodeView, len(members)+1)}

	if buildNode, ok := g.Nodes[buildID]; ok {
		report.Nodes[buildID] = NodeView{Node: buildNode, State: model.StateSatisfied}
	}

	for _, id := range members {
		if id == buildID {
			continue
		}
		node := g.Nodes[id]
		state := ResolveState(g, id, map[string]bool{})
		report.Nodes[id] = NodeView{Node: node, State: state}

		switch state {
		case model.StateSatisfied:
			report.Satisfied = append(report.Satisfied, id)
		case model.StateActionable:
			report.Actionable = append(report.Actionable, id)
		default:
			report.Blocked = append(report.Blocked, id)
		}
	}
	report.Progress = Progress{
		Done:  len(report.Satisfied),
		Total: len(report.Satisfied) + len(report.Actionable) + len(report.Blocked),
	}
	return report
}
