// Writes ts/licenses/THIRD_PARTY_LICENSES.txt: the notices for third-party
// software that ships inside the release zip (#28).
//
//   bun run licenses
//
// What ships, and therefore what is listed here:
// - The Bun runtime. `bun build --compile` embeds the whole runtime in the exe.
//   Bun's own LICENSE.md (MIT, plus the table of libraries it statically links)
//   is reproduced verbatim from licenses/bun-LICENSE.md. The version is read
//   from .github/workflows/release.yml (the Bun that builds the release), not
//   from the Bun running this script.
// - JS packages that end up in a bundle. Counted from Bun.build()'s metafile
//   for every page entry plus the server, not from package.json — a dependency
//   that is declared but never imported does not ship, and devDependencies
//   (typescript, @types/bun) never do.
// - Icons embedded in ts/web/icons.ts: Lucide (ISC) and two game-icons.net
//   icons (CC BY 3.0, which requires attribution in the distributed work).
//
// WFCD / calamity-inc data is fetched at runtime on the user's machine and is
// not redistributed, so it is credited (in-app and below) rather than licensed.
//
// The output is committed so the notices can be read on GitHub too, and the
// release workflow regenerates it before packaging. licenses.test.ts checks
// that the committed copy still covers what the bundles contain.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const tsDir = join(import.meta.dir, "..");
const webDir = join(tsDir, "web");
const licensesDir = join(tsDir, "licenses");
export const OUTPUT = join(licensesDir, "THIRD_PARTY_LICENSES.txt");

export function releaseBunVersion(): string {
  const yml = readFileSync(join(tsDir, "..", ".github", "workflows", "release.yml"), "utf8");
  const m = /bun-version:\s*"([^"]+)"/.exec(yml);
  if (!m) throw new Error("release.yml に bun-version が見つからない");
  return m[1]!;
}

export function entryPoints(): string[] {
  const pages = readdirSync(webDir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => join(webDir, f.replace(/\.html$/, ".ts")))
    .filter((p) => existsSync(p));
  return [...pages, join(tsDir, "server", "main.ts")];
}

interface Pkg {
  name: string;
  version: string;
  license: string;
  dir: string;
}

/** Packages under node_modules that the bundles actually include. Keyed by
 *  directory, so two versions of one package would both be listed. */
export async function bundledPackages(): Promise<Pkg[]> {
  const dirs = new Map<string, string>();
  for (const entry of entryPoints()) {
    const target = entry.endsWith(join("server", "main.ts")) ? "bun" : "browser";
    const built = await Bun.build({ entrypoints: [entry], target, metafile: true } as Parameters<typeof Bun.build>[0]);
    const meta = (built as unknown as { metafile?: { inputs: Record<string, unknown> } }).metafile;
    if (!meta) throw new Error(`Bun.build が metafile を返さなかった: ${entry}`);
    for (const raw of Object.keys(meta.inputs)) {
      const p = (isAbsolute(raw) ? raw : join(tsDir, raw)).split("\\").join("/");
      const i = p.lastIndexOf("node_modules/");
      if (i < 0) continue;
      const rest = p.slice(i + "node_modules/".length).split("/");
      const name = rest[0]!.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0]!;
      dirs.set(p.slice(0, i) + "node_modules/" + name, name);
    }
  }
  return [...dirs]
    .map(([dir, name]) => {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return { name, version: pkg.version as string, license: (pkg.license as string) ?? "", dir };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function licenseText(dir: string, who: string): string {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  if (!file) throw new Error(`${who}: LICENSE ファイルが無い（本文を補う手段を足すこと）`);
  return readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim();
}

const RULE = "-".repeat(80);
const HEAD = (title: string) => `${"=".repeat(80)}\n${title}\n${"=".repeat(80)}`;

const GAME_ICONS = `Two badge icons are from game-icons.net and are licensed under
Creative Commons Attribution 3.0 Unported (CC BY 3.0):
https://creativecommons.org/licenses/by/3.0/

- "Padlock" by Lorc — https://game-icons.net/1x1/lorc/padlock.html
- "Hourglass" by Lorc — https://game-icons.net/1x1/lorc/hourglass.html

Changes: the SVG paths are embedded inline and drawn in the current text color.`;

const DATA_CREDIT = `Game data is fetched at runtime from WFCD (Warframe Community Developers)
\`warframe-items\` / \`warframe-drop-data\` (both MIT licensed) and calamity-inc,
and is not included in this distribution.

Warframe is a registered trademark of Digital Extremes Ltd. This is an
unofficial, non-commercial fan tool and is not affiliated with or endorsed by
Digital Extremes.`;

export async function render(): Promise<string> {
  const bunVersion = releaseBunVersion();
  const bunLicense = readFileSync(join(licensesDir, "bun-LICENSE.md"), "utf8").replace(/\r\n/g, "\n").trim();
  const lucide = readFileSync(join(licensesDir, "lucide-LICENSE.txt"), "utf8").replace(/\r\n/g, "\n").trim();
  const pkgs = await bundledPackages();

  const parts = [
    `Warframe State Graph — third-party notices
Generated by ts/scripts/gen-licenses.ts. Do not edit by hand.

Warframe State Graph itself is licensed under the MIT License (see LICENSE.txt).
This file lists the third-party software included in the distributed
warframe-state-graph.exe, with the notices each one requires.

  Bun runtime ${bunVersion} (embedded by bun build --compile)
  JavaScript packages bundled into the app: ${pkgs.map((p) => `${p.name} ${p.version}`).join(", ") || "(none)"}
  Icons: Lucide (ISC), game-icons.net (CC BY 3.0)
`,
    `${HEAD(`Bun ${bunVersion}`)}\n\nhttps://bun.com — the runtime embedded in the executable.\n\n${bunLicense}\n`,
    `${HEAD("JavaScript packages")}\n\n${pkgs
      .map((p) => `${RULE}\n${p.name} ${p.version}  (${p.license || "license not declared"})\n\n${licenseText(p.dir, `${p.name}@${p.version}`)}\n`)
      .join("\n")}`,
    `${HEAD("Icons")}\n\n${RULE}\nLucide  https://lucide.dev\n\n${lucide}\n\n${RULE}\ngame-icons.net  https://game-icons.net\n\n${GAME_ICONS}\n`,
    `${HEAD("Data")}\n\n${DATA_CREDIT}\n`,
  ];
  return parts.join("\n");
}

if (import.meta.main) {
  const text = await render();
  writeFileSync(OUTPUT, text, "utf8");
  console.log(`${OUTPUT} を書き出しました（${(text.length / 1024).toFixed(0)} KB）`);
}
