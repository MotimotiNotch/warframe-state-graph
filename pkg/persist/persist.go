// Package persist provides small, dependency-free helpers shared by the
// three local JSON stores (pkg/store, pkg/loadout, pkg/collection). It turns
// a plain "read/write one JSON file" pattern into something closer to a
// minimal embedded database: atomic writes so a crash mid-save can't corrupt
// the file, timestamped backups so a bad write is recoverable, and automatic
// fallback to the newest good backup if the primary file is ever unreadable.
// This matters because the app is meant to run unattended on a non-technical
// user's machine — there's no one around to notice a truncated file and go
// find a backup by hand.
package persist

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// DefaultBackupKeep is how many timestamped backups Save keeps per file.
const DefaultBackupKeep = 5

const backupTimeFormat = "20060102-150405"

// Save marshals v as indented JSON and writes it to path atomically (via a
// temp file + rename, so a crash mid-write leaves either the old or the new
// content, never a half-written file), then rotates a timestamped backup
// copy into a sibling "backups" directory. Backup failures are logged, not
// returned — the primary write already succeeded by that point.
func Save(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", filepath.Base(path), err)
	}
	if err := atomicWrite(path, data); err != nil {
		return fmt.Errorf("write %s: %w", filepath.Base(path), err)
	}
	if err := rotateBackup(path, DefaultBackupKeep); err != nil {
		log.Printf("persist: backup for %s failed (data was still saved): %v", path, err)
	}
	return nil
}

// LoadJSON reads path and unmarshals it into v (a pointer). If the file does
// not exist, the returned error wraps the underlying os error so callers can
// keep using os.IsNotExist(err) to detect a fresh start, same as before this
// package existed. If the file exists but fails to parse (truncated/corrupt
// write, manual edit gone wrong, etc.), LoadJSON automatically tries the
// newest backups under backups/ in turn; the first one that parses is used,
// written back over the broken primary file (self-healing for next launch),
// and a warning is logged. Only if every backup also fails to parse does
// LoadJSON return the original parse error.
func LoadJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err // preserves os.IsNotExist for callers
	}
	primaryErr := json.Unmarshal(data, v)
	if primaryErr == nil {
		return nil
	}

	log.Printf("persist: %s is corrupt (%v), trying backups", path, primaryErr)
	for _, bpath := range backupsNewestFirst(path) {
		bdata, err := os.ReadFile(bpath)
		if err != nil {
			continue
		}
		if err := json.Unmarshal(bdata, v); err != nil {
			continue
		}
		log.Printf("persist: recovered %s from backup %s", path, filepath.Base(bpath))
		if err := atomicWrite(path, bdata); err != nil {
			log.Printf("persist: could not restore %s from backup onto primary file: %v", path, err)
		}
		return nil
	}
	return fmt.Errorf("parse %s: %w (no usable backup found)", filepath.Base(path), primaryErr)
}

func atomicWrite(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

func backupDir(path string) string {
	return filepath.Join(filepath.Dir(path), "backups")
}

func backupPattern(path string) (dir, base, ext string) {
	dir = backupDir(path)
	name := filepath.Base(path)
	ext = filepath.Ext(name)
	base = strings.TrimSuffix(name, ext)
	return
}

func rotateBackup(path string, keep int) error {
	dir, base, ext := backupPattern(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	stamp := time.Now().Format(backupTimeFormat)
	bpath := filepath.Join(dir, fmt.Sprintf("%s.%s%s", base, stamp, ext))
	if err := atomicWrite(bpath, data); err != nil {
		return err
	}
	return pruneBackups(path, keep)
}

func pruneBackups(path string, keep int) error {
	files := backupsNewestFirst(path)
	if len(files) <= keep {
		return nil
	}
	for _, f := range files[keep:] {
		if err := os.Remove(f); err != nil {
			log.Printf("persist: could not prune old backup %s: %v", f, err)
		}
	}
	return nil
}

// backupsNewestFirst returns this file's backup copies, newest first.
// Filenames embed a sortable timestamp, so lexical descending order is
// chronological order.
func backupsNewestFirst(path string) []string {
	dir, base, ext := backupPattern(path)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	prefix := base + "."
	var matches []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ext) {
			matches = append(matches, filepath.Join(dir, name))
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(matches)))
	return matches
}
