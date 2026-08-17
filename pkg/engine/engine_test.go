package engine

import (
	"testing"

	"warframe-state-graph/pkg/model"
)

// Ash Stealth Build テストケース（Obsidian Prototype/Nodes/ と同一構成）を
// Goエンジンでも再現し、手動トレースで確認した期待結果と一致するか検証する。
func buildTestGraph() *model.Graph {
	g := model.NewGraph()
	g.Nodes["ash-stealth-build"] = &model.Node{
		ID: "ash-stealth-build", Type: model.TypeBuild,
		Contains: []string{"dragon-nikana", "ash-prime", "seeking-shuriken"},
	}
	g.Nodes["dragon-nikana"] = &model.Node{
		ID: "dragon-nikana", Type: model.TypeWeapon, Satisfied: true,
		Contains: []string{"dragon-nikana-riven"},
	}
	g.Nodes["dragon-nikana-riven"] = &model.Node{
		ID: "dragon-nikana-riven", Type: model.TypeRiven, Satisfied: false,
	}
	g.Nodes["ash-prime"] = &model.Node{
		ID: "ash-prime", Type: model.TypeFrame, Satisfied: true,
	}
	g.Nodes["seeking-shuriken"] = &model.Node{
		ID: "seeking-shuriken", Type: model.TypeMod, Satisfied: false,
		Requires: []string{"red-veil-rank-5"},
	}
	g.Nodes["red-veil-rank-5"] = &model.Node{
		ID: "red-veil-rank-5", Type: model.TypeSyndicate, Satisfied: false,
	}
	return g
}

func TestDeriveNextActions_AshStealthBuild(t *testing.T) {
	g := buildTestGraph()
	report := DeriveNextActions(g, "ash-stealth-build")

	wantActionable := map[string]bool{"dragon-nikana-riven": true, "red-veil-rank-5": true}
	wantBlocked := map[string]bool{"seeking-shuriken": true}
	wantSatisfied := map[string]bool{"dragon-nikana": true, "ash-prime": true}

	assertSet(t, "Actionable", report.Actionable, wantActionable)
	assertSet(t, "Blocked", report.Blocked, wantBlocked)
	assertSet(t, "Satisfied", report.Satisfied, wantSatisfied)

	if report.Progress.Done != 2 || report.Progress.Total != 5 {
		t.Errorf("progress = %+v, want {Done:2 Total:5}", report.Progress)
	}
}

func TestResolveState_CyclicRequiresIsBlockedNotInfiniteLoop(t *testing.T) {
	g := model.NewGraph()
	g.Nodes["a"] = &model.Node{ID: "a", Requires: []string{"b"}}
	g.Nodes["b"] = &model.Node{ID: "b", Requires: []string{"a"}}

	state := ResolveState(g, "a", map[string]bool{})
	if state != model.StateBlocked {
		t.Errorf("cyclic requires: got %s, want BLOCKED", state)
	}
}

// Steel Path クエスト連鎖（Saya's Vigil → Chains of Harrow → ... → Natah）を模した
// requiresチェーン。Natahを達成にした際、前提が全て自動で連鎖達成になるか検証する。
func TestCascadeSatisfyRequires_ChainOfPrerequisites(t *testing.T) {
	g := model.NewGraph()
	g.Nodes["natah"] = &model.Node{ID: "natah", Requires: []string{"war-within"}}
	g.Nodes["war-within"] = &model.Node{ID: "war-within", Requires: []string{"second-dream"}}
	g.Nodes["second-dream"] = &model.Node{ID: "second-dream", Requires: []string{"apostasy"}}
	g.Nodes["apostasy"] = &model.Node{ID: "apostasy", Requires: []string{"chains-of-harrow"}}
	g.Nodes["chains-of-harrow"] = &model.Node{ID: "chains-of-harrow", Requires: []string{"saya-vigil"}}
	g.Nodes["saya-vigil"] = &model.Node{ID: "saya-vigil"}

	CascadeSatisfyRequires(g, "natah", map[string]bool{})

	// natah自身はこの関数の対象外（呼び出し元がnode.Satisfied=trueにする想定）。
	// 前提チェーン5つは全て連鎖達成済みになっているはず。
	for _, id := range []string{"war-within", "second-dream", "apostasy", "chains-of-harrow", "saya-vigil"} {
		if !g.Nodes[id].Satisfied {
			t.Errorf("%s: want satisfied=true after cascade, got false", id)
		}
	}
}

func TestCascadeSatisfyRequires_CyclicDoesNotInfiniteLoop(t *testing.T) {
	g := model.NewGraph()
	g.Nodes["a"] = &model.Node{ID: "a", Requires: []string{"b"}}
	g.Nodes["b"] = &model.Node{ID: "b", Requires: []string{"a"}}

	CascadeSatisfyRequires(g, "a", map[string]bool{}) // ハングせず返れば十分
	if !g.Nodes["b"].Satisfied {
		t.Errorf("b: want satisfied=true, got false")
	}
}

// Natahを未達に戻したら、Natahに依存している後工程（Steel Path解放）も連鎖で未達に戻るはず。
// 一方、Natahの前提（The War Within等）は完了実績のままなので触らない。
func TestCascadeUnsatisfyDependents_RevertsDownstreamOnly(t *testing.T) {
	g := model.NewGraph()
	g.Nodes["war-within"] = &model.Node{ID: "war-within", Satisfied: true}
	g.Nodes["natah"] = &model.Node{ID: "natah", Requires: []string{"war-within"}, Satisfied: false}
	g.Nodes["steel-path-junction"] = &model.Node{ID: "steel-path-junction", Requires: []string{"natah"}, Satisfied: true}
	g.Nodes["further-quest"] = &model.Node{ID: "further-quest", Requires: []string{"steel-path-junction"}, Satisfied: true}

	CascadeUnsatisfyDependents(g, "natah", map[string]bool{})

	if !g.Nodes["war-within"].Satisfied {
		t.Errorf("war-within (前提側): want satisfied=true のまま, got false")
	}
	if g.Nodes["steel-path-junction"].Satisfied {
		t.Errorf("steel-path-junction (直接の依存先): want satisfied=false, got true")
	}
	if g.Nodes["further-quest"].Satisfied {
		t.Errorf("further-quest (間接的な依存先): want satisfied=false, got true")
	}
}

func TestCascadeUnsatisfyDependents_CyclicDoesNotInfiniteLoop(t *testing.T) {
	g := model.NewGraph()
	g.Nodes["a"] = &model.Node{ID: "a", Requires: []string{"b"}, Satisfied: true}
	g.Nodes["b"] = &model.Node{ID: "b", Requires: []string{"a"}, Satisfied: true}

	CascadeUnsatisfyDependents(g, "a", map[string]bool{}) // ハングせず返れば十分
	if g.Nodes["b"].Satisfied {
		t.Errorf("b: want satisfied=false, got true")
	}
}

func assertSet(t *testing.T, label string, got []string, want map[string]bool) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("%s: got %v, want keys of %v", label, got, want)
		return
	}
	for _, id := range got {
		if !want[id] {
			t.Errorf("%s: unexpected id %q in %v", label, id, got)
		}
	}
}
