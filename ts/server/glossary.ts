// Port of pkg/glossary — a generic English->Japanese term-mapping store, so
// in-app game terms (Riven stat names etc.) are user-editable data rather
// than hardcoded strings. Seeds 28 Riven stat entries on first load. The
// edit UI (settings modal "用語" tab) lives on collections.html (Phase 10);
// this phase only needs the store, API, and the read-only glossary.html
// debug page.

import { z } from "zod";
import { AsyncMutex } from "./async-mutex.ts";
import { loadJSON, saveJSON, NotFoundError } from "./persist.ts";

export const EntrySchema = z.object({
  // The Go handler rejects an empty enKey/ja imperatively at the HTTP
  // boundary; expressed as a schema constraint here instead (same rule
  // NodeSchema uses for id/name).
  enKey: z.string().min(1),
  ja: z.string().min(1),
  category: z.string(),
});
export type Entry = z.infer<typeof EntrySchema>;

export const CURRENT_SCHEMA_VERSION = 1;

export const DataSchema = z.object({
  schemaVersion: z.number().default(CURRENT_SCHEMA_VERSION),
  entries: z.record(z.string(), EntrySchema).default({}),
});
export type Data = z.infer<typeof DataSchema>;

export function newData(): Data {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, entries: {} };
}

export const CATEGORY_RIVEN = "Riven";

// Web-researched (community wiki, not verified against official client
// text) per 03_Data_Source_Research.md 2.20 — the whole point of this store
// is that these are user-correctable from the "用語" tab, not authoritative.
export const DEFAULT_RIVEN_ENTRIES: Entry[] = [
  { enKey: "Grineer Damage", ja: "対グリニアダメージ", category: CATEGORY_RIVEN },
  { enKey: "Corpus Damage", ja: "対コーパスダメージ", category: CATEGORY_RIVEN },
  { enKey: "Infestation Damage", ja: "対感染体ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Weapon Damage / Melee Damage", ja: "基礎ダメージ / 近接ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Slash Damage", ja: "切断ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Puncture Damage", ja: "貫通ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Impact Damage", ja: "衝撃ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Heat Damage", ja: "火炎ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Cold Damage", ja: "冷気ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Electricity Damage", ja: "電気ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Toxin Damage", ja: "毒ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Critical Chance", ja: "クリティカル率", category: CATEGORY_RIVEN },
  { enKey: "Critical Damage", ja: "クリティカルダメージ", category: CATEGORY_RIVEN },
  { enKey: "Status Chance", ja: "状態異常確率", category: CATEGORY_RIVEN },
  { enKey: "Status Duration", ja: "状態異常の持続時間", category: CATEGORY_RIVEN },
  { enKey: "Fire Rate / Attack Speed", ja: "発射速度 / 攻撃速度", category: CATEGORY_RIVEN },
  { enKey: "Multishot", ja: "マルチショット", category: CATEGORY_RIVEN },
  { enKey: "Reload Speed", ja: "リロード速度", category: CATEGORY_RIVEN },
  { enKey: "Magazine Capacity", ja: "マガジンサイズ", category: CATEGORY_RIVEN },
  { enKey: "Ammo Maximum", ja: "弾薬所持上限", category: CATEGORY_RIVEN },
  { enKey: "Projectile Speed", ja: "弾速", category: CATEGORY_RIVEN },
  { enKey: "Punch Through", ja: "貫通距離", category: CATEGORY_RIVEN },
  { enKey: "Recoil", ja: "反動", category: CATEGORY_RIVEN },
  { enKey: "Zoom", ja: "ズーム", category: CATEGORY_RIVEN },
  { enKey: "Finisher Damage", ja: "追撃ダメージ", category: CATEGORY_RIVEN },
  { enKey: "Slide Critical Chance", ja: "スライド攻撃のクリティカル率", category: CATEGORY_RIVEN },
  { enKey: "Combo Duration", ja: "コンボ持続時間", category: CATEGORY_RIVEN },
  { enKey: "Heavy Attack Efficiency", ja: "ヘビー攻撃効率", category: CATEGORY_RIVEN },
  { enKey: "Range", ja: "範囲", category: CATEGORY_RIVEN },
];

export class GlossaryStore {
  readonly #path: string;
  readonly #mutex = new AsyncMutex();

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<Data> {
    return this.#mutex.run(() => this.#loadLocked());
  }

  async #loadLocked(): Promise<Data> {
    try {
      return await loadJSON(this.#path, DataSchema);
    } catch (err) {
      if (err instanceof NotFoundError) return this.#seedDefaultLocked();
      throw err;
    }
  }

  async #seedDefaultLocked(): Promise<Data> {
    const d = newData();
    for (const e of DEFAULT_RIVEN_ENTRIES) d.entries[e.enKey] = e;
    await this.#saveLocked(d);
    return d;
  }

  async #saveLocked(d: Data): Promise<void> {
    d.schemaVersion = CURRENT_SCHEMA_VERSION;
    await saveJSON(this.#path, d);
  }

  async upsert(e: Entry): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      d.entries[e.enKey] = e;
      await this.#saveLocked(d);
      return d;
    });
  }

  /** Deleting a nonexistent key is a no-op, matching the Go version. */
  async delete(enKey: string): Promise<Data> {
    return this.#mutex.run(async () => {
      const d = await this.#loadLocked();
      delete d.entries[enKey];
      await this.#saveLocked(d);
      return d;
    });
  }
}
