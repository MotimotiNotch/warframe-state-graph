// Port of pkg/persist/persist.go. Small, dependency-light helpers shared by
// every local JSON store. Turns a plain "read/write one JSON file" pattern
// into something closer to a minimal embedded database: atomic writes so a
// crash mid-save can't corrupt the file, timestamped backups so a bad write
// is recoverable, and automatic fallback to the newest good backup if the
// primary file is ever unreadable. This matters because the app runs
// unattended on a non-technical user's machine — there's no one around to
// notice a truncated file and go find a backup by hand.
//
// Deliberate adaptations from the Go original (see migration plan, Phase 1):
// - LoadJSON took an out-pointer in Go; loadJSON<T> returns the parsed value
//   instead, since TS has no pointer-out idiom.
// - Callers pass a Zod schema so a document that parses as JSON but doesn't
//   match the expected shape is treated the same as a corrupt file (falls
//   back to backups) — Go got this for free from static typing on
//   json.Unmarshal, so this closes the same gap in TS rather than expanding
//   scope.

import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

/** How many timestamped backups {@link saveJSON} keeps per file. */
export const DEFAULT_BACKUP_KEEP = 5;

/** Thrown by loadJSON when the primary file does not exist. Mirrors the
 * os.IsNotExist(err) check callers used on the Go side — check
 * `err.code === "ENOENT"` (this class re-exposes the underlying Node code). */
export class NotFoundError extends Error {
  readonly code = "ENOENT";
  constructor(readonly path: string) {
    super(`no such file: ${path}`);
    this.name = "NotFoundError";
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Go's backupTimeFormat "20060102-150405" is local time, not UTC — match
// that (toISOString() would silently switch to UTC and break parity with
// any manual inspection the owner does of existing Go-written backups).
function backupTimestamp(d: Date): string {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  return `${y}${mo}${day}-${h}${mi}${s}`;
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `${path.basename(filePath)}.tmp-${crypto.randomBytes(6).toString("hex")}`,
  );
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(tmpPath, "w");
    await handle.writeFile(data, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await handle?.close().catch(() => {});
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

function backupDir(filePath: string): string {
  return path.join(path.dirname(filePath), "backups");
}

function backupPattern(filePath: string): { dir: string; base: string; ext: string } {
  const dir = backupDir(filePath);
  const name = path.basename(filePath);
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  return { dir, base, ext };
}

// Backup filenames embed a sortable timestamp, so lexical descending order
// is chronological order (newest first) — same trick the Go version uses.
async function backupsNewestFirst(filePath: string): Promise<string[]> {
  const { dir, base, ext } = backupPattern(filePath);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const prefix = `${base}.`;
  const matches = entries
    .filter((e) => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith(ext))
    .map((e) => path.join(dir, e.name));
  matches.sort().reverse();
  return matches;
}

async function pruneBackups(filePath: string, keep: number): Promise<void> {
  const files = await backupsNewestFirst(filePath);
  if (files.length <= keep) return;
  for (const f of files.slice(keep)) {
    try {
      await fs.rm(f);
    } catch (err) {
      console.warn(`persist: could not prune old backup ${f}: ${err}`);
    }
  }
}

async function rotateBackup(filePath: string, keep: number): Promise<void> {
  const { dir, base, ext } = backupPattern(filePath);
  await fs.mkdir(dir, { recursive: true });
  // Re-read the just-written primary file rather than reusing the in-memory
  // buffer, matching the Go original's behavior exactly (see file header).
  const data = await fs.readFile(filePath, "utf8");
  const stamp = backupTimestamp(new Date());
  const bpath = path.join(dir, `${base}.${stamp}${ext}`);
  await atomicWrite(bpath, data);
  await pruneBackups(filePath, keep);
}

/**
 * Serializes v as indented JSON and writes it to filePath atomically (temp
 * file + fsync + rename, so a crash mid-write leaves either the old or the
 * new content, never a half-written file), then rotates a timestamped backup
 * into a sibling "backups" directory. Backup failures are logged, not
 * thrown — the primary write already succeeded by that point.
 */
export async function saveJSON(filePath: string, v: unknown): Promise<void> {
  const data = JSON.stringify(v, null, 2);
  await atomicWrite(filePath, data);
  try {
    await rotateBackup(filePath, DEFAULT_BACKUP_KEEP);
  } catch (err) {
    console.warn(`persist: backup for ${filePath} failed (data was still saved): ${err}`);
  }
}

/**
 * Reads filePath and parses+validates it against schema. If the file does
 * not exist, throws {@link NotFoundError} (check `err.code === "ENOENT"`).
 * If the file exists but fails to parse as JSON, or parses but doesn't match
 * schema, loadJSON tries the newest backups under backups/ in turn; the
 * first one that both parses and validates is used, written back over the
 * broken primary file (self-healing for next launch), and a warning is
 * logged. Only if every backup also fails does loadJSON throw, with a
 * message that mentions "no usable backup found".
 */
export async function loadJSON<T>(filePath: string, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError(filePath);
    }
    throw err;
  }

  const primaryResult = tryParseAndValidate(raw, schema);
  if (primaryResult.ok) return primaryResult.value;

  console.warn(`persist: ${filePath} is corrupt (${primaryResult.error}), trying backups`);
  for (const bpath of await backupsNewestFirst(filePath)) {
    let braw: string;
    try {
      braw = await fs.readFile(bpath, "utf8");
    } catch {
      continue;
    }
    const result = tryParseAndValidate(braw, schema);
    if (!result.ok) continue;

    console.warn(`persist: recovered ${filePath} from backup ${path.basename(bpath)}`);
    try {
      await atomicWrite(filePath, braw);
    } catch (err) {
      console.warn(`persist: could not restore ${filePath} from backup onto primary file: ${err}`);
    }
    return result.value;
  }

  throw new Error(`parse ${path.basename(filePath)}: ${primaryResult.error} (no usable backup found)`);
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function tryParseAndValidate<T>(raw: string, schema: z.ZodType<T>): ParseResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, value: result.data };
}
