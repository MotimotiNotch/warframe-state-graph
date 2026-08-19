package standing

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRankLabel(t *testing.T) {
	cases := []struct {
		syndicate string
		rank      int
		want      string
	}{
		{"Red Veil", 0, "Neutral (Rank 0)"},
		{"Red Veil", 1, "Respected (Rank 1)"},
		{"Red Veil", 5, "Exalted (Rank 5)"},
		{"Steel Meridian", 3, "Defender (Rank 3)"},
		{"Red Veil", -2, "敵対 (Rank -2)"},
	}
	for _, c := range cases {
		if got := RankLabel(c.syndicate, c.rank); got != c.want {
			t.Errorf("RankLabel(%q, %d) = %q, want %q", c.syndicate, c.rank, got, c.want)
		}
	}
}

func TestNewData_InitializesAllMajorSyndicatesToNeutral(t *testing.T) {
	d := NewData()
	if len(d.Ranks) != len(MajorSyndicates) {
		t.Fatalf("Ranks has %d entries, want %d", len(d.Ranks), len(MajorSyndicates))
	}
	for _, s := range MajorSyndicates {
		if d.Ranks[s.Name] != 0 {
			t.Errorf("Ranks[%q] = %d, want 0", s.Name, d.Ranks[s.Name])
		}
	}
}

func TestFileStore_SetRankPersistsAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "standing.json")
	store := NewFileStore(path)

	if _, err := store.SetRank("Red Veil", 4); err != nil {
		t.Fatalf("SetRank: %v", err)
	}
	if _, err := store.SetRank("The Perrin Sequence", -2); err != nil {
		t.Fatalf("SetRank: %v", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected file at %s, got error: %v", path, err)
	}

	reloaded, err := NewFileStore(path).Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if reloaded.Ranks["Red Veil"] != 4 {
		t.Errorf("Red Veil = %d, want 4", reloaded.Ranks["Red Veil"])
	}
	if reloaded.Ranks["The Perrin Sequence"] != -2 {
		t.Errorf("The Perrin Sequence = %d, want -2", reloaded.Ranks["The Perrin Sequence"])
	}
	// Untouched syndicates should still be present and Neutral.
	if reloaded.Ranks["Steel Meridian"] != 0 {
		t.Errorf("Steel Meridian = %d, want 0 (untouched)", reloaded.Ranks["Steel Meridian"])
	}
}

func TestFileStore_HighestRankReachedTracksMaxAndIgnoresDemotion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "standing.json")
	store := NewFileStore(path)

	if _, err := store.SetRank("Red Veil", 5); err != nil {
		t.Fatalf("SetRank: %v", err)
	}
	if _, err := store.SetRank("Red Veil", -2); err != nil {
		t.Fatalf("SetRank: %v", err)
	}
	d, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if d.Ranks["Red Veil"] != -2 {
		t.Errorf("Ranks[Red Veil] = %d, want -2", d.Ranks["Red Veil"])
	}
	if d.HighestRankReached["Red Veil"] != 5 {
		t.Errorf("HighestRankReached[Red Veil] = %d, want 5 (should not drop on demotion)", d.HighestRankReached["Red Veil"])
	}

	// Re-ascending to a previously-reached rank should not lower the record either.
	if _, err := store.SetRank("Red Veil", 3); err != nil {
		t.Fatalf("SetRank: %v", err)
	}
	d, err = store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if d.HighestRankReached["Red Veil"] != 5 {
		t.Errorf("HighestRankReached[Red Veil] = %d, want 5 (unchanged)", d.HighestRankReached["Red Veil"])
	}
}

func TestFileStore_SetHighestRankReachedOverwritesDirectly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "standing.json")
	store := NewFileStore(path)

	// 誤操作でRank5まで選んでしまい、実績が繰り上がったシナリオを再現。
	if _, err := store.SetRank("Cephalon Suda", 5); err != nil {
		t.Fatalf("SetRank: %v", err)
	}
	// 現在ランクは正しい値(2)に選び直した(SetRankはHighestを下げない)。
	if _, err := store.SetRank("Cephalon Suda", 2); err != nil {
		t.Fatalf("SetRank: %v", err)
	}
	// 実績を手動で2へ訂正する。SetRankと違い、下げる方向でもそのまま反映されるべき。
	d, err := store.SetHighestRankReached("Cephalon Suda", 2)
	if err != nil {
		t.Fatalf("SetHighestRankReached: %v", err)
	}
	if d.HighestRankReached["Cephalon Suda"] != 2 {
		t.Errorf("HighestRankReached[Cephalon Suda] = %d, want 2 (manual correction)", d.HighestRankReached["Cephalon Suda"])
	}
	if d.Ranks["Cephalon Suda"] != 2 {
		t.Errorf("Ranks[Cephalon Suda] = %d, want 2 (unaffected by SetHighestRankReached)", d.Ranks["Cephalon Suda"])
	}

	reloaded, err := NewFileStore(path).Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if reloaded.HighestRankReached["Cephalon Suda"] != 2 {
		t.Errorf("reloaded HighestRankReached[Cephalon Suda] = %d, want 2 (persisted)", reloaded.HighestRankReached["Cephalon Suda"])
	}
}

func TestFileStore_HighestRankReachedMigratesFromLegacyFileWithoutField(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "standing.json")
	// 旧フォーマット（HighestRankReachedフィールドが存在しない時代のファイル）を模して書く。
	legacy := `{"schemaVersion":1,"ranks":{"Red Veil":4,"The Perrin Sequence":-1}}`
	if err := os.WriteFile(path, []byte(legacy), 0644); err != nil {
		t.Fatalf("write legacy file: %v", err)
	}

	d, err := NewFileStore(path).Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if d.HighestRankReached["Red Veil"] != 4 {
		t.Errorf("HighestRankReached[Red Veil] = %d, want 4 (migrated from current rank)", d.HighestRankReached["Red Veil"])
	}
	if d.HighestRankReached["The Perrin Sequence"] != 0 {
		t.Errorf("HighestRankReached[The Perrin Sequence] = %d, want 0 (negative rank is not an achievement)", d.HighestRankReached["The Perrin Sequence"])
	}
}

func TestRecoverySacrifice(t *testing.T) {
	cases := []struct {
		syndicate string
		want      string
	}{
		{"Red Veil", "Orokin Catalyst×1"},
		{"Cephalon Suda", "Orokin Catalyst×1"},
		{"The Perrin Sequence", "Orokin Reactor×1"},
	}
	for _, c := range cases {
		if got := RecoverySacrifice(c.syndicate); got != c.want {
			t.Errorf("RecoverySacrifice(%q) = %q, want %q", c.syndicate, got, c.want)
		}
	}
}
