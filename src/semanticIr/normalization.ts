export interface NormalizedSemanticInput { original: string; normalized: string; repairs: Array<{ from: string; to: string; index: number }> }

export function normalizeSemanticInput(input: string): NormalizedSemanticInput {
  const original = input.normalize("NFKC");
  const repairs: NormalizedSemanticInput["repairs"] = [];
  const normalized = original.replace(/([\u3400-\u9fff])\1(?=[\u3400-\u9fff])/gu, (match, character: string, offset: number) => {
    repairs.push({ from: match, to: character, index: offset });
    return character;
  });
  return { original: input, normalized, repairs };
}
