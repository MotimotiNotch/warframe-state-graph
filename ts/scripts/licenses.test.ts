// The committed third-party notices must keep up with what actually ships (#28).
// gen-licenses.ts regenerates the file in the release workflow, but the
// committed copy is what people read on GitHub, so a dependency added without
// rerunning `bun run licenses` should fail here.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bundledPackages, lgplSources, OUTPUT, releaseBunVersion } from "./gen-licenses.ts";

const notices = readFileSync(OUTPUT, "utf8");
const releaseYml = readFileSync(join(import.meta.dir, "..", "..", ".github", "workflows", "release.yml"), "utf8");

describe("third-party notices (#28)", () => {
  test("every package the bundles contain is listed with its version", async () => {
    const pkgs = await bundledPackages();
    expect(pkgs.length).toBeGreaterThan(0); // positive control: zod is bundled
    for (const p of pkgs) expect(notices).toContain(`${p.name} ${p.version}`);
  });

  test("the Bun section matches the Bun that builds the release", () => {
    const v = releaseBunVersion();
    expect(notices).toContain(`Bun ${v}`);
    // licenses/bun-LICENSE.md must be the copy for that same tag — refetch it
    // when bumping bun-version in release.yml.
    const bunLicense = readFileSync(join(import.meta.dir, "..", "licenses", "bun-LICENSE.md"), "utf8");
    expect(bunLicense).toContain(`bun-v${v}/LICENSE.md`);
  });

  test("CC BY attribution for both game-icons.net icons is present", () => {
    for (const s of ['"Padlock" by Lorc', '"Hourglass" by Lorc', "creativecommons.org/licenses/by/3.0"]) expect(notices).toContain(s);
  });

  test("the release zip includes the notices and the project's own LICENSE", () => {
    expect(releaseYml).toContain("bun run licenses");
    expect(releaseYml).toContain("THIRD_PARTY_LICENSES.txt");
    expect(releaseYml).toContain("LICENSE.txt");
  });
});

describe("LGPL libraries inside Bun (#29)", () => {
  test("the pinned WebKit / tinycc commits are for the Bun that builds the release", () => {
    // Update licenses/bun-lgpl-sources.json from oven-sh/bun at the new tag
    // whenever bun-version in release.yml changes.
    expect(lgplSources().bun).toBe(releaseBunVersion());
  });

  test("the notices carry both license texts, the source locations and the written offer", () => {
    const src = lgplSources();
    for (const s of [
      "GNU LIBRARY GENERAL PUBLIC LICENSE",
      "Version 2, June 1991",
      "GNU LESSER GENERAL PUBLIC LICENSE",
      "Version 2.1, February 1999",
      `oven-sh/WebKit/tree/${src.webkit}`,
      `oven-sh/tinycc/tree/${src.tinycc}`,
      `oven-sh/bun/tree/bun-v${src.bun}`,
      "Written offer",
      "at least three years",
    ]) expect(notices).toContain(s);
  });

  test("the in-app credits name JavaScriptCore / WebKit and the LGPL in both languages", () => {
    const manual = readFileSync(join(import.meta.dir, "..", "web", "manual.ts"), "utf8");
    const credits = manual.slice(manual.indexOf('id: "credits"'), manual.indexOf('id: "easter-egg"'));
    expect(credits.split("JavaScriptCore / WebKit").length - 1).toBe(2);
    expect(credits).toContain("LGPL 2.0");
  });
});
