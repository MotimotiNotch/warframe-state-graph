// Stages every asset a compiled binary needs into ts/web/.embed/*.txt, for
// main.ts to statically `import ... with { type: "text" }`.
//
// Why .txt: `bun build --compile` embeds only files reached through a static
// import — it does NOT make `import.meta.dir`-relative fs reads resolve to
// real files at runtime (verified empirically 2026-08-25: a compiled
// binary's import.meta.dir resolves to a virtual path like `B:\~BUN\...`, so
// main.ts's normal per-request `Bun.build()`/`Bun.file()` calls off real
// `web/*` paths ENOENT inside a compiled exe). A static import is therefore
// required for anything that must survive compilation — but TypeScript
// resolves `*.html`/`*.js` imports via their own more-specific ambient
// module declarations (`bun-types/extensions.d.ts` types `*.html` as
// `HTMLBundle`, and `*.js` as a real ES module), not as opaque text, no
// matter what the `with { type: "text" }` attribute says. `*.txt` is the one
// extension `bun-types` declares as a plain `string`, so every asset gets
// staged here under a `.txt` name before main.ts imports it.
//
// Two kinds of staged output:
// - `<entry>.html.txt`: a verbatim copy of web/<entry>.html.
// - `<entry>.js.txt`: the entry's TS bundled via Bun.build() (Bun.build()
//   itself can't run against already-embedded content, so this has to
//   happen now, at stage time, not inside the compiled binary).
// - `<basename>.txt` for the 9 shared not-yet-ported legacy scripts +
//   favicon.svg, copied verbatim from the original Go project's web/ dir.
//
// Run before `bun build --compile` (and once before first `bun run dev`,
// since main.ts's static imports need these files to exist to resolve at
// all — see main.ts's header comment). Safe to re-run any time; output is
// deterministic from current source. `dev`/`typecheck`/`test`/`compile` in
// package.json all run this first automatically.

import * as fs from "node:fs/promises";
import * as path from "node:path";

const webDir = path.join(import.meta.dir, "..", "web");
const embedDir = path.join(webDir, ".embed");
const legacyWebDir = path.join(import.meta.dir, "..", "..", "web");

// Keep in sync with main.ts's `pages` array.
const pageEntries = ["index", "glossary", "standing", "loadouts", "stats", "collections"];

// Keep in sync with main.ts's legacy static passthrough / Phase 7's
// still-unwired shared-script list.
const legacyBasenames = [
  "favicon.svg",
  "notemd.js",
  "scratch.js",
  "wallpaper.js",
  "theme.js",
  "scroll-top.js",
  "spoiler-warning.js",
  "quest-onboarding.js",
  "debug-grid.js",
];

await fs.mkdir(embedDir, { recursive: true });

for (const entry of pageEntries) {
  const html = await fs.readFile(path.join(webDir, `${entry}.html`), "utf8");
  await fs.writeFile(path.join(embedDir, `${entry}.html.txt`), html, "utf8");

  const result = await Bun.build({
    entrypoints: [path.join(webDir, `${entry}.ts`)],
    target: "browser",
    format: "esm",
  });
  if (!result.success) {
    console.error(`prebuild-embed: failed for ${entry}:\n${result.logs.map((l) => l.message).join("\n")}`);
    process.exit(1);
  }
  const output = result.outputs[0];
  if (!output) {
    console.error(`prebuild-embed: ${entry} produced no output`);
    process.exit(1);
  }
  await fs.writeFile(path.join(embedDir, `${entry}.js.txt`), await output.text(), "utf8");
}

for (const basename of legacyBasenames) {
  const content = await fs.readFile(path.join(legacyWebDir, basename), "utf8");
  await fs.writeFile(path.join(embedDir, `${basename}.txt`), content, "utf8");
}

console.log(`prebuild-embed: staged ${pageEntries.length * 2 + legacyBasenames.length} file(s) into ${embedDir}`);
