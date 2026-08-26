// Port of pkg/stats. Stats page holds only the actually-persisted "input"
// values (star chart/Steel Path/Intrinsics progress, Focus/Railjack
// configuration, quest-cleared state) — the 4-data-source-aggregate section
// itself (Chain View/Loadouts/Collections/Standing) is computed by the
// frontend reading each existing GET API, not stored here (2026-08-19
// design, 02_Requirements_and_Roadmap.md item 20).

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

export const PlanetProgressSchema = z.object({
  cleared: z.number().int().default(0),
  steelPathCleared: z.number().int().default(0),
});
export type PlanetProgress = z.infer<typeof PlanetProgressSchema>;

/** Railjack Intrinsics' 5 categories (Tactical/Piloting/Gunnery/Engineering/
 * Command). Rank 0-10 each (2026-08-19, Wiki-confirmed). */
export const RailjackCategories = ["Tactical", "Piloting", "Gunnery", "Engineering", "Command"] as const;

/** Drifter Intrinsics' 4 categories (Combat/Riding/Opportunity/Endurance).
 * Rank 0-10 each (2026-08-19, Wiki-confirmed). */
export const DrifterCategories = ["Combat", "Riding", "Opportunity", "Endurance"] as const;

export const IntrinsicMinRank = 0;
export const IntrinsicMaxRank = 10;

/** Operator Focus School's 5 schools. Kept in English in the UI too
 * (explicit user preference, 2026-08-20, item 23). */
export const FocusSchools = ["Madurai", "Naramon", "Zenurik", "Vazarin", "Unairu"] as const;

export const FocusInvestment = z.enum(["not_invested", "in_progress", "maxed"]);
export type FocusInvestment = z.infer<typeof FocusInvestment>;
export const ValidFocusInvestments = FocusInvestment.options;
export function IsValidFocusInvestment(v: string): v is FocusInvestment {
  return (ValidFocusInvestments as readonly string[]).includes(v);
}

/** Railjack's 4 component slots. Plexus (mods are a free-text note, tracked
 * separately as railjackPlexusNote) is deliberately excluded here
 * (2026-08-20, item 23). */
export const RailjackComponentSlots = ["Shield Array", "Engines", "Plating", "Reactor"] as const;

export const RailjackComponentSchema = z.object({
  house: z.string().default(""),
  grade: z.string().default(""),
});
export type RailjackComponent = z.infer<typeof RailjackComponentSchema>;

export const ValidRailjackHouses = ["", "Zetki", "Lavan", "Vidar"] as const;
export const ValidRailjackGrades = ["", "Mk I", "Mk II", "Mk III"] as const;
export function IsValidRailjackValue(v: string, allowed: readonly string[]): boolean {
  return allowed.includes(v);
}

/** Gates the Focus/Railjack/Drifter sections' collapse state on the Stats
 * page. Independent of Chain View node registration (`requires` graph) —
 * this is "did I actually clear this quest" as an account fact, which can be
 * true without any corresponding Chain View node existing (2026-08-22, added
 * as Stats' own input after "not registered in Chain View shouldn't mean
 * uncleared" feedback, replacing the old Chain-View-derived isQuestSatisfied() check). */
export const GatingQuests = ["The Second Dream", "Rising Tide", "The Duviri Paradox"] as const;

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  planets: z.record(z.string(), PlanetProgressSchema).default({}),
  railjackProxima: z.record(z.string(), PlanetProgressSchema).default({}),
  railjackIntrinsics: z.record(z.string(), z.number().int()).default({}),
  drifterIntrinsics: z.record(z.string(), z.number().int()).default({}),
  focusInvestment: z.record(z.string(), FocusInvestment).default({}),
  focusActiveSchool: z.string().default(""),
  railjackComponents: z.record(z.string(), RailjackComponentSchema).default({}),
  railjackPlexusNote: z.string().default(""),
  questsCleared: z.record(z.string(), z.boolean()).default({}),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  const d: Data = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    planets: {},
    railjackProxima: {},
    railjackIntrinsics: {},
    drifterIntrinsics: {},
    focusInvestment: {},
    focusActiveSchool: "",
    railjackComponents: {},
    railjackPlexusNote: "",
    questsCleared: {},
  };
  for (const name of RailjackCategories) d.railjackIntrinsics[name] = 0;
  for (const name of DrifterCategories) d.drifterIntrinsics[name] = 0;
  for (const name of FocusSchools) d.focusInvestment[name] = "not_invested";
  for (const slot of RailjackComponentSlots) d.railjackComponents[slot] = { house: "", grade: "" };
  for (const quest of GatingQuests) d.questsCleared[quest] = false;
  return d;
}

export class StatsStore {
  readonly #path: string;
  readonly #mutex = new AsyncMutex();

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<Data> {
    return this.#mutex.run(() => this.#loadLocked());
  }

  async #loadLocked(): Promise<Data> {
    let d: Data;
    try {
      d = await loadJSON(this.#path, DataSchema);
    } catch (err) {
      if (err instanceof NotFoundError) return newData();
      throw err;
    }
    for (const name of RailjackCategories) {
      if (!(name in d.railjackIntrinsics)) d.railjackIntrinsics[name] = 0;
    }
    for (const name of DrifterCategories) {
      if (!(name in d.drifterIntrinsics)) d.drifterIntrinsics[name] = 0;
    }
    for (const name of FocusSchools) {
      if (!(name in d.focusInvestment)) d.focusInvestment[name] = "not_invested";
    }
    for (const slot of RailjackComponentSlots) {
      if (!(slot in d.railjackComponents)) d.railjackComponents[slot] = { house: "", grade: "" };
    }
    for (const quest of GatingQuests) {
      if (!(quest in d.questsCleared)) d.questsCleared[quest] = false;
    }
    return d;
  }

  async #saveLocked(d: Data): Promise<void> {
    d.schemaVersion = CURRENT_SCHEMA_VERSION;
    await saveJSON(this.#path, d);
  }

  async setPlanetProgress(planetKey: string, progress: PlanetProgress): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.planets[planetKey] = progress;
      await this.#saveLocked(d);
      return d;
    });
  }

  /** "全部クリア"/"全部未クリア" bulk action: sets `field` to each item's own nodeCount (cleared) or 0 (uncleared), one lock/save. */
  async #setAllProgressField(
    dataMapKey: "planets" | "railjackProxima",
    items: { key: string; nodeCount: number }[],
    field: "cleared" | "steelPathCleared",
    cleared: boolean,
  ): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      for (const item of items) {
        const progress = { ...(d[dataMapKey][item.key] || { cleared: 0, steelPathCleared: 0 }) };
        progress[field] = cleared ? item.nodeCount : 0;
        d[dataMapKey][item.key] = progress;
      }
      await this.#saveLocked(d);
      return d;
    });
  }
  async setAllPlanetsField(planets: { key: string; nodeCount: number }[], field: "cleared" | "steelPathCleared", cleared: boolean): Promise<Data> {
    return this.#setAllProgressField("planets", planets, field, cleared);
  }
  async setAllProximaField(proxima: { key: string; nodeCount: number }[], field: "cleared" | "steelPathCleared", cleared: boolean): Promise<Data> {
    return this.#setAllProgressField("railjackProxima", proxima, field, cleared);
  }

  async setProximaProgress(proximaKey: string, progress: PlanetProgress): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.railjackProxima[proximaKey] = progress;
      await this.#saveLocked(d);
      return d;
    });
  }

  async setRailjackIntrinsic(category: string, rank: number): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.railjackIntrinsics[category] = rank;
      await this.#saveLocked(d);
      return d;
    });
  }

  async setDrifterIntrinsic(category: string, rank: number): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.drifterIntrinsics[category] = rank;
      await this.#saveLocked(d);
      return d;
    });
  }

  /** Stats' own quest-cleared state (independent of Chain View node registration). */
  async setQuestCleared(quest: string, cleared: boolean): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.questsCleared[quest] = cleared;
      await this.#saveLocked(d);
      return d;
    });
  }

  /** Sets multiple quests at once (main-quest prerequisite cascade), one lock/save. */
  async setQuestsCleared(quests: string[], cleared: boolean): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      for (const quest of quests) d.questsCleared[quest] = cleared;
      await this.#saveLocked(d);
      return d;
    });
  }

  async setFocusInvestment(school: string, investment: FocusInvestment): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.focusInvestment[school] = investment;
      await this.#saveLocked(d);
      return d;
    });
  }

  async setFocusActiveSchool(school: string): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.focusActiveSchool = school;
      await this.#saveLocked(d);
      return d;
    });
  }

  async setRailjackComponent(slot: string, component: RailjackComponent): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.railjackComponents[slot] = component;
      await this.#saveLocked(d);
      return d;
    });
  }

  async setRailjackPlexusNote(note: string): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.railjackPlexusNote = note;
      await this.#saveLocked(d);
      return d;
    });
  }
}
