// Ported 1:1 from pkg/wfcdgen/wfcdgen_test.go.
import { expect, test } from "bun:test";
import type { Item, SyndicateEntry } from "./wfcd.ts";
import { BuildSuggestion, checkRiven, classifyParadigm, detectArchetype, detectRichLich, Slug } from "./wfcdgen.ts";

function item(overrides: Partial<Item>): Item {
  return { name: "", ...overrides };
}

test("classifyParadigm", () => {
  const cases: [string, Item, string][] = [
    ["no components, not a pet -> instant", item({ category: "Melee" }), "instant"],
    ["no components, pet category -> breeding", item({ category: "Pets" }), "breeding"],
    ["zaw component type -> modular", item({ type: "Zaw Component" }), "modular"],
    [
      "single blueprint + generic material without own drops -> single-blueprint",
      item({ components: [{ name: "Blueprint" }, { name: "Orokin Cell" }] }),
      "single-blueprint",
    ],
    [
      "braton prime style, 2+ parts each with own drop -> multi-part",
      item({
        components: [
          { name: "Braton Prime Barrel", drops: [{ location: "Axi B1", chance: 0 }] },
          { name: "Braton Prime Receiver", drops: [{ location: "Meso B2", chance: 0 }] },
          { name: "Braton Prime Stock", drops: [{ location: "Neo B3", chance: 0 }] },
        ],
      }),
      "multi-part",
    ],
  ];
  for (const [name, it, want] of cases) {
    expect(classifyParadigm(it), name).toBe(want as ReturnType<typeof classifyParadigm>);
  }
});

test("detectRichLich", () => {
  const cases: [string, string, boolean][] = [
    ["Kuva Bramma", "Kuva", true],
    ["Tenet Cycron", "Tenet", true],
    ["Coda Broadhead", "Coda", true],
    ["Braton Prime", "", false],
  ];
  for (const [name, wantKind, wantOK] of cases) {
    const { kind, ok } = detectRichLich(name);
    expect(ok).toBe(wantOK);
    expect(kind).toBe(wantKind);
  }
});

test("detectArchetype", () => {
  const cases: [string, Item, string][] = [
    ["crit-heavy", item({ criticalChance: 0.3, procChance: 0.1 }), "Crit"],
    ["status-heavy", item({ criticalChance: 0.1, procChance: 0.3 }), "Status"],
    ["hybrid", item({ criticalChance: 0.3, procChance: 0.3 }), "Hybrid"],
    ["neither", item({ criticalChance: 0.05, procChance: 0.05 }), "Utility"],
  ];
  for (const [name, it, want] of cases) {
    expect(detectArchetype(it), name).toBe(want as ReturnType<typeof detectArchetype>);
  }
});

test("checkRiven", () => {
  const statusWeapon = item({ criticalChance: 0.1, procChance: 0.3 }); // Status archetype

  const cases: [string, string[], boolean, string[] | undefined][] = [
    ["status stat matches status weapon", ["Status Chance"], true, ["Status Chance"]],
    ["hybrid stat always matches", ["Multishot"], true, ["Multishot"]],
    ["crit-only stat does not match status weapon", ["Critical Chance"], false, undefined],
    ["unrelated stat does not match", ["Reload Speed"], false, undefined],
  ];
  for (const [name, positiveStats, wantMatches, wantMatched] of cases) {
    const got = checkRiven(statusWeapon, positiveStats);
    expect(got.archetype, name).toBe("Status");
    expect(got.matches, name).toBe(wantMatches);
    expect(got.matchedStats?.length ?? 0, name).toBe(wantMatched?.length ?? 0);
  }
});

test("Slug", () => {
  expect(Slug("Ash Prime Neuroptics")).toBe("ash-prime-neuroptics");
  expect(Slug("Arch-Gun (Prisma)")).toBe("arch-gun-prisma");
});

test("BuildSuggestion: multi-part", () => {
  const it = item({
    name: "Braton Prime",
    uniqueName: "/Lotus/Weapons/Braton/BratonPrime",
    components: [
      { name: "Braton Prime Barrel", drops: [{ location: "Void Relic (Axi B1) (25.33%)", chance: 25.33 }] },
      { name: "Braton Prime Receiver", drops: [{ location: "Void Relic (Meso B2) (11%)", chance: 11 }] },
    ],
  });
  const activeRelics = new Set(["Meso B2"]); // Axi B1 excluded -> presumed Vaulted

  const sug = BuildSuggestion(it, "Weapon", activeRelics, undefined);

  expect(sug.paradigm).toBe("multi-part");
  expect(sug.root.id).toBe("braton-prime");
  expect(sug.root.uniqueName).toBe(it.uniqueName);
  expect(sug.root.contains?.length).toBe(2);
  expect(sug.parts?.length).toBe(2);

  const barrel = sug.parts![0]!;
  expect(barrel.node.id).toBe("braton-prime-braton-prime-barrel");
  expect(barrel.relicCandidates?.length).toBe(1);
  expect(barrel.relicCandidates![0]!.vaulted).toBe(true);

  const receiver = sug.parts![1]!;
  expect(receiver.relicCandidates?.length).toBe(1);
  expect(receiver.relicCandidates![0]!.vaulted).toBe(false);
});

test("BuildSuggestion: syndicate weapon", () => {
  const it = item({ name: "Vaykor Marelok" });
  const syndicates: Record<string, SyndicateEntry[]> = {
    "Steel Meridian": [{ item: "Vaykor Marelok", place: "Steel Meridian, General", standing: 100000, chance: 0, rarity: "" }],
  };

  const sug = BuildSuggestion(it, "Weapon", undefined, syndicates);

  expect(sug.syndicateRank).toBeDefined();
  expect(sug.syndicateRank!.node.id).toBe("steel-meridian-general");
  expect(sug.syndicateRank!.node.type).toBe("Syndicate");
  expect(sug.syndicateRank!.standing).toBe(100000);
});

test("BuildSuggestion: non-syndicate weapon has no rank", () => {
  const it = item({ name: "Braton" });
  const sug = BuildSuggestion(it, "Weapon", undefined, {
    "Steel Meridian": [{ item: "Vaykor Marelok", place: "Steel Meridian, General", standing: 100000, chance: 0, rarity: "" }],
  });
  expect(sug.syndicateRank).toBeUndefined();
});
