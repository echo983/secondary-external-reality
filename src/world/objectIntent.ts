export const OBJECT_OPERATION_KINDS = ["take", "place", "put_inside", "open", "close", "observe", "open_and_observe", "write_and_hide", "read"] as const;
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
  if (/(纸条|note|paper)/iu.test(text) && /(枕头|pillow)/iu.test(text) && /[0-9]{1,64}/u.test(text) && /(写|write)/iu.test(text)) operation = "write_and_hide";
  else if (/(纸条|note|paper)/iu.test(text) && /(读|read)/iu.test(text)) operation = "read";
  else if (/(枕头|pillow)/iu.test(text) && /(找|查看|看看|翻|检查|读|find|look|check|read)/iu.test(text)) operation = "read";
  else if (/(打开|open)/iu.test(text) && /(找|查看|看看|观察|find|look|inspect|observe)/iu.test(text)) operation = "open_and_observe";
  else if (/(放进|放入|装进|put .* (?:in|into))/iu.test(text)) operation = "put_inside";
  else if (/(放到|放在|搁在|put .* on|place .* on)/iu.test(text)) operation = "place";
  else if (/(拿起|拿到|取出|拿出|pick up|take|remove)/iu.test(text)) operation = "take";
  else if (/(打开|open)/iu.test(text)) operation = "open";
  else if (/(关上|关闭|close|shut)/iu.test(text)) operation = "close";
  else if (/(找|查看|看看|观察|find|look|inspect|observe)/iu.test(text)) operation = "observe";
  return operation ? { operation, rawTtd: text, inputLanguage } : null;
}
