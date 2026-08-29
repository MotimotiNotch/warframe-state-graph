// File-backed logging so bugs from real usage are traceable after the
// fact (2026-08-29, のっち依頼) — necessary now that the compiled exe runs
// with --windows-hide-console: there's no visible console to read errors
// from anymore, only this file. console.log/console.error calls are kept
// alongside (harmless no-ops under a hidden console, still useful under
// `bun run dev`) but the file is the durable record.
//
// One file per calendar day under <dataDir>/logs/, so each file stays a
// manageable size. pruneOldLogs() keeps the most recent LOG_KEEP_DAYS of
// those files on startup and deletes the rest — a flat count-based cap
// (mirrors persist.ts's DEFAULT_BACKUP_KEEP pattern), not an archive step
// or an "only delete once a bug is confirmed fixed" rule: at this log
// volume (a few KB/day for a single-user local tool) there's nothing worth
// compressing, and tying deletion to update/fix events would need its own
// version-tracking machinery this app doesn't otherwise have, for a
// benefit 14 days of headroom already covers (2026-08-29, のっち依頼).

import * as fs from "node:fs/promises";
import * as path from "node:path";

const LOG_KEEP_DAYS = 14;

let logFilePath: string | null = null;

export function initLogging(dataDir: string): void {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  logFilePath = path.join(dataDir, "logs", `${stamp}.log`);
}

export async function pruneOldLogs(dataDir: string): Promise<void> {
  const logsDir = path.join(dataDir, "logs");
  try {
    const entries = await fs.readdir(logsDir);
    const logFiles = entries.filter((f) => /^\d{8}\.log$/.test(f)).sort();
    const stale = logFiles.slice(0, Math.max(0, logFiles.length - LOG_KEEP_DAYS));
    await Promise.all(stale.map((f) => fs.unlink(path.join(logsDir, f))));
  } catch {
    // logs/ doesn't exist yet on a first run — nothing to prune.
  }
}

async function appendLine(line: string): Promise<void> {
  if (!logFilePath) return;
  try {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    await fs.appendFile(logFilePath, line + "\n", "utf8");
  } catch {
    // Logging must never be the thing that crashes the app it's diagnosing.
  }
}

export function logInfo(message: string): void {
  console.log(message);
  void appendLine(`[${new Date().toISOString()}] INFO ${message}`);
}

export function logError(context: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[${context}]`, err);
  void appendLine(`[${new Date().toISOString()}] ERROR ${context}: ${detail}`);
}
