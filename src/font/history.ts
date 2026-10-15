export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(
    private present: T,
    private limit = 100,
  ) {}

  commit(next: T): boolean {
    if (JSON.stringify(next) === JSON.stringify(this.present)) return false;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future = [];
    return true;
  }

  undo(): T | null {
    const p = this.past.pop();
    if (p === undefined) return null;
    this.future.push(this.present);
    this.present = p;
    return p;
  }

  redo(): T | null {
    const n = this.future.pop();
    if (n === undefined) return null;
    this.past.push(this.present);
    this.present = n;
    return n;
  }

  reset(state: T): void {
    this.past = [];
    this.future = [];
    this.present = state;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
