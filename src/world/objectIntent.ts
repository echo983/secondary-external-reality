export const OBJECT_OPERATION_KINDS = ["take", "place", "put_inside", "open", "close", "observe", "open_and_observe", "open_and_inspect", "write", "write_and_hide", "read", "look_around", "inspect_contents", "locate", "inventory", "inspect_inscription_presence", "inspect_inscription_value", "recall_inscription", "self_position", "self_posture", "self_bed_status", "move"] as const;
export type ObjectOperationKind = (typeof OBJECT_OPERATION_KINDS)[number];

export interface ObjectIntent {
  operation: ObjectOperationKind;
  rawTtd: string;
  inputLanguage: "zh" | "en";
  content?: string;
  placementRelation?: "inside" | "on";
}

export function parseObjectIntent(rawTtd: string): ObjectIntent | null {
  const text = rawTtd.trim();
  const inputLanguage = /[\u3400-\u9fff]/u.test(text) ? "zh" : "en";
  let operation: ObjectOperationKind | null = null;
  if (/^(?:我在哪里|我在哪儿|where am i)$/iu.test(text)) operation = "self_position";
  else if (/^(?:我是什么姿势|我现在是什么姿势|我的姿势|what is my posture)$/iu.test(text)) operation = "self_posture";
  else if (/^(?:我在床上吗|我还在床上吗|am i (?:on|in) the bed)$/iu.test(text)) operation = "self_bed_status";
  else if (/(走到|走过去|走回|移动到|挪到|move to|walk to|go to)/iu.test(text)) operation = "move";
  else if (/(纸条|便签|note|paper)/iu.test(text) && /(记得|记不得|记不清|还记得|回忆|remember|recall)/iu.test(text)) operation = "recall_inscription";
  else if (/(纸条|便签|note|paper)/iu.test(text) && /(有字|写字了吗|写没写|有没有.{0,6}(?:字|内容|东西)|any (?:text|writing)|written on)/iu.test(text)) operation = "inspect_inscription_presence";
  else if (/(纸条|便签|note|paper)/iu.test(text) && /(写着什么|写了什么|what.*(?:written|say)|read on)/iu.test(text)) operation = "inspect_inscription_value";
  else if (/^(?:look|看看周围|看看房间|看能看到什么|我能看到什么|我看看周围有什么|环顾|环顾四周)$/iu.test(text) || /(?:瞅瞅|看看|看一看).{0,8}(?:屋里|房间|周围).{0,8}(?:有啥|有什么)/u.test(text)) operation = "look_around";
  else if (/^(?:inventory|我手里有什么|手里有什么|我拿着什么)$/iu.test(text) || /(?:手里|手上).{0,8}(?:拿着|拿了|有).{0,5}(?:什么|啥)/u.test(text)) operation = "inventory";
  else if (/(里面有什么|里有什么|contents|what(?:'s| is) inside)/iu.test(text)) operation = "inspect_contents";
  else if (/(在哪里|在哪儿|where is|where's|where.{0,16}(?:leave|left|put))/iu.test(text)) operation = "locate";
  else if (/(纸条|便签|note|paper)/iu.test(text) && /(枕头|pillow)/iu.test(text) && /[0-9]{1,64}/u.test(text) && /(写|write)/iu.test(text)) operation = "write_and_hide";
  else if (/(纸条|便签|note|paper)/iu.test(text) && /(读|read)/iu.test(text)) operation = "read";
  else if (/(枕头|pillow)/iu.test(text) && /(找|查看|看看|翻|检查|读|find|look|check|read)/iu.test(text)) operation = "read";
  else if (/(打开|开门|open)/iu.test(text) && /(里面|里头|抽屉|drawer|container)/iu.test(text) && /(查看|看看|观察|look|inspect|observe)/iu.test(text) && !/(钥匙|纸条|便签|笔|key|note|paper|pen)/iu.test(text)) operation = "open_and_inspect";
  else if (/(打开|开门|open)/iu.test(text) && /(找|查看|看看|观察|find|look|inspect|observe)/iu.test(text)) operation = "open_and_observe";
  else if (/(放进|放入|装进|put .* (?:in|into))/iu.test(text)) operation = "put_inside";
  else if (/(放到|放在|搁在|put .* on|place .* on)/iu.test(text)) operation = "place";
  else if (/(拿起|拿到|取出|拿出|pick up|take|remove)/iu.test(text)) operation = "take";
  else if (/(打开|开门|open)/iu.test(text)) operation = "open";
  else if (/(关上|关闭|close|shut)/iu.test(text)) operation = "close";
  else if (/(找|看|查看|看看|观察|find|look|inspect|observe)/iu.test(text)) operation = "observe";
  return operation ? { operation, rawTtd: text, inputLanguage } : null;
}

export function splitActionSequence(rawTtd: string): string[] {
  return rawTtd
    .split(/\s*(?:[，,；;。]+|然后|接着|随后|再(?=去|把|拿|打开|关|找|看)|\b(?:and then|then)\b)\s*/iu)
    .map((part) => part.trim())
    .filter(Boolean);
}
