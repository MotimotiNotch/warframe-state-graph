package questchain

import "testing"

func TestResolveChain_LinearPrerequisites(t *testing.T) {
	got := ResolveChain("The Teacher")
	want := []string{"Awakening", "Vor's Prize", "The Teacher"}
	if len(got) != len(want) {
		t.Fatalf("ResolveChain = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("ResolveChain[%d] = %q, want %q (full: %v)", i, got[i], want[i], got)
		}
	}
}

func TestResolveChain_MultiplePrerequisites(t *testing.T) {
	got := ResolveChain("The Hex")
	has := map[string]bool{}
	for _, n := range got {
		has[n] = true
	}
	if !has["The Lotus Eaters"] || !has["The Duviri Paradox"] {
		t.Errorf("The Hex chain missing an AND-prerequisite: %v", got)
	}
	if got[len(got)-1] != "The Hex" {
		t.Errorf("last entry = %q, want The Hex", got[len(got)-1])
	}
}

func TestResolveChain_UnknownQuestReturnsSelfOnly(t *testing.T) {
	got := ResolveChain("Some Side Quest Not In The Table")
	if len(got) != 1 || got[0] != "Some Side Quest Not In The Table" {
		t.Errorf("ResolveChain(unknown) = %v, want single self entry", got)
	}
}

func TestResolveChain_NoDuplicatesOnDiamondDependency(t *testing.T) {
	// The Hex requires both The Lotus Eaters and The Duviri Paradox, and both of those
	// share earlier ancestors (e.g. through Arc chains) — ensure no name appears twice.
	got := ResolveChain("The Hex")
	seen := map[string]bool{}
	for _, n := range got {
		if seen[n] {
			t.Errorf("duplicate entry %q in chain: %v", n, got)
		}
		seen[n] = true
	}
}

func TestSlug(t *testing.T) {
	if got := Slug("The Second Dream"); got != "the-second-dream" {
		t.Errorf("Slug = %q", got)
	}
	if got := Slug("Vor's Prize"); got != "vor-s-prize" {
		t.Errorf("Slug = %q", got)
	}
}
