// Issue #15: the checks that stand between a WFCD_ITEMS_REF bump and a
// silently different result. Each case is a shape WFCD has actually had or
// one the fetchers can't read.
import { expect, test } from "bun:test";
import { checkI18n, checkItemList, ShapeError } from "./wfcd-shape.ts";

const rhino = { name: "Rhino", uniqueName: "/Lotus/Powersuits/Rhino/Rhino" };

test("checkItemList: both the pre-#992 embedded parts and the bare references pass", () => {
  checkItemList("Warframes.json", [{ ...rhino, components: [{ uniqueName: "/bp", name: "Blueprint", drops: [] }] }]);
  checkItemList("Warframes.json", [{ ...rhino, components: [{ uniqueName: "/bp", itemCount: 1 }] }]);
});

test("checkItemList: a part with neither uniqueName nor name fails, naming the file and item", () => {
  expect(() => checkItemList("Warframes.json", [{ ...rhino, components: [{ itemCount: 1 }] }])).toThrow(
    "WFCD Warframes.json: [0] /Lotus/Powersuits/Rhino/Rhino: components[0] has neither uniqueName nor name",
  );
});

test("checkItemList: not an array, empty, or an item without a name fails", () => {
  expect(() => checkItemList("Misc.json", { items: [] })).toThrow(ShapeError);
  expect(() => checkItemList("Misc.json", [])).toThrow("empty item list");
  expect(() => checkItemList("Misc.json", [{ uniqueName: "/x" }])).toThrow("name is not a string");
});

test("checkItemList: drops are checked only when asked (Components.json)", () => {
  const bad = [{ ...rhino, drops: [{ chance: 1 }] }];
  checkItemList("Mods.json", bad); // Mods drops are never read
  expect(() => checkItemList("Components.json", bad, { drops: true })).toThrow("drops[0] lacks location/chance");
});

test("checkI18n: the per-language shape passes even with some unnamed entries", () => {
  checkI18n("i18n/ja.json", { "/a": { name: "ライノ" }, "/b": { name: "設計図" }, "/c": { description: "..." } });
});

test("checkI18n: the pre-#992 nested shape fails", () => {
  expect(() => checkI18n("i18n/ja.json", { "/a": { ja: { name: "ライノ" } }, "/b": { ja: { name: "設計図" } } })).toThrow(
    "only 0 of 2 entries have a string name",
  );
  expect(() => checkI18n("i18n/ja.json", [])).toThrow("expected an object");
});
