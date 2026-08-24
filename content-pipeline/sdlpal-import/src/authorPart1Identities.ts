// CLI: node src/authorPart1Identities.ts [path-to-SSS.MKF] [output-path]
//
// This step is DIFFERENT in kind from everything before it in this
// pipeline: buildPart1Pack.ts was faithful extraction (only what sdlpal's
// data actually says); this script is original authorship layered on top,
// explicitly requested and explicitly not required to be rigorous ("你看着
//编，大体合理就行，供后续实验性项目使用，不是商品"). Deliberately does NOT
// reuse the original game's actual protagonist names (李逍遥/赵灵儿/etc) for
// any character here, per docs/VISION-first-experience-instance-v1.0.md §3
// — named characters in this world are original, even when the place/roster
// position they occupy is sourced from the original game.
//
// Classification heuristic: an event object with state=normal (1) and a
// touch/search trigger mode (1-6) is treated as "person-like" (something a
// player would interact with) and gets a name + one-line archetype;
// anything else (blockers, no-trigger objects) is "prop-like" and gets a
// generic place-appropriate label only, no personal identity. This is a
// heuristic, not a verified fact about what the original sprite actually
// depicted — noted here so nobody mistakes the split for extracted data.

import type { PackRecord } from "../../pack-format/src/parser.ts";
import { serializePack } from "../../pack-format/src/serializer.ts";
import { resolvePart1Scope } from "./part1Scope.ts";
import type { EventObject } from "./eventObjects.ts";

const sssPath = process.argv[2] ?? "game-data/SSS.MKF";
const outPath = process.argv[3] ?? "output/part1-authored.pack";

type Role = "residence" | "shop" | "temple" | "village" | "island" | "palace";

const PLACE_ROLE: Record<string, Role> = {
  "inn-room": "residence", "aunt-room": "residence", "inn": "shop",
  "house-1": "residence", "house-2": "residence",
  "market": "shop", "pharmacy": "shop", "blacksmith": "shop", "carpenter": "shop",
  "temple-outside": "temple", "temple-inside": "temple",
  "village": "village",
  "spirit-pool": "island", "lotus-pool": "island", "island-dock": "island",
  "palace-outside": "palace", "palace": "palace",
};

const NAME_POOLS: Record<Role, string[]> = {
  residence: ["陈阿婆", "林伯", "阿福", "小满", "周氏", "王老实", "阿桂", "张家小子", "李婶", "赵老栓"],
  shop: ["柳掌柜", "阿贵", "秦师傅", "小顺子", "钱氏", "孙学徒", "何大娘", "郑三", "吴伙计", "冯掌柜"],
  temple: ["了尘和尚", "阿福伯", "瘸腿乞儿", "老庙祝", "痴丐", "求签妇人"],
  village: ["渔家汉子", "村口老者", "浣纱女", "牧童", "货郎", "打鱼阿三", "村妇刘氏", "看门老丈", "挑水阿牛", "算命先生"],
  island: ["守岛老翁", "采莲女", "垂钓客", "岛上樵夫", "灵池守者"],
  palace: ["宫娥小环", "白衣侍女", "执灯童子", "守殿侍卫", "抚琴女子"],
};

const ARCHETYPE_LINES: Record<Role, string[]> = {
  residence: ["守着这一方小院，日子过得清淡", "邻里都熟络，爱唠家常", "手脚勤快，屋里屋外收拾得干净"],
  shop: ["做这行当已有些年头，眼里揉不得沙子", "嘴上会说，心里有一本账", "手艺尚可，就是话多"],
  temple: ["常年在庙里进出，见惯了香客百态", "嘴里念念有词，眼神却精明", "破衣烂衫，眼神却不卑不亢"],
  village: ["祖辈都在这村里讨生活", "嗓门大，消息也灵通", "闲不住，见人就要搭句话"],
  island: ["常年在岛上，话不多，眼神却不糊涂", "对这片水域熟得很，什么都瞒不过他"],
  palace: ["规矩守得极严，轻易不多言", "眼观六路，行事却极稳当"],
};

const PROP_POOLS: Record<Role, string[]> = {
  residence: ["木桌", "床榻", "衣柜", "灯台", "水缸", "竹椅", "针线筐"],
  shop: ["货架", "算盘台", "药材柜", "打铁炉", "木工案", "招牌", "钱箱"],
  temple: ["供桌", "香炉", "神像基座", "功德箱", "蒲团"],
  village: ["水井", "石磨", "晒谷架", "篱笆", "石阶", "渔网"],
  island: ["石灯", "系船桩", "石阶", "残碑", "老树"],
  palace: ["宫灯", "屏风", "香案", "石阶", "帘幕"],
};

function pick<T>(pool: readonly T[], index: number): T {
  return pool[index % pool.length]!;
}

function suffix(index: number, poolLength: number): string {
  const cycle = Math.floor(index / poolLength);
  return cycle === 0 ? "" : `（${cycle + 1}）`;
}

function isPersonLike(obj: EventObject): boolean {
  return obj.state === 1 && obj.triggerMode >= 1 && obj.triggerMode <= 6;
}

const { locations, eventObjects } = resolvePart1Scope(sssPath);
const byMapNum = new Map(locations.map((loc) => [loc.mapNum, loc]));

const PLACE_ID: Record<number, string> = {
  1: "inn-room", 2: "aunt-room", 3: "inn", 4: "village", 5: "market",
  7: "temple-outside", 8: "house-1", 9: "house-2", 10: "pharmacy", 11: "temple-inside",
  12: "blacksmith", 13: "carpenter", 14: "spirit-pool", 15: "island-dock",
  18: "lotus-pool", 19: "palace-outside", 20: "palace",
};

const ADJACENCY: Array<[string, string]> = [
  ["village", "inn"], ["inn", "inn-room"], ["inn", "aunt-room"],
  ["village", "market"], ["village", "house-1"], ["village", "house-2"],
  ["village", "pharmacy"], ["village", "blacksmith"], ["village", "carpenter"],
  ["village", "temple-outside"], ["temple-outside", "temple-inside"],
  ["village", "island-dock"],
  ["island-dock", "spirit-pool"], ["island-dock", "lotus-pool"], ["island-dock", "palace-outside"],
  ["palace-outside", "palace"],
];

const records: PackRecord[] = [];
let personCount = 0;
let propCount = 0;

for (const [mapNumStr, placeId] of Object.entries(PLACE_ID)) {
  const mapNum = Number(mapNumStr);
  const loc = byMapNum.get(mapNum);
  if (!loc) continue;
  const role = PLACE_ROLE[placeId]!;
  const adjacent = ADJACENCY.filter(([a, b]) => a === placeId || b === placeId).map(([a, b]) => (a === placeId ? b : a));
  records.push({ recordType: "place", startLine: 0, fields: { id: [placeId], zh: [loc.name], adjacent } });

  const objects = eventObjects.slice(loc.eventObjectRange.start, loc.eventObjectRange.end).filter((o) => o.state !== 0);
  let personIndex = 0;
  let propIndex = 0;
  for (const obj of objects) {
    const fields: Record<string, string[]> = {
      id: [`${placeId}-obj-${obj.index}`],
      place: [placeId],
      attrs: [`sprite=${obj.spriteNum} trigger_mode=${obj.triggerMode} state=${obj.state}`],
    };
    let narrative: string | undefined;
    if (isPersonLike(obj)) {
      fields.type = ["person"];
      fields.zh = [`${pick(NAME_POOLS[role], personIndex)}${suffix(personIndex, NAME_POOLS[role].length)}`];
      narrative = pick(ARCHETYPE_LINES[role], personIndex);
      personIndex += 1;
      personCount += 1;
    } else {
      fields.type = ["prop"];
      fields.zh = [`${pick(PROP_POOLS[role], propIndex)}${suffix(propIndex, PROP_POOLS[role].length)}`];
      propIndex += 1;
      propCount += 1;
    }
    records.push({ recordType: "entity", startLine: 0, fields, ...(narrative ? { narrative } : {}) });
  }
}

const text = serializePack(records);
const { mkdir, writeFile } = await import("node:fs/promises");
const { dirname } = await import("node:path");
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, text, "utf8");

console.log(`wrote ${outPath}: ${records.filter((r) => r.recordType === "place").length} places, ${personCount} named persons, ${propCount} props`);
