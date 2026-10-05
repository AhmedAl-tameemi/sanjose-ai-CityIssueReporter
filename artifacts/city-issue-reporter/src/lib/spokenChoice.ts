export type SpokenOption<T extends string> = { value: T; labels: string[] };

function normalizeSpokenText(value: string) {
  return value.toLocaleLowerCase().normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function matchSpokenChoice<T extends string>(
  transcript: string,
  options: SpokenOption<T>[],
): T | undefined {
  const spoken = normalizeSpokenText(transcript);
  if (!spoken) return undefined;

  const matches = options.filter(({ labels }) =>
    labels.some((label) => {
      const normalized = normalizeSpokenText(label);
      return normalized.length >= 2 && (` ${spoken} `).includes(` ${normalized} `);
    }),
  );
  return matches.length === 1 ? matches[0].value : undefined;
}