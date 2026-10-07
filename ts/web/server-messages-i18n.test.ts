// Text that originates on the server must reach the screen in the user's
// language (#26). The server sends codes; these tests check that every code it
// can send has wording on the web side in both languages, and that the
// Standing notes it serves are actually translated.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_SYNDICATES } from "../server/standing.ts";

const serverDir = join(import.meta.dir, "..", "server");
const inspector = readFileSync(join(import.meta.dir, "inspector.ts"), "utf8");

const JAPANESE = /[぀-ヿ㐀-鿿]/;

describe("server error codes are worded on the web side (#26)", () => {
  const codes = new Set(
    ["store.ts", "main.ts"].flatMap((f) =>
      [...readFileSync(join(serverDir, f), "utf8").matchAll(/new CodedError\(\s*"([\w.]+)"/g)].map((m) => m[1]!),
    ),
  );

  test("the server throws coded errors (positive control)", () => {
    expect(codes.size).toBeGreaterThan(0);
  });

  for (const code of codes) {
    test(`${code}: inspector.ts has a ja and an en sentence`, () => {
      const entries = inspector.split(`"${code}":`).length - 1;
      expect(entries).toBe(2);
    });
  }
});

describe("Standing notes are bilingual (#26)", () => {
  const withNotes = ALL_SYNDICATES.filter((s) => s.note);

  test("some syndicates have notes (positive control)", () => {
    expect(withNotes.length).toBeGreaterThan(0);
  });

  for (const s of withNotes) {
    test(`${s.name}: both languages are written, and the English one is English`, () => {
      expect(s.note!.ja.length).toBeGreaterThan(0);
      expect(s.note!.en.length).toBeGreaterThan(0);
      expect(s.note!.en).not.toMatch(JAPANESE);
    });
  }
});
