export const OBJECT_OPERATION_KINDS = ["take", "put_inside", "open", "close", "observe"] as const;
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
  if (/(放进|放入|装进|put .* (?:in|into))/iu.test(text)) operation = "put_inside";
  else if (/(拿起|拿到|取出|拿出|pick up|take|remove)/iu.test(text)) operation = "take";
  else if (/(打开|open)/iu.test(text)) operation = "open";
  else if (/(关上|关闭|close|shut)/iu.test(text)) operation = "close";
  else if (/(找|查看|看看|观察|find|look|inspect|observe)/iu.test(text)) operation = "observe";
  return operation ? { operation, rawTtd: text, inputLanguage } : null;
}
