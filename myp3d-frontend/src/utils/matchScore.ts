const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

export function splitWords(value: string): string[] {
  return value.toLocaleLowerCase().split(WORD_SPLIT).filter(Boolean);
}

function matchRank(word: string, field: string): number | null {
  if (!field) return null;
  if (field === word) return 0;
  if (field.startsWith(word)) return 1;
  if (splitWords(field).some((part) => part.startsWith(word))) return 2;
  if (field.includes(word)) return 3;
  return null;
}

export function matchScore(query: string, fields: string[], maxRank = 3): number | null {
  const words = splitWords(query);
  if (words.length === 0) return null;

  const normalizedFields = fields.map((field) => field.toLocaleLowerCase());
  const weight = normalizedFields.length;
  let total = 0;

  for (const word of words) {
    let best: number | null = null;
    for (let index = 0; index < weight; index += 1) {
      const rank = matchRank(word, normalizedFields[index]);
      if (rank === null || rank > maxRank) continue;
      const value = rank * weight + index;
      if (best === null || value < best) best = value;
    }
    if (best === null) return null;
    total += best;
  }

  return total;
}
