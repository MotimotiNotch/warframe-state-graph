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
