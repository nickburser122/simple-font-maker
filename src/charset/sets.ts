export type SetId = 'basic' | 'extended';

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

export interface CharSet {
  id: SetId;
  label: string;
  chars: readonly string[];
}

export const SETS: Record<SetId, CharSet> = {
  basic: { id: 'basic', label: 'Basic', chars: BASIC },
  extended: { id: 'extended', label: 'Extended', chars: [...BASIC, ...EXTRA] },
};

export function unicodeLabel(unicode: number): string {
  return 'U+' + unicode.toString(16).toUpperCase().padStart(4, '0');
}
