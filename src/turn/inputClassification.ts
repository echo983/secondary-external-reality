export type InterfaceInputClass = "CONVERSATION" | "INCOMPLETE_FRAGMENT" | "UNSUPPORTED_WORLD_SCOPE" | "UNSUPPORTED_CAPABILITY" | "UNSUPPORTED_MODIFIER";

export function classifyInterfaceInput(rawTtd: string): InterfaceInputClass | null {
  const text = rawTtd.trim();
  if (/^(?:你好|您好|嗨)(?:呀|啊|哇|哦|喔|哈)?[！!。.]*$/u.test(text) || /^(?:hello|hi|hey)(?:\s+there)?[！!。.]*$/iu.test(text)) return "CONVERSATION";
  if (/(?:门外|房间外|outside (?:the )?(?:door|room))/iu.test(text)) return "UNSUPPORTED_WORLD_SCOPE";
  if (/(?:不要|别|禁止|不许|不(?:想|会|能|打开|关闭|拿|放|看|读|写)|假如|如果|要是|假装|想象|would|could|suppose|pretend|what if|if i|do not|don't|won't)/iu.test(text)) return "UNSUPPORTED_MODIFIER";
  if (/(?=.*(?:纸条|便签|note|paper))(?=.*(?:写|write))/iu.test(text) && !/(?:写着什么|写了什么|写没写|有没有.{0,6}(?:字|内容|东西)|有字|what.*written|any (?:text|writing))/iu.test(text) && !/[0-9]{1,64}/u.test(text)) return "UNSUPPORTED_CAPABILITY";
  if (/^(?:在|把|向|从|用)\s*.{0,3}$/u.test(text) || /(?:在|把|向|从|用|and|then)\s*$/iu.test(text)) return "INCOMPLETE_FRAGMENT";
  return null;
}

export function interfaceResponse(code: InterfaceInputClass, chinese: boolean): string {
  if (code === "CONVERSATION") return chinese ? "你好。这里是 ttd；请告诉我你想尝试做什么，或输入 help。" : "Hello. This is ttd; tell me what you want to try, or enter help.";
  if (code === "INCOMPLETE_FRAGMENT") return chinese ? "这句话像是还没说完；请把想尝试的事情补充完整。" : "That looks incomplete; please finish what you want to try.";
  if (code === "UNSUPPORTED_WORLD_SCOPE") return chinese ? "当前最小世界还没有门外空间，因此无法观察门外。" : "The current minimal world has no outside space to observe yet.";
  if (code === "UNSUPPORTED_MODIFIER") return chinese ? "当前世界不会把否定、假设或条件表达当作实际行动执行。" : "The current world does not execute negated, hypothetical, or conditional expressions as actual actions.";
  return chinese ? "当前书写能力只支持一到六十四位数字；任意文字写入尚未开放。" : "Writing currently supports only one to sixty-four digits; arbitrary text is not yet available.";
}
