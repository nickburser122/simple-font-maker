import type { BuildGlyph, BuildSettings, Outlines } from '../font/build';
import type { Pt } from '../vision/types';
import type { Req, Res } from './messages';

type Body<T> = T extends unknown ? Omit<T, 'rid'> : never;
type ExtractBody = Omit<Extract<Req, { type: 'extract' }>, 'rid' | 'type'>;

const worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' });
const waiting = new Map<
  number,
  { ok: (r: Res) => void; fail: (e: Error) => void; progress?: (done: number, total: number) => void }
>();
let counter = 0;

worker.onmessage = (e: MessageEvent<Res>) => {
  const w = waiting.get(e.data.rid);
  if (!w) return;
  if (e.data.type === 'progress') {
    w.progress?.(e.data.done, e.data.total);
    return;
  }
  waiting.delete(e.data.rid);
  if (e.data.type === 'error') w.fail(new Error(e.data.message));
  else w.ok(e.data);
};

function call(
  body: Body<Req>,
  transfer: Transferable[] = [],
  progress?: (done: number, total: number) => void,
): Promise<Res> {
  return new Promise((ok, fail) => {
    const rid = ++counter;
    waiting.set(rid, { ok, fail, progress });
    worker.postMessage({ ...body, rid } as Req, transfer);
  });
}

export async function load(cap: number, bitmap: ImageBitmap): Promise<{ corners: Pt[] | null }> {
  const r = await call({ type: 'load', cap, bitmap }, [bitmap]);
  if (r.type !== 'loaded') throw new Error('unexpected reply');
  return { corners: r.corners };
}

export async function extract(b: ExtractBody) {
  const r = await call({ type: 'extract', ...b });
  if (r.type !== 'cells') throw new Error('unexpected reply');
  return r;
}

export function release(cap: number): void {
  void call({ type: 'release', cap });
}

export async function build(
  glyphs: BuildGlyph[],
  settings: BuildSettings,
  onProgress?: (done: number, total: number) => void,
): Promise<{ buffer: ArrayBuffer; outlines: Outlines }> {
  const r = await call({ type: 'build', glyphs, settings }, [], onProgress);
  if (r.type !== 'font') throw new Error('unexpected reply');
  return { buffer: r.buffer, outlines: r.outlines };
}
