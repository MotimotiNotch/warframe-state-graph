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
// Bun statically links JavaScriptCore / WebKit (LGPL 2.0) and tinycc (LGPL 2.1).
// LGPL section 6 lets this exe be distributed under MIT as long as it carries
// a notice, the license texts, and one of the options for getting the library
// source and relinking — this file uses the written offer (#29). The pinned
// commits come from licenses/bun-lgpl-sources.json, which has to be updated
// together with bun-version in release.yml (the test checks the version).
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

export interface LgplSources {
  bun: string;
  webkit: string;
  tinycc: string;
}

export function lgplSources(): LgplSources {
  return JSON.parse(readFileSync(join(licensesDir, "bun-lgpl-sources.json"), "utf8")) as LgplSources;
}

const REPO = "https://github.com/MotimotiNotch/warframe-state-graph";

function lgplSection(src: LgplSources, tag: string | undefined): string {
  const appSource = tag ? `${REPO}/tree/${tag}` : `${REPO}/releases (the tag matching your download)`;
  return `The Bun runtime embedded in warframe-state-graph.exe statically links two
libraries under the GNU LGPL:

- JavaScriptCore / WebKit — GNU Library General Public License, version 2
  (the full text is at the end of this file)
- tinycc — GNU Lesser General Public License, version 2.1
  (the full text is at the end of this file)

Warframe State Graph itself is distributed under the MIT License, which
permits modification for your own use and reverse engineering for debugging
such modifications.

Source code
-----------
- WebKit (JavaScriptCore), as used by Bun ${src.bun}:
  https://github.com/oven-sh/WebKit/tree/${src.webkit}
- tinycc, as used by Bun ${src.bun} (Bun applies patches/tinycc/ from its own
  source tree on top):
  https://github.com/oven-sh/tinycc/tree/${src.tinycc}
- Bun ${src.bun} (the code that links against them):
  https://github.com/oven-sh/bun/tree/bun-v${src.bun}
- Warframe State Graph (the code that runs on Bun):
  ${appSource}

Relinking with a modified library
---------------------------------
1. Check out Bun at bun-v${src.bun} and build it with your modified WebKit /
   tinycc. Bun documents this in its LICENSE.md (above): clone oven-sh/WebKit
   into vendor/WebKit, run "bun sync-webkit-source", make your changes, then
   "bun run build:local".
2. Check out Warframe State Graph at the tag of your download, and with the
   Bun you built, run in ts/: "bun install", "bun run prebuild-embed", then
   the "bun build --compile" command in .github/workflows/release.yml.
   The result is warframe-state-graph.exe containing your modified library.

Written offer
-------------
For at least three years from the date you received this copy, the author of
Warframe State Graph will give you, on request, a copy of the complete source
code of the LGPL libraries above as used in this build, together with the
materials listed here for relinking, for a charge no more than the cost of
providing them. Ask via ${REPO}/issues or X @motimotinotch.`;
}

export async function render(): Promise<string> {
  const bunVersion = releaseBunVersion();
  const src = lgplSources();
  const tag = process.env.GITHUB_REF_NAME?.startsWith("v") ? process.env.GITHUB_REF_NAME : undefined;
  const lgpl20 = readFileSync(join(licensesDir, "lgpl-2.0.txt"), "utf8").replace(/\r\n/g, "\n").trim();
  const lgpl21 = readFileSync(join(licensesDir, "lgpl-2.1.txt"), "utf8").replace(/\r\n/g, "\n").trim();
  const bunLicense = readFileSync(join(licensesDir, "bun-LICENSE.md"), "utf8").replace(/\r\n/g, "\n").trim();
  const lucide = readFileSync(join(licensesDir, "lucide-LICENSE.txt"), "utf8").replace(/\r\n/g, "\n").trim();
  const pkgs = await bundledPackages();

  const parts = [
    `Warframe State Graph — third-party notices
Generated by ts/scripts/gen-licenses.ts. Do not edit by hand.

Warframe State Graph itself is licensed under the MIT License (see LICENSE.txt).
This file lists the third-party software included in the distributed
warframe-state-graph.exe, with the notices each one requires.

  Bun runtime ${bunVersion} (embedded by bun build --compile), which statically
    links JavaScriptCore / WebKit (LGPL 2.0) and tinycc (LGPL 2.1) — see
    "LGPL libraries: source code, relinking and written offer" below
  JavaScript packages bundled into the app: ${pkgs.map((p) => `${p.name} ${p.version}`).join(", ") || "(none)"}
  Icons: Lucide (ISC), game-icons.net (CC BY 3.0)
`,
    `${HEAD(`Bun ${bunVersion}`)}\n\nhttps://bun.com — the runtime embedded in the executable.\n\n${bunLicense}\n`,
    `${HEAD("LGPL libraries: source code, relinking and written offer")}\n\n${lgplSection(src, tag)}\n`,
    `${HEAD("JavaScript packages")}\n\n${pkgs
      .map((p) => `${RULE}\n${p.name} ${p.version}  (${p.license || "license not declared"})\n\n${licenseText(p.dir, `${p.name}@${p.version}`)}\n`)
      .join("\n")}`,
    `${HEAD("Icons")}\n\n${RULE}\nLucide  https://lucide.dev\n\n${lucide}\n\n${RULE}\ngame-icons.net  https://game-icons.net\n\n${GAME_ICONS}\n`,
    `${HEAD("Data")}\n\n${DATA_CREDIT}\n`,
    `${HEAD("GNU Library General Public License, version 2 (JavaScriptCore / WebKit)")}\n\n${lgpl20}\n`,
    `${HEAD("GNU Lesser General Public License, version 2.1 (tinycc)")}\n\n${lgpl21}\n`,
  ];
  return parts.join("\n");
}

if (import.meta.main) {
  const text = await render();
  writeFileSync(OUTPUT, text, "utf8");
  console.log(`${OUTPUT} を書き出しました（${(text.length / 1024).toFixed(0)} KB）`);
}
