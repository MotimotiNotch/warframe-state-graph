// ページごとに複製された :root のトークンの抜けを見張る（#25）。
//
// :root は 8 ページに複製されていて、index.html だけ --danger が無く、
// `var(--danger)`（フォールバック無し）が効いていなかった。ここでは各ページについて、
// そのページの HTML と、そのページのエントリから実際にバンドルされるモジュール
// （Bun の metafile）の両方から `var(--x)` を拾い、
//
// - フォールバック無しで使っている変数が、そのページの :root か、どこかの宣言
//   （`--x:` や `setProperty("--x")`）で定義されていること
// - ダークの :root に色として定義したトークンが、ライト側の 2 ブロック（media query と
//   [data-theme="light"]）でも上書きされていること（無いとライトでダークの色が出る）
//
// を確かめる。

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const webDir = import.meta.dir;
const pages = readdirSync(webDir).filter((f) => f.endsWith(".html"));

function rootBlock(html: string, opener: RegExp): string {
  const m = opener.exec(html);
  if (!m) return "";
  const start = m.index + m[0].length;
  return html.slice(start, html.indexOf("}", start));
}

const BASE = /\n\s*:root \{/;
const LIGHT_MEDIA = /:root:not\(\[data-theme="dark"\]\) \{/;
const LIGHT_ATTR = /:root\[data-theme="light"\] \{/;

function declared(css: string): Map<string, string> {
  return new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

async function pageSources(page: string): Promise<string> {
  const html = readFileSync(join(webDir, page), "utf8");
  const entry = join(webDir, page.replace(/\.html$/, ".ts"));
  const built = await Bun.build({ entrypoints: [entry], target: "browser", metafile: true } as Parameters<typeof Bun.build>[0]);
  const meta = (built as unknown as { metafile?: { inputs: Record<string, unknown> } }).metafile;
  if (!meta) throw new Error("Bun.build が metafile を返さなかった");
  const modules = Object.keys(meta.inputs).map((p) => readFileSync(isAbsolute(p) ? p : join(process.cwd(), p), "utf8"));
  return [html, ...modules].join("\n");
}

describe("ページごとのトークンの抜け（#25）", () => {
  test("8 ページある（陽性対照）", () => {
    expect(pages.length).toBe(8);
  });

  for (const page of pages) {
    test(`${page}: フォールバック無しで使う変数が定義されている`, async () => {
      const src = await pageSources(page);
      const html = readFileSync(join(webDir, page), "utf8");
      const root = declared(rootBlock(html, BASE));
      const anywhere = new Set([
        ...[...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!),
        ...[...src.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)].map((m) => m[1]!),
      ]);
      const bare = new Set([...src.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]!));
      const undefinedVars = [...bare].filter((n) => !root.has(n) && !anywhere.has(n));
      expect(undefinedVars).toEqual([]);
    });

    test(`${page}: ダークの色トークンをライト側の 2 ブロックが上書きしている`, () => {
      const html = readFileSync(join(webDir, page), "utf8");
      const base = declared(rootBlock(html, BASE));
      const media = declared(rootBlock(html, LIGHT_MEDIA));
      const attr = declared(rootBlock(html, LIGHT_ATTR));
      const colors = [...base].filter(([, v]) => /#|rgb|hsl/.test(v)).map(([n]) => n);
      expect(colors.length).toBeGreaterThan(0); // 陽性対照
      expect(colors.filter((n) => !media.has(n))).toEqual([]);
      expect(colors.filter((n) => !attr.has(n))).toEqual([]);
      expect([...media].filter(([n, v]) => attr.get(n) !== v)).toEqual([]); // 2 ブロックは同じ値
    });
  }
});
