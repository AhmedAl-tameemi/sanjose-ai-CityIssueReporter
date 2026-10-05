import type { LanguageCode } from '../i18n';

type SpokenDateResult = { value?: string; error?: 'invalid' | 'future' };

const dateLocales: Record<LanguageCode, string> = {
  en: 'en-US', ar: 'ar-SA', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', fil: 'fil-PH',
  hi: 'hi-IN', ja: 'ja-JP', ko: 'ko-KR', fa: 'en-US', 'pt-BR': 'pt-BR',
  ru: 'ru-RU', es: 'es-US', vi: 'vi-VN',
};

const digitZeroes = [
  0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6,
  0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x17e0, 0x1810, 0xff10,
];

const relativeDateWords: Record<LanguageCode, [string[], string[]]> = {
  en: [['today'], ['yesterday']], ar: [['اليوم'], ['أمس', 'امس', 'البارحة']],
  'zh-CN': [['今天'], ['昨天']], 'zh-TW': [['今天'], ['昨天']],
  fil: [['ngayon'], ['kahapon']], hi: [['आज'], ['बीता हुआ कल']],
  ja: [['今日', 'きょう'], ['昨日', 'きのう']], ko: [['오늘'], ['어제']],
  fa: [['امروز'], ['دیروز']], 'pt-BR': [['hoje'], ['ontem']],
  ru: [['сегодня'], ['вчера']], es: [['hoy'], ['ayer']], vi: [['hôm nay'], ['hôm qua']],
};

const cardinalWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const ordinalWords = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth',
  'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const tensWords = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function englishDateNumbers(value: string) {
  let text = value.toLowerCase().replaceAll('-', ' ');
  const wordValues = new Map([
    ...cardinalWords.map((word, number) => [word, number] as const),
    ...tensWords.map((word, index) => [word, 20 + index * 10] as const),
  ]);
  const wordPattern = [...wordValues.keys(), 'hundred', 'and'].join('|');
  const yearPattern = new RegExp(`\\b(two thousand|nineteen|twenty)((?:\\s+(?:${wordPattern}))*)[,\\.\\s]*$`);
  text = text.replace(yearPattern, (phrase, prefix: string, suffix: string) => {
    const words = suffix.trim().split(/\s+/);
    const remainder = words.reduce((sum, word) => sum + (wordValues.get(word) ?? 0), 0);
    if (prefix !== 'two thousand' && remainder < 10 && !words.includes('hundred')) return phrase;
    return String((prefix === 'two thousand' ? 2000 : prefix === 'nineteen' ? 1900 : 2000) + remainder);
  });
  const dayWords = new Map<string, number>();
  for (let day = 1; day <= 31; day += 1) {
    if (day < 20) {
      dayWords.set(cardinalWords[day], day);
      dayWords.set(ordinalWords[day], day);
    } else {
      const tens = day < 30 ? 'twenty' : 'thirty';
      const remainder = day % 10;
      dayWords.set(remainder ? `${tens} ${cardinalWords[remainder]}` : tens, day);
      dayWords.set(remainder ? `${tens} ${ordinalWords[remainder]}` : day === 20 ? 'twentieth' : 'thirtieth', day);
    }
  }
  const daysPattern = new RegExp(`\\b(${[...dayWords.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');
  return text.replace(daysPattern, (word) => String(dayWords.get(word)));
}

function latinizeDigits(value: string) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)!;
    const zero = digitZeroes.find((start) => codePoint >= start && codePoint < start + 10);
    return zero === undefined ? character : String(codePoint - zero);
  }).join('');
}

function normalizeDateText(value: string) {
  return latinizeDigits(value).toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function makeIsoDate(year: number, month: number, day: number, today: Date): SpokenDateResult {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return { error: 'invalid' };
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return { error: 'invalid' };
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const maximum = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return value > maximum ? { error: 'future' } : { value };
}

function localizedMonths(language: LanguageCode) {
  const formatter = new Intl.DateTimeFormat(dateLocales[language], { month: 'long', timeZone: 'UTC' });
  const withDay = new Intl.DateTimeFormat(dateLocales[language], { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const months: { month: number; names: string[] }[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const date = new Date(Date.UTC(2026, month - 1, 15));
    const names = new Set([
      formatter.formatToParts(date).find((part) => part.type === 'month')?.value ?? '',
      withDay.formatToParts(date).find((part) => part.type === 'month')?.value ?? '',
    ]);
    months.push({
      month,
      names: [...names].filter(Boolean).map((name) =>
        language === 'ja' && /^\d+$/.test(name) ? `${name}月` : name),
    });
  }
  return months;
}

function findNamedMonth(text: string, language: LanguageCode): number | undefined {
  const spoken = normalizeDateText(text);
  const compactSpeech = spoken.replaceAll(' ', '');
  const cjkLanguage = language === 'zh-CN' || language === 'zh-TW' || language === 'ja' || language === 'ko';
  const months = localizedMonths(language).flatMap(({ month, names }) =>
    names.map((name) => ({ month, normalized: normalizeDateText(name) })),
  ).sort((a, b) => b.normalized.length - a.normalized.length);
  return months.find(({ normalized }) =>
    (` ${spoken} `).includes(` ${normalized} `) ||
    (cjkLanguage && compactSpeech.includes(normalized.replaceAll(' ', ''))),
  )?.month;
}

function getNumericDate(transcript: string) {
  const text = latinizeDigits(transcript);
  const numbers = [...text.matchAll(/\d+/gu)].map((match) => Number(match[0]));
  return numbers;
}

export function parseSpokenDate(
  transcript: string,
  language: LanguageCode,
  today = new Date(),
): SpokenDateResult {
  const text = normalizeDateText(transcript);
  if (!text) return { error: 'invalid' };
  const [todayWords, yesterdayWords] = relativeDateWords[language];
  const isToday = todayWords.some((word) => normalizeDateText(word) === text);
  const isYesterday = yesterdayWords.some((word) => normalizeDateText(word) === text);
  if (isToday || isYesterday) {
    const date = new Date(today);
    if (isYesterday) date.setDate(date.getDate() - 1);
    return makeIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), today);
  }
  const dateTranscript = language === 'en' ? englishDateNumbers(transcript) : transcript;
  const numbers = getNumericDate(dateTranscript);
  const namedMonth = findNamedMonth(dateTranscript, language);

  if (namedMonth !== undefined) {
    const yearIndex = numbers.findIndex((number) => number >= 1000);
    const year = yearIndex >= 0 ? numbers[yearIndex] : today.getFullYear();
    const dateNumbers = numbers.filter((_, index) => index !== yearIndex);
    const dayCandidates = dateNumbers.length > 1
      ? dateNumbers.filter((number, index) => !(number === namedMonth && !dateNumbers.slice(0, index).some((item) => item === namedMonth)))
      : dateNumbers;
    if (dayCandidates.length !== 1) return { error: 'invalid' };
    return makeIsoDate(year, namedMonth, dayCandidates[0], today);
  }

  if (numbers.length === 3 && numbers[0] >= 1000) {
    return makeIsoDate(numbers[0], numbers[1], numbers[2], today);
  }

  let year = today.getFullYear();
  let parts = numbers;
  if (numbers.length === 3) {
    const explicitYearIndex = numbers.findIndex((number) => number >= 1000);
    if (explicitYearIndex >= 0) {
      year = numbers[explicitYearIndex];
      parts = numbers.filter((_, index) => index !== explicitYearIndex);
    } else if (numbers[2] >= 20 && numbers[2] < 100) {
      year = 2000 + numbers[2];
      parts = numbers.slice(0, 2);
    } else {
      return { error: 'invalid' };
    }
  } else if (numbers.length === 2) {
    // The city reports U.S. incidents: use month/day unless the first number can only be a day.
  } else {
    return { error: 'invalid' };
  }

  const [first, second] = parts;
  if (first > 12 && second <= 12) return makeIsoDate(year, second, first, today);
  return makeIsoDate(year, first, second, today);
}