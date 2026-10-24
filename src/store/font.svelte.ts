import { DEFAULT_META, type FontMeta } from './meta';

export const fontSettings: { family: string; designer: string } & FontMeta = $state({
  family: 'My Handwriting',
  designer: '',
  ...DEFAULT_META,
});
