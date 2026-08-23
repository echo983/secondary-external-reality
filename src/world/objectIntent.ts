export const OBJECT_OPERATION_KINDS = ["take", "place", "put_inside", "open", "close", "observe", "open_and_observe", "write_and_hide", "read", "look_around", "inspect_contents", "locate", "inventory"] as const;
export type ObjectOperationKind = (typeof OBJECT_OPERATION_KINDS)[number];

export interface ObjectIntent {
  operation: ObjectOperationKind;
  rawTtd: string;
  inputLanguage: "zh" | "en";
}

export function parseObjectIntent(rawTtd: string): ObjectIntent | null {
  const text = rawTtd.trim();
  const inputLanguage = /[\u3400-\u9fff]/u.test(text) ? "zh" : "en";
  let operation: ObjectOperationKind | null = null;
  if (/^(?:look|看看周围|看看房间|看能看到什么|我能看到什么|环顾四周)$/iu.test(text)) operation = "look_around";
  else if (/^(?:inventory|我手里有什么|手里有什么|我拿着什么)$/iu.test(text)) operation = "inventory";
  else if (/(里面有什么|里有什么|contents|what(?:'s| is) inside)/iu.test(text)) operation = "inspect_contents";
  else if (/(在哪里|在哪儿|where is|where's)/iu.test(text)) operation = "locate";
  else if (/(纸条|note|paper)/iu.test(text) && /(枕头|pillow)/iu.test(text) && /[0-9]{1,64}/u.test(text) && /(写|write)/iu.test(text)) operation = "write_and_hide";
  else if (/(纸条|note|paper)/iu.test(text) && /(读|read)/iu.test(text)) operation = "read";
  else if (/(枕头|pillow)/iu.test(text) && /(找|查看|看看|翻|检查|读|find|look|check|read)/iu.test(text)) operation = "read";
  else if (/(打开|开门|open)/iu.test(text) && /(找|查看|看看|观察|find|look|inspect|observe)/iu.test(text)) operation = "open_and_observe";
  else if (/(放进|放入|装进|put .* (?:in|into))/iu.test(text)) operation = "put_inside";
  else if (/(放到|放在|搁在|put .* on|place .* on)/iu.test(text)) operation = "place";
  else if (/(拿起|拿到|取出|拿出|pick up|take|remove)/iu.test(text)) operation = "take";
  else if (/(打开|开门|open)/iu.test(text)) operation = "open";
  else if (/(关上|关闭|close|shut)/iu.test(text)) operation = "close";
  else if (/(找|查看|看看|观察|find|look|inspect|observe)/iu.test(text)) operation = "observe";
  return operation ? { operation, rawTtd: text, inputLanguage } : null;
}

export function splitActionSequence(rawTtd: string): string[] {
  return rawTtd
    .split(/\s*(?:[，,；;。]+|然后|接着|随后|再(?=去|把|拿|打开|关|找|看)|\b(?:and then|then)\b)\s*/iu)
    .map((part) => part.trim())
    .filter(Boolean);
}
