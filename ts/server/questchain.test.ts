// Ported 1:1 from pkg/questchain/questchain_test.go.
import { expect, test } from "bun:test";
import { ResolveChain, Slug } from "./questchain.ts";

test("ResolveChain: linear prerequisites", () => {
  const got = ResolveChain("The Teacher");
  expect(got).toEqual(["Awakening", "Vor's Prize", "The Teacher"]);
});

test("ResolveChain: multiple (AND) prerequisites", () => {
  const got = ResolveChain("The Hex");
  expect(got).toContain("The Lotus Eaters");
  expect(got).toContain("The Duviri Paradox");
  expect(got[got.length - 1]).toBe("The Hex");
});

test("ResolveChain: unknown quest returns self only", () => {
  const got = ResolveChain("Some Side Quest Not In The Table");
  expect(got).toEqual(["Some Side Quest Not In The Table"]);
});

test("ResolveChain: no duplicates on diamond dependency", () => {
  const got = ResolveChain("The Hex");
  expect(new Set(got).size).toBe(got.length);
});

test("Slug", () => {
  expect(Slug("The Second Dream")).toBe("the-second-dream");
  expect(Slug("Vor's Prize")).toBe("vor-s-prize");
});
