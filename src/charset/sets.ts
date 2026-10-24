export type SetId = 'basic' | 'extended' | 'latin';

export interface CharSpec {
  char: string;
  unicode: number;
  page: number;
  row: number;
  col: number;
}

const BASIC = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  ...".,!?'\"-()&",
];

const EXTRA = [...';:/@#%+=*_[]<>$€', '“', '”', '‘', '’'];

const ACCENTS = [
  ...'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝ',
  ...'àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ',
  ...'ßœŒ¿¡«»–—…',
];

export interface CharSet {
  id: SetId;
  label: string;
  chars: readonly string[];
}

export const SETS: Record<SetId, CharSet> = {
  basic: { id: 'basic', label: 'Basic', chars: BASIC },
  extended: { id: 'extended', label: 'Extended', chars: [...BASIC, ...EXTRA] },
  latin: { id: 'latin', label: 'Latin', chars: [...BASIC, ...EXTRA, ...ACCENTS] },
};

export function unicodeLabel(unicode: number): string {
  return 'U+' + unicode.toString(16).toUpperCase().padStart(4, '0');
}

export function missingChars(chars: readonly string[], ready: Iterable<number>): string[] {
  const have = new Set(ready);
  return chars.filter((c) => !have.has(c.codePointAt(0)!));
}
