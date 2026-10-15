export interface TraceParams {
  turdsize: number;
  alphamax: number;
  opttolerance: number;
}

export const DEFAULT_TRACE: TraceParams = { turdsize: 4, alphamax: 1, opttolerance: 0.4 };
