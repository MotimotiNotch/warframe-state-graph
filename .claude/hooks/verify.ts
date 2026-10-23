// Claude Code の検証フック（.claude/settings.json から呼ばれる）。
//   post-edit: ts/ 配下の .ts を編集したら型チェック。落ちたら exit 2 で Claude に差し戻す
//   stop:      ts/ に未コミットの変更があるときだけ型チェック＋テスト。落ちたらターンを終わらせない
// 「通った」と言うだけで終われないよう、宣言ではなく実行結果を関門にする。
import { join, resolve } from "node:path";

const mode = process.argv[2];
const root = resolve(import.meta.dir, "..", "..");
const tsDir = join(root, "ts");
const MAX_CHARS = 4000;

const input = JSON.parse((await Bun.stdin.text()) || "{}");

function run(cmd: string[], cwd: string) {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const out = (p.stdout.toString() + p.stderr.toString()).trim();
  return { ok: p.exitCode === 0, out };
}

function tail(s: string) {
  return s.length > MAX_CHARS ? "…(前略)\n" + s.slice(-MAX_CHARS) : s;
}

function fail(label: string, out: string): never {
  console.error(`[verify-hook] ${label} が失敗した。直してから終えること。\n\n${tail(out)}`);
  process.exit(2);
}

if (mode === "post-edit") {
  const file = String(input.tool_input?.file_path ?? "").replaceAll("\\", "/");
  const tsPrefix = tsDir.replaceAll("\\", "/").toLowerCase() + "/";
  const inTs = file.toLowerCase().startsWith(tsPrefix);
  if (!inTs || !file.endsWith(".ts") || file.includes("/node_modules/")) process.exit(0);

  const tc = run(["bun", "run", "typecheck"], tsDir);
  if (!tc.ok) fail("型チェック（bun run typecheck）", tc.out);
  process.exit(0);
}

if (mode === "stop") {
  const st = run(["git", "status", "--porcelain", "--", "ts"], root);
  if (!st.ok || st.out === "") process.exit(0);

  const tc = run(["bun", "run", "typecheck"], tsDir);
  if (!tc.ok) fail("型チェック（bun run typecheck）", tc.out);
  const t = run(["bun", "test"], tsDir);
  if (!t.ok) fail("テスト（bun test）", t.out);
  process.exit(0);
}

console.error(`[verify-hook] unknown mode: ${mode}`);
process.exit(0);
