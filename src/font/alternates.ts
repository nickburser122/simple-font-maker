export interface AlternateSet {
  base: number;
  alts: readonly number[];
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

export const MAX_ALTS = 3;

function cover(glyphs: readonly number[]): Coverage {
  return { format: 1, glyphs: [...new Set(glyphs)].sort((a, b) => a - b) };
}

export function buildAlternateGsub(sets: readonly AlternateSet[]): GsubTable | null {
  const usable = sets.filter((s) => s.alts.length > 0);
  if (usable.length === 0) return null;
  const bases = usable.map((s) => s.base);
  if (new Set(bases).size !== bases.length) throw new Error('duplicate base glyph');
  const depth = Math.min(MAX_ALTS, Math.max(...usable.map((s) => s.alts.length)));
  const sorted = [...usable].sort((a, b) => a.base - b.base);

  const lookups: GsubTable['lookups'] = [];
  for (let t = 1; t <= depth; t++) {
    const withT = sorted.filter((s) => s.alts.length >= t);
    lookups.push({
      lookupType: 1,
      lookupFlag: 0,
      subtables: [{ substFormat: 2, coverage: cover(withT.map((s) => s.base)), substitute: withT.map((s) => s.alts[t - 1]) }],
    });
  }

  const chain: Extract<GsubTable['lookups'][number], { lookupType: 6 }>['subtables'] = [];
  for (let state = 0; state < depth; state++) {
    const target = state + 1;
    const input = sorted.filter((s) => s.alts.length >= target).map((s) => s.base);
    const back = state === 0 ? usable.map((s) => s.base) : usable.filter((s) => s.alts.length >= state).map((s) => s.alts[state - 1]);
    if (input.length === 0 || back.length === 0) continue;
    chain.push({
      substFormat: 3,
      backtrackCoverage: [cover(back)],
      inputCoverage: [cover(input)],
      lookaheadCoverage: [],
      lookupRecords: [{ sequenceIndex: 0, lookupListIndex: target - 1 }],
    });
  }
  lookups.push({ lookupType: 6, lookupFlag: 0, subtables: chain });

  return {
    version: 1,
    scripts: [
      {
        tag: 'DFLT',
        script: { defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] }, langSysRecords: [] },
      },
    ],
    features: [{ tag: 'calt', feature: { featureParams: 0, lookupListIndexes: [lookups.length - 1] } }],
    lookups,
  };
}
