// color-scheme がテーマのブロックごとに当たっているかを見張る（#24）。
//
// color-scheme が無いと、ダークでもスクロールバー・range・checkbox・number の
// 上下ボタンがブラウザ既定の明るい見た目のまま出る。:root は 8 ページに複製されて
// いるので、全ページの 3 ブロック（既定＝ダーク、media query のライト、
// [data-theme="light"]）をそれぞれ確かめる。

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const webDir = import.meta.dir;
const pages = readdirSync(webDir).filter((f) => f.endsWith(".html"));

function block(html: string, opener: RegExp): string | undefined {
  const m = opener.exec(html);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  return html.slice(start, html.indexOf("}", start));
}

describe("color-scheme（#24）", () => {
  test("8 ページある（陽性対照）", () => {
    expect(pages.length).toBe(8);
  });

  for (const p of pages) {
    test(`${p}: 既定はダーク、ライトの 2 ブロックはライト`, () => {
      const html = readFileSync(join(webDir, p), "utf8");
      expect(block(html, /\n\s*:root \{/)).toMatch(/color-scheme:\s*dark;/);
      expect(block(html, /:root:not\(\[data-theme="dark"\]\) \{/)).toMatch(/color-scheme:\s*light;/);
      expect(block(html, /:root\[data-theme="light"\] \{/)).toMatch(/color-scheme:\s*light;/);
    });
  }
});
