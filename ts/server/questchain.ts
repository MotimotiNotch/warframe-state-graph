// Port of pkg/questchain. Main-story quest prerequisite table, mechanically
// copied — the source data (WARFRAME Wiki "Quest" page, Quest Progression
// section, confirmed 2026-08-19) is hand-researched and not re-derivable from
// any dataset (see the Go package doc comment for the full research trail:
// neither WFCD Quests.json nor calamity-inc ExportKeys.json carries a
// prerequisite field). Name casing must match WFCD's Quests.json exactly
// (all-words-capitalized, prepositions included) — a 2026-08-22 casing
// mismatch on 4 "Heart of Deimos"-style entries caused the quest-cleared
// cascade to write to a different key than the checklist read from.

export interface Entry {
  name: string;
  prerequisites?: string[];
}

export const MainStoryChain: Entry[] = [
  // --- Arc 1: Tenno Awakening ---
  { name: "Awakening" },
  { name: "Vor's Prize", prerequisites: ["Awakening"] },
  { name: "The Teacher", prerequisites: ["Vor's Prize"] },
  { name: "Vox Solaris", prerequisites: ["The Teacher"] },
  { name: "Once Awake", prerequisites: ["Vox Solaris"] },
  { name: "Heart Of Deimos", prerequisites: ["Once Awake"] },
  { name: "The Archwing", prerequisites: ["Heart Of Deimos"] },
  { name: "Stolen Dreams", prerequisites: ["The Archwing"] },
  { name: "The New Strange", prerequisites: ["Stolen Dreams"] },
  { name: "The Duviri Paradox", prerequisites: ["The New Strange"] },

  // --- Arc 2: This Is What You Are ---
  { name: "Natah" },
  { name: "The Second Dream", prerequisites: ["Natah"] },
  { name: "Octavia's Anthem", prerequisites: ["The Second Dream"] },
  { name: "The Silver Grove", prerequisites: ["The Second Dream"] },
  { name: "The War Within", prerequisites: ["The Second Dream"] },
  { name: "The Glast Gambit", prerequisites: ["The War Within"] },
  { name: "Rising Tide", prerequisites: ["The War Within"] },
  { name: "Chains Of Harrow", prerequisites: ["Rising Tide"] },
  { name: "Apostasy Prologue", prerequisites: ["Chains Of Harrow"] },
  { name: "The Sacrifice", prerequisites: ["Apostasy Prologue"] },

  // --- Arc 3: The New War ---
  { name: "Prelude to War", prerequisites: ["The Sacrifice"] },
  { name: "Chimera Prologue", prerequisites: ["Prelude to War"] },
  { name: "Erra", prerequisites: ["Chimera Prologue"] },
  { name: "The Maker", prerequisites: ["Erra"] },
  // The New War is also tied to Duviri Paradox (Arc1 tail) per the Wiki;
  // the mainline (Arc3, after The Maker) is used as the representative prerequisite here.
  { name: "The New War", prerequisites: ["The Maker"] },
  { name: "Angels Of The Zariman", prerequisites: ["The New War"] },
  { name: "Veilbreaker", prerequisites: ["The New War"] },
  { name: "Jade Shadows", prerequisites: ["Veilbreaker"] },
  { name: "Jade Shadows: Constellations", prerequisites: ["Jade Shadows"] },

  // --- Arc 4: Void War Saga ---
  { name: "Whispers In The Walls", prerequisites: ["The New War"] },
  { name: "The Lotus Eaters", prerequisites: ["Whispers In The Walls"] },
  // The Hex's Wiki entry explicitly lists Duviri Paradox as an additional (AND) prerequisite.
  { name: "The Hex", prerequisites: ["The Lotus Eaters", "The Duviri Paradox"] },
  { name: "The Old Peace", prerequisites: ["The Lotus Eaters"] },
];

function entryByName(name: string): Entry | undefined {
  const key = name.toLowerCase();
  return MainStoryChain.find((e) => e.name.toLowerCase() === key);
}

export function MainQuestNames(): string[] {
  return MainStoryChain.map((e) => e.name);
}

const slugPattern = /[^a-z0-9]+/g;

export function Slug(name: string): string {
  const s = name.toLowerCase().replace(slugPattern, "-");
  return s.replace(/^-+|-+$/g, "");
}

/** Walks prerequisites recursively from questName and returns the chain
 * (questName included, no duplicates, prerequisites before dependents). A
 * name not in MainStoryChain (side quest, or unknown) returns just itself. */
export function ResolveChain(questName: string): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  function walk(name: string): void {
    const key = name.toLowerCase();
    if (visited.has(key)) return;
    visited.add(key);
    const entry = entryByName(name);
    if (!entry) {
      order.push(name);
      return;
    }
    for (const pre of entry.prerequisites ?? []) walk(pre);
    order.push(entry.name);
  }
  walk(questName);
  return order;
}

/** Direct (one-level, not recursive) prerequisites of questName. Empty if not found. */
export function Prerequisites(questName: string): string[] {
  return entryByName(questName)?.prerequisites ?? [];
}
