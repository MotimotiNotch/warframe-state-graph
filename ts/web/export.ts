// Port of web/export.js. Converts card content (frame/weapon/companion name,
// MOD config, note) to human-readable plain text and copies it to the
// clipboard — for sharing a build with a friend or pasting into an AI chat
// (2026-08-20 design).
//
// The Riven/Kuva/FrameEntry/etc. exporters are ahead of pkg/collection
// itself (Phase 10, not ported yet) — their shapes are typed locally here
// (mirroring pkg/collection/model.go field-for-field) rather than blocking
// on that port, same pattern as wfcd-wizard.ts's RelicCandidate.
import type { ConfigSlot, Item, BuildSet } from "../server/loadout.ts";
import { effective } from "./locale.ts";

interface ExportStrings {
  unknownItem: (id: string) => string;
  configWithMods: (name: string, config: string, mods: string) => string;
  noMods: string;
  rivenState: string;
  rollFixed: string;
  needsReroll: string;
  ownedLabel: string;
  obtainedLabel: string;
  acquiredLabel: string;
  yes: string;
  noOwned: string;
  noObtained: string;
  noAcquired: string;
  bonusStat: string;
  rank30: string;
  helminth: string;
  incarnon: string;
  shortYes: string;
  shortNo: string;
  copyFailedLog: string;
  copyFailedTitle: string;
}

const STRINGS: Record<"ja" | "en", ExportStrings> = {
  ja: {
    unknownItem: (id) => `(不明なアイテム: ${id})`,
    configWithMods: (name, config, mods) => `${name}（Config ${config}: ${mods}）`,
    noMods: "MODなし",
    rivenState: "状態",
    rollFixed: "ロール確定",
    needsReroll: "要リロール",
    ownedLabel: "所持",
    obtainedLabel: "取得",
    acquiredLabel: "入手",
    yes: "済み",
    noOwned: "未所持",
    noObtained: "未取得",
    noAcquired: "未入手",
    bonusStat: "ボーナス属性",
    rank30: "ランク30",
    helminth: "ヘルミンス",
    incarnon: "インカーノン",
    shortYes: "済み",
    shortNo: "未",
    copyFailedLog: "クリップボードへのコピーに失敗",
    copyFailedTitle: "コピーに失敗しました（もう一度お試しください）",
  },
  en: {
    unknownItem: (id) => `(unknown item: ${id})`,
    configWithMods: (name, config, mods) => `${name} (Config ${config}: ${mods})`,
    noMods: "no mods",
    rivenState: "State",
    rollFixed: "roll finalized",
    needsReroll: "needs rerolling",
    ownedLabel: "Owned",
    obtainedLabel: "Obtained",
    acquiredLabel: "Acquired",
    yes: "yes",
    noOwned: "no",
    noObtained: "no",
    noAcquired: "no",
    bonusStat: "Bonus stat",
    rank30: "Rank 30",
    helminth: "Helminth",
    incarnon: "Incarnon",
    shortYes: "yes",
    shortNo: "no",
    copyFailedLog: "Failed to copy to the clipboard",
    copyFailedTitle: "Copy failed (please try again)",
  },
};

function t(): ExportStrings {
  return STRINGS[effective()];
}

export function buildItemExportText(item: Item): string {
  const lines = [`${item.name} (${item.type})`];
  const slots: ConfigSlot[] = item.type === "Companion" ? ["A"] : ["A", "B", "C"];
  slots.forEach((slot) => {
    const mods = item.configs?.[slot] ?? [];
    if (!mods.length) return;
    lines.push("", `[Config ${slot}]`, ...mods.map((m) => `- ${m}`));
  });
  if (item.note) {
    lines.push("", "Note:", item.note);
  }
  return lines.join("\n");
}

/** items: state.data.items (id -> Item). Resolves frame/weapon refs to name + MODs. */
export function buildBuildSetExportText(set: BuildSet, items: Record<string, Item>): string {
  const resolve = (ref: { itemId: string; config: ConfigSlot }): string => {
    const item = items[ref.itemId];
    if (!item) return t().unknownItem(ref.itemId);
    const mods = item.configs?.[ref.config] ?? [];
    return t().configWithMods(item.name, ref.config, mods.length ? mods.join(", ") : t().noMods);
  };
  const lines = [`${set.name} (Build Set)`];
  if (set.frame) lines.push("", `Frame: ${resolve(set.frame)}`);
  if ((set.weapons ?? []).length) {
    lines.push("", "Weapons:", ...set.weapons.map((w) => `- ${resolve(w)}`));
  }
  if (set.note) lines.push("", "Note:", set.note);
  return lines.join("\n");
}

/** Formats one Riven stat as "label +value%" (value omitted if unset/0, so an unrolled Riven still renders). */
export function formatRivenStat(statKey: string, value: number | undefined, jaFn?: (s: string) => string): string {
  const label = (jaFn ?? ((s: string) => s))(statKey);
  if (!value) return label;
  const sign = value > 0 ? "+" : ""; // a negative value already carries its own "-"
  return `${label} ${sign}${value}%`;
}

export interface RivenEntry {
  weaponName: string;
  positiveStats?: string[];
  positiveValues?: number[];
  negativeStat?: string;
  negativeValue?: number;
  fixed: boolean;
  note?: string;
}

/** jaFn: localizes a Riven stat key (caller passes collections.html's `ja()`; raw key if omitted). */
export function buildRivenExportText(entry: RivenEntry, jaFn?: (s: string) => string): string {
  const lines = [`${entry.weaponName} (Riven)`];
  if ((entry.positiveStats ?? []).length) {
    const values = entry.positiveValues ?? [];
    lines.push(`Positive: ${entry.positiveStats!.map((s, i) => formatRivenStat(s, values[i], jaFn)).join(", ")}`);
  }
  if (entry.negativeStat) lines.push(`Negative: ${formatRivenStat(entry.negativeStat, entry.negativeValue, jaFn)}`);
  lines.push(`${t().rivenState}: ${entry.fixed ? t().rollFixed : t().needsReroll}`);
  if (entry.note) lines.push("", "Note:", entry.note);
  return lines.join("\n");
}

export interface KuvaEntry {
  weaponName: string;
  kind?: string;
  owned: boolean;
  bonusStat?: string;
  bonusValue?: number;
  note?: string;
}

export function buildKuvaExportText(entry: KuvaEntry): string {
  const lines = [`${entry.weaponName} (${entry.kind || "Kuva"})`];
  lines.push(`${t().ownedLabel}: ${entry.owned ? t().yes : t().noOwned}`);
  if (entry.bonusStat) lines.push(`${t().bonusStat}: ${formatRivenStat(entry.bonusStat, entry.bonusValue)}`);
  if (entry.note) lines.push("", "Note:", entry.note);
  return lines.join("\n");
}

export interface FrameEntry {
  name: string;
  owned: boolean;
  rankedThirty: boolean;
  helminthFed: boolean;
  note?: string;
}

/** Collections.FrameEntry — distinct from Loadouts.Item's buildItemExportText. */
export function buildFrameEntryExportText(entry: FrameEntry): string {
  const lines = [`${entry.name} (Frame)`];
  lines.push(`${t().acquiredLabel}: ${entry.owned ? t().yes : t().noAcquired}`);
  lines.push(`${t().rank30}: ${entry.rankedThirty ? t().shortYes : t().shortNo}`);
  lines.push(`${t().helminth}: ${entry.helminthFed ? t().shortYes : t().shortNo}`);
  if (entry.note) lines.push("", "Note:", entry.note);
  return lines.join("\n");
}

export interface EquipEntry {
  name: string;
  owned: boolean;
  rankedThirty: boolean;
  note?: string;
}

/** Shared shape for WeaponEntry/CompanionEntry/ArchwingEntry/NecramechEntry (no helminthFed). label is the caller-supplied category name. */
export function buildEquipExportText(label: string, entry: EquipEntry): string {
  const lines = [`${entry.name} (${label})`];
  lines.push(`${t().acquiredLabel}: ${entry.owned ? t().yes : t().noAcquired}`);
  lines.push(`${t().rank30}: ${entry.rankedThirty ? t().shortYes : t().shortNo}`);
  if (entry.note) lines.push("", "Note:", entry.note);
  return lines.join("\n");
}

export interface IncarnonEntry {
  weaponName: string;
  obtained: boolean;
  completed: boolean;
  note?: string;
}

export function buildIncarnonExportText(entry: IncarnonEntry): string {
  const lines = [`${entry.weaponName} (Incarnon)`];
  lines.push(`${t().obtainedLabel}: ${entry.obtained ? t().yes : t().noObtained}`);
  lines.push(`${t().incarnon}: ${entry.completed ? t().shortYes : t().shortNo}`);
  if (entry.note) lines.push("", "Note:", entry.note);
  return lines.join("\n");
}

// Meant to be called directly from a button click handler (no intervening
// await): navigator.clipboard.writeText needs the click's transient user
// activation, which an async gap before the call could let expire.
export function copyTextToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

/** Wires success/failure feedback (success: briefly adds .copied; failure: .danger + a temporary title) onto every copy button matching selector under root. */
export function wireCopyButtons(root: ParentNode, selector: string, textFn: (btn: HTMLElement) => string): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent bubbling into a card's own click-to-open-modal handler (Riven etc.)
      const originalTitle = btn.title;
      copyTextToClipboard(textFn(btn))
        .then(() => {
          btn.classList.add("copied");
          setTimeout(() => btn.classList.remove("copied"), 1200);
        })
        .catch((err) => {
          console.warn(t().copyFailedLog, err);
          btn.classList.add("danger");
          btn.title = t().copyFailedTitle;
          setTimeout(() => {
            btn.classList.remove("danger");
            btn.title = originalTitle;
          }, 2000);
        });
    });
  });
}
