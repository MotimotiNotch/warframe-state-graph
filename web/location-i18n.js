// WFCDのDrop.Location表記（例: "Deimos/Nex (Exterminate)"）に含まれる惑星名・ミッション
// タイプ名の日本語対応表。wikiwiki.jp/warframe「星系」「ミッション」ページで確認済みの
// 用語のみ収録する方針はITEM_JA（web/item-i18n.js）・QUEST_JA（web/quest-i18n.js）と同じ
// ——未確認の訳を確定情報として書かない。ノード名（Fenton's Field等）・レベル帯・
// Rotation表記・ボス名・クエスト達成条件等は翻訳対象外（種類が多く個別確認が必要なため
// locationJa()は該当トークンだけを置換し、それ以外は原文のまま残す）。
//
// 実在の天体は漢字（水星/金星/地球等）、衛星・小惑星等はカタカナ音写（フォボス/エウロパ等）
// が公式訳の傾向（2026-08-25確認）。Zariman/Höllvaniaはwikiwiki.jp本文でも英語表記のまま
// だったため未収録。
const PLANET_JA = {
  "Mercury": "水星",
  "Venus": "金星",
  "Earth": "地球",
  "Mars": "火星",
  "Phobos": "フォボス",
  "Deimos": "ダイモス",
  "Ceres": "ケレス",
  "Jupiter": "木星",
  "Europa": "エウロパ",
  "Saturn": "土星",
  "Uranus": "天王星",
  "Neptune": "海王星",
  "Pluto": "冥王星",
  "Sedna": "セドナ",
  "Eris": "エリス",
  "Void": "VOID",
  "Lua": "ルア",
  "Kuva Fortress": "クバ要塞",
  "Duviri": "デュヴィリ",
};

// ミッションタイプ名（WFCDの location 末尾 "(...)" 括弧内トークン）の対応表。
// wikiwiki.jp/warframe「ミッション」ページで確認済みの主要タイプのみ収録。
const MISSION_JA = {
  "Exterminate": "掃滅",
  "Capture": "確保",
  "Rescue": "救出",
  "Spy": "潜入",
  "Mobile Defense": "機動防衛",
  "Sabotage": "妨害",
  "Hijack": "ハイジャック",
  "Assassination": "抹殺",
  "Survival": "耐久",
  "Defection": "脱出",
  "Excavation": "発掘",
  "Disruption": "分裂",
  "Defense": "防衛",
  "Interception": "傍受",
};

// 先頭の「Planet/」だけを日本語惑星名に置換する（他ページのplanetJa的な役割は無かったため
// 新設）。マッチしない場合は原文のまま返す。
function planetJa(location) {
  const m = location.match(/^([A-Za-z' ]+)\//);
  if (!m) return location;
  const ja = PLANET_JA[m[1]];
  return ja ? ja + location.slice(m[1].length) : location;
}

// 括弧内のミッションタイプ名だけを日本語に置換する（完全一致のみ、部分一致で誤爆しないよう
// 括弧の中身がMISSION_JAのキーと厳密に一致する場合のみ置換）。
function missionJa(location) {
  return location.replace(/\(([^()]+)\)/, (whole, inner) => {
    const ja = MISSION_JA[inner];
    return ja ? `(${ja})` : whole;
  });
}

// WFCDのDrop.Location文字列に含まれる、確認済みの惑星名・ミッションタイプ名だけを日本語化
// する。ノード名・Rotation表記・レベル帯・ボス名等は未確認のため原文のまま残る
// （「Pluto/Fenton's Field (Skirmish), Rotation A」→「冥王星/Fenton's Field (Skirmish), Rotation A」
// のように部分置換になるのは意図通り）。
function locationJa(location) {
  return missionJa(planetJa(location));
}
