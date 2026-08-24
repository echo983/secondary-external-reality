// Map-number -> location-name reference for the game's opening chapter
// ("Part1 灵岛求仙" — the starting village + Immortal Spirit Island, before
// the player boards a ship for the wider world). Sourced from a fan-made
// map atlas (sdlpal.github.io/wszw/map.htm, raw HTML table of
// `<a href="Map\mapNNN.jpg">名称</a>` entries), cross-checked against this
// project's own SSS.MKF Scene-table extraction: the atlas's map numbers for
// this chapter (1, 10, 12, ...) match the wMapNum values our own extraction
// finds in the game's earliest scenes, confirming the two numbering schemes
// are the same. Not exhaustive outside this chapter — do not reuse this
// table for later chapters without re-verifying against a fresh source.
//
// Correction: earlier discussion in this project assumed the starting
// village was named 余杭镇 — the actual DOS-version data names it 盛渔村.

export const PART1_MAP_NAMES: Readonly<Record<number, string>> = {
  1: "逍遥客栈房间",
  2: "逍遥客栈婶婶房间",
  3: "逍遥客栈",
  4: "盛渔村",
  5: "盛渔村市场",
  7: "山神庙",
  8: "盛渔村民房1",
  9: "盛渔村民房2",
  10: "洪大夫药铺",
  11: "山神庙内",
  12: "盛渔村铁匠铺",
  13: "盛渔村木匠铺",
  14: "灵池",
  15: "仙灵岛码头",
  17: "莲花池",
  18: "莲花池（破阵）",
  19: "水月宫外",
  20: "水月宫",
};
