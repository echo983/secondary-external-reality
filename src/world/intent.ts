export const ACTION_KINDS = ["stand", "move", "reach", "take", "open", "speak", "observe", "recall"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface IntendedAction {
  actionId: string;
  kind: ActionKind;
  targetId: string | null;
}

export interface NormalizedIntent {
  actorId: "self";
  inputLanguage: "zh" | "en" | "unknown";
  rawTtd: string;
  actions: IntendedAction[];
}

export function parseMvpIntent(rawTtd: string): NormalizedIntent {
  const text = rawTtd.trim();
  const chinese = /[\u3400-\u9fff]/u.test(text);
  const actions: IntendedAction[] = [];
  const add = (kind: ActionKind, targetId: string | null): void => {
    actions.push({ actionId: `a${actions.length + 1}`, kind, targetId });
  };

  if (/(下床|站起|起来)/u.test(text) || /\b(stand|get up)\b/iu.test(text)) add("stand", null);
  if (/(走|到.*门|去.*门)/u.test(text) || /\b(walk|move|go)\b/iu.test(text)) add("move", "door-1");
  if (/(开门|打开.*门)/u.test(text) || /\bopen (the )?door\b/iu.test(text)) add("open", "door-1");
  if (/(看|观察)/u.test(text) || /\b(look|observe)\b/iu.test(text)) add("observe", null);

  return {
    actorId: "self",
    inputLanguage: chinese ? "zh" : /[a-z]/iu.test(text) ? "en" : "unknown",
    rawTtd: text,
    actions,
  };
}
