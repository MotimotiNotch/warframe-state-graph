// ライトテーマの文字色のコントラストを見張る（#23）。
//
// :root のトークンは 8 ページに複製されているので、1 ページだけ直して他が古いまま、
// が起きやすい。ここでは全ページの「ライト側の 2 ブロック」（media query と
// [data-theme="light"]）から --accent と --bg を読み、WCAG のコントラスト比を計算する。
//
// --accent は画面の文字（リンク・見出し・ボタンの文字）に使うので 4.5:1 を求める。
// 状態色の --root は点と輪にしか使わない（非文字の目安 3:1）ので、ここでは見ない。

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const webDir = import.meta.dir;
const pages = readdirSync(webDir).filter((f) => f.endsWith(".html"));

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** ライト側のブロックの本文を返す（media query の中の :root と [data-theme="light"]）。 */
function lightBlocks(html: string): string[] {
  const blocks: string[] = [];
  const media = /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)\s*\{([^}]*)\}/.exec(html);
  if (media) blocks.push(media[1]!);
  const attr = /:root\[data-theme="light"\]\s*\{([^}]*)\}/.exec(html);
  if (attr) blocks.push(attr[1]!);
  return blocks;
}

function token(block: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1];
}

describe("ライトテーマの --accent（#23）", () => {
  test("8 ページそれぞれにライト側のブロックが 2 つある（陽性対照）", () => {
    expect(pages.length).toBe(8);
    for (const p of pages) expect(lightBlocks(readFileSync(join(webDir, p), "utf8")).length).toBe(2);
  });

  for (const p of pages) {
    test(`${p}: --accent が背景に対して 4.5:1 以上`, () => {
      for (const block of lightBlocks(readFileSync(join(webDir, p), "utf8"))) {
        const accent = token(block, "--accent");
        const bg = token(block, "--bg");
        expect(accent).toBeDefined();
        expect(bg).toBeDefined();
        expect(contrast(accent!, bg!)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(accent!, "#ffffff")).toBeGreaterThanOrEqual(4.5); // --popover-bg はほぼ白
      }
    });
  }

  test("全ページで同じ値（複製のずれを見張る）", () => {
    const values = new Set(pages.flatMap((p) => lightBlocks(readFileSync(join(webDir, p), "utf8")).map((b) => token(b, "--accent"))));
    expect(values.size).toBe(1);
  });
});
