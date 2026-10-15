import { describe, expect, it } from 'vitest';
import { History } from '../src/font/history';

describe('history', () => {
  it('undoes and redoes committed states in order', () => {
    const h = new History({ v: 0 });
    h.commit({ v: 1 });
    h.commit({ v: 2 });
    expect(h.undo()).toEqual({ v: 1 });
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ v: 1 });
    expect(h.canRedo).toBe(true);
  });

  it('ignores unchanged commits and clears redo after a new change', () => {
    const h = new History({ v: 0 });
    expect(h.commit({ v: 0 })).toBe(false);
    h.commit({ v: 1 });
    h.undo();
    h.commit({ v: 5 });
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(true);
  });

  it('caps the stack length', () => {
    const h = new History({ v: 0 }, 3);
    for (let i = 1; i <= 6; i++) h.commit({ v: i });
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(3);
  });

  it('clears both stacks on reset', () => {
    const h = new History({ v: 0 });
    h.commit({ v: 1 });
    h.undo();
    h.reset({ v: 9 });
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.commit({ v: 9 })).toBe(false);
  });
});
