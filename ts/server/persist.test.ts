// Port of pkg/persist/persist_test.go — same 7 cases, same names (translated
// to TS test-naming convention), same assertions. This is the executable
// spec for the persist layer; written test-first per the migration plan.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_BACKUP_KEEP, NotFoundError, loadJSON, saveJSON } from "./persist.ts";

const testDocSchema = z.object({ name: z.string(), n: z.number() });
type TestDoc = z.infer<typeof testDocSchema>;

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "wsg-persist-test-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function listBackups(d: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(d, "backups"));
    return entries.sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

test("saveJSON + loadJSON round trip", async () => {
  const docPath = path.join(dir, "doc.json");

  await saveJSON(docPath, { name: "Ash Prime", n: 3 } satisfies TestDoc);

  const got = await loadJSON(docPath, testDocSchema);
  expect(got.name).toBe("Ash Prime");
  expect(got.n).toBe(3);
});

test("loadJSON on missing file preserves not-found-ness", async () => {
  const docPath = path.join(dir, "does-not-exist.json");

  await expect(loadJSON(docPath, testDocSchema)).rejects.toThrow();
  try {
    await loadJSON(docPath, testDocSchema);
    throw new Error("expected loadJSON to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).code).toBe("ENOENT");
  }
});

test("saveJSON leaves no leftover temp files", async () => {
  const docPath = path.join(dir, "doc.json");

  await saveJSON(docPath, { name: "Braton", n: 1 } satisfies TestDoc);

  const entries = await fs.readdir(dir);
  for (const name of entries) {
    expect(name.includes(".tmp-")).toBe(false);
  }
});

test("saveJSON creates exactly one backup per save", async () => {
  const docPath = path.join(dir, "doc.json");

  await saveJSON(docPath, { name: "v1", n: 1 } satisfies TestDoc);

  const backups = await listBackups(dir);
  expect(backups.length).toBe(1);
});

// Seeds the backups directory with more than DEFAULT_BACKUP_KEEP pre-existing
// (older) backup files, then triggers one more saveJSON, and checks that
// pruning keeps only the newest DEFAULT_BACKUP_KEEP files. Backup filenames
// embed a second-granularity timestamp, so this crafts filenames directly
// instead of sleeping between real saves (which would make the test slow and
// timing-flaky) — same approach as the Go original.
test("saveJSON prunes backups beyond DEFAULT_BACKUP_KEEP", async () => {
  const docPath = path.join(dir, "doc.json");
  const backupsDir = path.join(dir, "backups");
  await fs.mkdir(backupsDir, { recursive: true });

  const seeded = [
    "doc.20200101-000001.json",
    "doc.20200101-000002.json",
    "doc.20200101-000003.json",
    "doc.20200101-000004.json",
    "doc.20200101-000005.json",
  ];
  expect(seeded.length).toBe(DEFAULT_BACKUP_KEEP);
  for (const name of seeded) {
    await fs.writeFile(path.join(backupsDir, name), `{"name":"seed","n":0}`, "utf8");
  }

  // This save adds a 6th (newest) backup, so pruning must remove exactly
  // one — the oldest of the seeded files.
  await saveJSON(docPath, { name: "newest", n: 6 } satisfies TestDoc);

  const backups = await listBackups(dir);
  expect(backups.length).toBe(DEFAULT_BACKUP_KEEP);
  expect(backups.includes("doc.20200101-000001.json")).toBe(false);
});

test("loadJSON recovers from newest good backup when primary is corrupt", async () => {
  const docPath = path.join(dir, "doc.json");

  // First save produces a good backup of {name:"good", n:1}.
  await saveJSON(docPath, { name: "good", n: 1 } satisfies TestDoc);
  // Second save produces a newer good backup of {name:"good2", n:2}, then we
  // hand-corrupt only the primary file so the most recent backup on disk
  // still holds valid, recoverable data.
  await saveJSON(docPath, { name: "good2", n: 2 } satisfies TestDoc);
  await fs.writeFile(docPath, `{"name": "broken", "n": `, "utf8");

  const got = await loadJSON(docPath, testDocSchema);
  expect(got.name).toBe("good2");
  expect(got.n).toBe(2);

  // Self-healing: the primary file should now be rewritten with the
  // recovered content, not left corrupt, so the next launch doesn't need to
  // recover again.
  const healedRaw = await fs.readFile(docPath, "utf8");
  const healed = testDocSchema.parse(JSON.parse(healedRaw));
  expect(healed.name).toBe("good2");
  expect(healed.n).toBe(2);
});

test("loadJSON returns parse error when no backup is usable", async () => {
  const docPath = path.join(dir, "doc.json");

  // No prior save, so there is no backups/ directory at all — only a
  // hand-written corrupt primary file.
  await fs.writeFile(docPath, "not json", "utf8");

  await expect(loadJSON(docPath, testDocSchema)).rejects.toThrow(/no usable backup found/);
});
