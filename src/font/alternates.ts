export interface AlternatePair {
  base: number;
  alt: number;
}

interface Coverage {
  format: 1;
  glyphs: number[];
}

export interface GsubTable {
  version: number;
  scripts: {
    tag: string;
    script: { defaultLangSys: { reserved: number; reqFeatureIndex: number; featureIndexes: number[] }; langSysRecords: never[] };
  }[];
  features: { tag: string; feature: { featureParams: number; lookupListIndexes: number[] } }[];
  lookups: (
    | { lookupType: 1; lookupFlag: number; subtables: { substFormat: 2; coverage: Coverage; substitute: number[] }[] }
    | {
        lookupType: 6;
        lookupFlag: number;
        subtables: {
          substFormat: 3;
          backtrackCoverage: Coverage[];
          inputCoverage: Coverage[];
          lookaheadCoverage: Coverage[];
          lookupRecords: { sequenceIndex: number; lookupListIndex: number }[];
        }[];
      }
  )[];
}

export function buildAlternateGsub(pairs: readonly AlternatePair[]): GsubTable | null {
  if (pairs.length === 0) return null;
  const sorted = [...pairs].sort((a, b) => a.base - b.base);
  const bases = sorted.map((p) => p.base);
  if (new Set(bases).size !== bases.length) throw new Error('duplicate base glyph');
  const coverage = (): Coverage => ({ format: 1, glyphs: [...bases] });
  return {
    version: 1,
    scripts: [
      {
        tag: 'DFLT',
        script: { defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] }, langSysRecords: [] },
      },
    ],
    features: [{ tag: 'calt', feature: { featureParams: 0, lookupListIndexes: [1] } }],
    lookups: [
      {
        lookupType: 1,
        lookupFlag: 0,
        subtables: [{ substFormat: 2, coverage: coverage(), substitute: sorted.map((p) => p.alt) }],
      },
      {
        lookupType: 6,
        lookupFlag: 0,
        subtables: [
          {
            substFormat: 3,
            backtrackCoverage: [coverage()],
            inputCoverage: [coverage()],
            lookaheadCoverage: [],
            lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 0 }],
          },
        ],
      },
    ],
  };
}
