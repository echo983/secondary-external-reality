export interface SimScenarioTurn {
  id: string;
  input: string;
  probeGroup?: string | undefined;
}

// Deterministic PRNG (mulberry32) so a given seed always reproduces the same corpus.
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index] as T;
}

const PORTABLE_ZH = ["钥匙", "笔", "纸条"] as const;
const PORTABLE_EN: Record<string, string> = { 钥匙: "key", 笔: "pen", 纸条: "note" };
const SURFACES_ZH = ["桌子", "床头柜", "床"] as const;
const CONTAINER_ZH = "抽屉";
const COLLOQUIAL_PREFIX = ["我寻思", "那个", "劳驾", "哎", "话说", "顺便问一下", "", "", ""] as const;
const CASUAL_SUFFIX = ["呢", "呀", "啊", "到底怎么样", "", "", ""] as const;

function lookAround(rng: () => number): { input: string }[] {
  const options = ["我随便看看这屋里", "环顾一下四周", "look around the room", "这屋里都有点啥", "四处瞅瞅"];
  return [{ input: `${pick(rng, options)}${pick(rng, CASUAL_SUFFIX)}` }];
}

function inventory(rng: () => number): { input: string }[] {
  const options = ["我手上现在拿着啥呢", "查一下我手里都有什么", "what am I holding right now", "我兜里揣着什么东西"];
  return [{ input: pick(rng, options) }];
}

function locateProbe(rng: () => number): { input: string; probeGroup: string }[] {
  const item = pick(rng, PORTABLE_ZH);
  const probeGroup = `locate-${item}-${Math.floor(rng() * 1e6)}`;
  const zhPhrasing = [`${item}在哪`, `${item}放哪儿了`, `${item}到底在什么地方`, `${pick(rng, COLLOQUIAL_PREFIX)}${item}去哪了`];
  const enPhrasing = [`where is the ${PORTABLE_EN[item]}`, `where did I leave the ${PORTABLE_EN[item]} exactly?`];
  return [
    { input: pick(rng, zhPhrasing), probeGroup },
    { input: pick(rng, enPhrasing), probeGroup },
  ];
}

function openContainer(rng: () => number): { input: string }[] {
  const options = [`把${CONTAINER_ZH}打开`, `打开${CONTAINER_ZH}看看`, `open the drawer`, `劳驾把${CONTAINER_ZH}打开`];
  return [{ input: pick(rng, options) }];
}

function closeContainer(rng: () => number): { input: string }[] {
  const options = [`把${CONTAINER_ZH}关上`, `close the drawer`];
  return [{ input: pick(rng, options) }];
}

function containerContents(rng: () => number): { input: string }[] {
  const options = [`${CONTAINER_ZH}里有什么`, `看看${CONTAINER_ZH}里面`, `所以${CONTAINER_ZH}里面究竟有什么东西`, `what's inside the drawer`];
  return [{ input: pick(rng, options) }];
}

function takeItem(rng: () => number): { input: string }[] {
  const item = pick(rng, PORTABLE_ZH);
  const options = [`把${item}拿起来`, `顺手拿起${item}`, `pick up the ${PORTABLE_EN[item]}`, `${pick(rng, COLLOQUIAL_PREFIX)}把${item}拿起来吧`];
  return [{ input: pick(rng, options) }];
}

function placeItem(rng: () => number): { input: string }[] {
  const item = pick(rng, PORTABLE_ZH);
  const target = pick(rng, SURFACES_ZH);
  const options = [`把${item}放到${target}上`, `把${item}放到${target}`, `顺手把${item}放在${target}上`];
  return [{ input: pick(rng, options) }];
}

function writeNote(rng: () => number): { input: string }[] {
  const digits = String(Math.floor(rng() * 90) + 10);
  const options = [`在纸条上写${digits}`, `write ${digits} on the note`, `把${digits}这个数字写在纸条上`];
  return [{ input: pick(rng, options) }];
}

function readNote(rng: () => number): { input: string }[] {
  const options = ["纸条上写的是什么", "读一下纸条", "what does the note say", "纸纸条上到底写没写东西"];
  return [{ input: pick(rng, options) }];
}

function capabilityQuery(rng: () => number): { input: string }[] {
  const options = ["你能做什么", "what can you do here", "有哪些指令", "我现在能干点啥"];
  return [{ input: pick(rng, options) }];
}

function fragment(rng: () => number): { input: string }[] {
  return [{ input: pick(rng, ["把", "那个...", "呃", "嗯"]) }];
}

// "走到门口"/"走到床边"/"走到走廊" are now real, supported move targets (see
// moveToLandmark/hallwayExploration); this keeps only destinations beyond the
// hallway, which are still genuinely unmodeled (design doc §3.4).
function unsupportedMove(rng: () => number): { input: string }[] {
  return [{ input: pick(rng, ["走出这个房间", "走到客厅", "go to the living room"]) }];
}

// "门外" now resolves to the real hallway-1 entity; whether this commits or
// stays a boundary depends on door state at the time (untouched by this
// template — it's just a probe phrase, not a scripted scenario), which is
// exactly what the invariant checker is for.
function hallwayQuery(rng: () => number): { input: string }[] {
  return [{ input: pick(rng, ["看看门外", "门外有什么", "what's outside the door"]) }];
}

// Exercises the actual Free-projection resolution end to end: open the door,
// walk through, and look around — hallway-1.notable_feature should resolve
// and commit on the third turn.
function hallwayExploration(_rng: () => number): { input: string }[] {
  return [{ input: "打开门" }, { input: "走到走廊" }, { input: "环顾四周" }];
}

function negation(rng: () => number): { input: string }[] {
  return [{ input: pick(rng, ["我没有打开抽屉", "我不想拿钥匙"]) }];
}

function hypothetical(rng: () => number): { input: string }[] {
  return [{ input: pick(rng, ["如果我打开抽屉会怎样", "假如钥匙不在桌上呢"]) }];
}

function chainedThen(rng: () => number): { input: string }[] {
  const options = [`打开${CONTAINER_ZH}然后把钥匙放进去`, `拿起笔然后放到桌子上`, `把钥匙拿起来然后放到床头柜上`];
  return [{ input: pick(rng, options) }];
}

function greeting(rng: () => number): { input: string }[] {
  return [{ input: pick(rng, ["你好呀", "hello", "在吗"]) }];
}

function moveToLandmark(rng: () => number): { input: string }[] {
  const options = ["走到门口", "走到床边", "go to the door", "go to the bed", "移动到门口", "回到床边"];
  return [{ input: pick(rng, options) }];
}

function selfPositionQuery(rng: () => number): { input: string }[] {
  return [{ input: pick(rng, ["我在哪里", "我现在在哪", "where am I"]) }];
}

const SIMPLE_TEMPLATES: Array<(rng: () => number) => { input: string }[]> = [
  lookAround, inventory, openContainer, closeContainer, containerContents, takeItem, placeItem,
  writeNote, readNote, capabilityQuery, fragment, unsupportedMove, hallwayQuery, hallwayExploration, negation,
  hypothetical, chainedThen, greeting, moveToLandmark, selfPositionQuery,
];

export interface HumanSimCorpusOptions {
  seed: number;
  count: number;
  probeCount?: number;
}

export function generateHumanSimCorpus(options: HumanSimCorpusOptions): SimScenarioTurn[] {
  const rng = mulberry32(options.seed);
  const probeCount = options.probeCount ?? Math.max(2, Math.floor(options.count / 8));
  const turns: SimScenarioTurn[] = [];
  let index = 0;

  const emit = (entries: { input: string; probeGroup?: string }[]) => {
    for (const entry of entries) {
      index += 1;
      turns.push({ id: `sim-${index}`, input: entry.input, probeGroup: entry.probeGroup });
    }
  };

  emit(greeting(rng));
  emit(lookAround(rng));
  for (let probe = 0; probe < probeCount; probe += 1) emit(locateProbe(rng));
  while (turns.length < options.count) emit(pick(rng, SIMPLE_TEMPLATES)(rng));
  return turns.slice(0, options.count);
}
