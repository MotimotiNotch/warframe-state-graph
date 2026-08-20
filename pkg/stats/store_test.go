package stats

import (
	"path/filepath"
	"testing"
)

func TestFileStore_SetPlanetProgressPersistsAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stats.json")
	store := NewFileStore(path)

	if _, err := store.SetPlanetProgress("Earth", PlanetProgress{Cleared: 12, SteelPathCleared: 4}); err != nil {
		t.Fatalf("SetPlanetProgress: %v", err)
	}

	reloaded, err := NewFileStore(path).Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	got := reloaded.Planets["Earth"]
	if got == nil || got.Cleared != 12 || got.SteelPathCleared != 4 {
		t.Errorf("Planets[Earth] = %+v, want {Cleared:12 SteelPathCleared:4}", got)
	}
}

func TestFileStore_SetIntrinsicsPersistsAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stats.json")
	store := NewFileStore(path)

	if _, err := store.SetRailjackIntrinsic("Piloting", 7); err != nil {
		t.Fatalf("SetRailjackIntrinsic: %v", err)
	}
	if _, err := store.SetDrifterIntrinsic("Riding", 5); err != nil {
		t.Fatalf("SetDrifterIntrinsic: %v", err)
	}

	reloaded, err := NewFileStore(path).Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if reloaded.RailjackIntrinsics["Piloting"] != 7 {
		t.Errorf("RailjackIntrinsics[Piloting] = %d, want 7", reloaded.RailjackIntrinsics["Piloting"])
	}
	if reloaded.DrifterIntrinsics["Riding"] != 5 {
		t.Errorf("DrifterIntrinsics[Riding] = %d, want 5", reloaded.DrifterIntrinsics["Riding"])
	}
	// Untouched categories should still be present at 0.
	if reloaded.RailjackIntrinsics["Tactical"] != 0 {
		t.Errorf("RailjackIntrinsics[Tactical] = %d, want 0 (untouched)", reloaded.RailjackIntrinsics["Tactical"])
	}
}

func TestFileStore_SetFocusPersistsAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stats.json")
	store := NewFileStore(path)

	if _, err := store.SetFocusInvestment("Zenurik", FocusMaxed); err != nil {
		t.Fatalf("SetFocusInvestment: %v", err)
	}
	if _, err := store.SetFocusActiveSchool("Zenurik"); err != nil {
		t.Fatalf("SetFocusActiveSchool: %v", err)
	}

	reloaded, err := NewFileStore(path).Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if reloaded.FocusInvestment["Zenurik"] != FocusMaxed {
		t.Errorf("FocusInvestment[Zenurik] = %q, want %q", reloaded.FocusInvestment["Zenurik"], FocusMaxed)
	}
	if reloaded.FocusActiveSchool != "Zenurik" {
		t.Errorf("FocusActiveSchool = %q, want Zenurik", reloaded.FocusActiveSchool)
	}
	// Untouched schools should still be present at not_invested.
	if reloaded.FocusInvestment["Madurai"] != FocusNotInvested {
		t.Errorf("FocusInvestment[Madurai] = %q, want %q (untouched)", reloaded.FocusInvestment["Madurai"], FocusNotInvested)
	}
}

func TestFileStore_SetRailjackComponentAndPlexusNotePersistsAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stats.json")
	store := NewFileStore(path)

	if _, err := store.SetRailjackComponent("Reactor", RailjackComponent{House: "Vidar", Grade: "Mk III"}); err != nil {
		t.Fatalf("SetRailjackComponent: %v", err)
	}
	if _, err := store.SetRailjackPlexusNote("Battle 3x Tactical 1x"); err != nil {
		t.Fatalf("SetRailjackPlexusNote: %v", err)
	}

	reloaded, err := NewFileStore(path).Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	got := reloaded.RailjackComponents["Reactor"]
	if got == nil || got.House != "Vidar" || got.Grade != "Mk III" {
		t.Errorf("RailjackComponents[Reactor] = %+v, want {House:Vidar Grade:Mk III}", got)
	}
	if reloaded.RailjackPlexusNote != "Battle 3x Tactical 1x" {
		t.Errorf("RailjackPlexusNote = %q, want %q", reloaded.RailjackPlexusNote, "Battle 3x Tactical 1x")
	}
	// Untouched slots should still be present, unset.
	if got := reloaded.RailjackComponents["Engines"]; got == nil || got.House != "" || got.Grade != "" {
		t.Errorf("RailjackComponents[Engines] = %+v, want zero value (untouched)", got)
	}
}
