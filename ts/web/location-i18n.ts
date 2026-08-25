// Port of web/location-i18n.js. EN->JA lookup for the planet name and
// mission-type name embedded in WFCD's Drop.Location strings (e.g.
// "Deimos/Nex (Exterminate)"). Same "wiki-confirmed entries only" policy as
// item-i18n.ts/quest-i18n.ts — node names, level ranges, Rotation labels,
// boss names, and quest-completion conditions are out of scope, so
// locationJa() only substitutes the matched tokens and leaves the rest as-is.
const PLANET_JA: Record<string, string> = {
  Mercury: "水星",
  Venus: "金星",
  Earth: "地球",
  Mars: "火星",
  Phobos: "フォボス",
  Deimos: "ダイモス",
  Ceres: "ケレス",
  Jupiter: "木星",
  Europa: "エウロパ",
  Saturn: "土星",
  Uranus: "天王星",
  Neptune: "海王星",
  Pluto: "冥王星",
  Sedna: "セドナ",
  Eris: "エリス",
  Void: "VOID",
  Lua: "ルア",
  "Kuva Fortress": "クバ要塞",
  Duviri: "デュヴィリ",
};

// Mission type name (the "(...)" bracket token at the end of a WFCD
// location string). wiki-confirmed major types only.
const MISSION_JA: Record<string, string> = {
  Exterminate: "掃滅",
  Capture: "確保",
  Rescue: "救出",
  Spy: "潜入",
  "Mobile Defense": "機動防衛",
  Sabotage: "妨害",
  Hijack: "ハイジャック",
  Assassination: "抹殺",
  Survival: "耐久",
  Defection: "脱出",
  Excavation: "発掘",
  Disruption: "分裂",
  Defense: "防衛",
  Interception: "傍受",
};

/** Replaces only the leading "Planet/" segment with its Japanese name.
 * Returns the input unchanged if it doesn't match. */
export function planetJa(location: string): string {
  const m = location.match(/^([A-Za-z' ]+)\//);
  if (!m || !m[1]) return location;
  const ja = PLANET_JA[m[1]];
  return ja ? ja + location.slice(m[1].length) : location;
}

/** Replaces the bracketed mission-type token, exact match only (so a
 * partial match inside the parens never misfires). */
export function missionJa(location: string): string {
  return location.replace(/\(([^()]+)\)/, (whole, inner: string) => {
    const ja = MISSION_JA[inner];
    return ja ? `(${ja})` : whole;
  });
}

/** Japanese-izes only the wiki-confirmed planet name and mission-type name
 * inside a WFCD Drop.Location string; everything else (node names,
 * Rotation labels, level ranges, boss names) is left as-is — e.g.
 * "Pluto/Fenton's Field (Skirmish), Rotation A" becomes
 * "冥王星/Fenton's Field (Skirmish), Rotation A", a deliberately partial
 * substitution. */
export function locationJa(location: string): string {
  return missionJa(planetJa(location));
}
