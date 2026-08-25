package persist

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

type testDoc struct {
	Name string `json:"name"`
	N    int    `json:"n"`
}

func TestSaveLoadJSON_RoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "doc.json")

	if err := Save(path, &testDoc{Name: "Ash Prime", N: 3}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	var got testDoc
	if err := LoadJSON(path, &got); err != nil {
		t.Fatalf("LoadJSON: %v", err)
	}
	if got.Name != "Ash Prime" || got.N != 3 {
		t.Errorf("LoadJSON = %+v, want {Name:Ash Prime N:3}", got)
	}
}

func TestLoadJSON_MissingFilePreservesIsNotExist(t *testing.T) {
	path := filepath.Join(t.TempDir(), "does-not-exist.json")

	err := LoadJSON(path, &testDoc{})
	if err == nil {
		t.Fatal("LoadJSON on missing file: want error, got nil")
	}
	if !os.IsNotExist(err) {
		t.Errorf("LoadJSON on missing file: err = %v, want os.IsNotExist(err) == true", err)
	}
}

func TestSave_NoLeftoverTempFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.json")

	if err := Save(path, &testDoc{Name: "Braton", N: 1}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp-") {
			t.Errorf("leftover temp file after Save: %s", e.Name())
		}
	}
}

func TestSave_CreatesOneBackupPerSave(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.json")

	if err := Save(path, &testDoc{Name: "v1", N: 1}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	backups := listBackups(t, dir)
	if len(backups) != 1 {
		t.Fatalf("backups after 1 Save = %v, want exactly 1 file", backups)
	}
}

// TestSave_PrunesBackupsBeyondDefaultBackupKeep seeds the backups directory
// with more than DefaultBackupKeep pre-existing (older) backup files, then
// triggers one more Save, and checks that pruning keeps only the newest
// DefaultBackupKeep files. Backup filenames embed a second-granularity
// timestamp, so this test crafts filenames directly instead of sleeping
// between real Saves (which would make the test slow and timing-flaky).
func TestSave_PrunesBackupsBeyondDefaultBackupKeep(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.json")
	backupsDir := filepath.Join(dir, "backups")
	if err := os.MkdirAll(backupsDir, 0755); err != nil {
		t.Fatalf("MkdirAll backups: %v", err)
	}

	// Seed DefaultBackupKeep older, already-existing backups (older than
	// whatever timestamp the real Save below will produce).
	seeded := []string{
		"doc.20200101-000001.json",
		"doc.20200101-000002.json",
		"doc.20200101-000003.json",
		"doc.20200101-000004.json",
		"doc.20200101-000005.json",
	}
	for _, name := range seeded {
		if err := os.WriteFile(filepath.Join(backupsDir, name), []byte(`{"name":"seed","n":0}`), 0644); err != nil {
			t.Fatalf("seed backup %s: %v", name, err)
		}
	}
	if len(seeded) != DefaultBackupKeep {
		t.Fatalf("test setup bug: seeded %d backups, DefaultBackupKeep = %d", len(seeded), DefaultBackupKeep)
	}

	// This Save adds a 6th (newest) backup, so pruning must remove exactly
	// one — the oldest of the seeded files.
	if err := Save(path, &testDoc{Name: "newest", N: 6}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	backups := listBackups(t, dir)
	if len(backups) != DefaultBackupKeep {
		t.Fatalf("backups after prune = %v (len %d), want exactly %d", backups, len(backups), DefaultBackupKeep)
	}
	for _, b := range backups {
		if b == "doc.20200101-000001.json" {
			t.Errorf("oldest seeded backup should have been pruned, but %s still exists", b)
		}
	}
}

func TestLoadJSON_RecoversFromNewestGoodBackupWhenPrimaryIsCorrupt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.json")

	// First Save produces a good backup of {Name:"good", N:1}.
	if err := Save(path, &testDoc{Name: "good", N: 1}); err != nil {
		t.Fatalf("Save (good): %v", err)
	}

	// Second Save corrupts the *backup* rotation by first saving a second
	// good version, then we hand-corrupt only the primary file so the most
	// recent backup on disk still holds valid, recoverable data.
	if err := Save(path, &testDoc{Name: "good2", N: 2}); err != nil {
		t.Fatalf("Save (good2): %v", err)
	}

	if err := os.WriteFile(path, []byte(`{"name": "broken", "n": `), 0644); err != nil {
		t.Fatalf("corrupt primary file: %v", err)
	}

	var got testDoc
	if err := LoadJSON(path, &got); err != nil {
		t.Fatalf("LoadJSON: want automatic recovery, got error: %v", err)
	}
	if got.Name != "good2" || got.N != 2 {
		t.Errorf("LoadJSON recovered = %+v, want {Name:good2 N:2} (newest good backup)", got)
	}

	// Self-healing: the primary file should now be rewritten with the
	// recovered content, not left corrupt, so the next launch doesn't need
	// to recover again.
	healedData, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read healed primary file: %v", err)
	}
	var healed testDoc
	if err := json.Unmarshal(healedData, &healed); err != nil {
		t.Fatalf("healed primary file is not valid JSON: %v (content: %s)", err, healedData)
	}
	if healed.Name != "good2" || healed.N != 2 {
		t.Errorf("healed primary file = %+v, want {Name:good2 N:2}", healed)
	}
}

func TestLoadJSON_ReturnsParseErrorWhenNoBackupIsUsable(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.json")

	// No prior Save, so there is no backups/ directory at all — only a
	// hand-written corrupt primary file.
	if err := os.WriteFile(path, []byte(`not json`), 0644); err != nil {
		t.Fatalf("write corrupt primary file: %v", err)
	}

	var got testDoc
	err := LoadJSON(path, &got)
	if err == nil {
		t.Fatal("LoadJSON with corrupt primary and no backups: want error, got nil")
	}
	if !strings.Contains(err.Error(), "no usable backup found") {
		t.Errorf("LoadJSON error = %q, want it to mention \"no usable backup found\"", err.Error())
	}
}

// listBackups returns the sorted basenames of files under dir/backups.
func listBackups(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(dir, "backups"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatalf("ReadDir backups: %v", err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	return names
}
