import { Hash, last, Process } from "@blazetrails/ruby-compat";

export class StatementPool<T = unknown> {
  static readonly DEFAULT_STATEMENT_LIMIT = 1000;

  private _cache: Hash<number, Map<string, T>>;
  private _statementLimit: number;

  constructor(statementLimit?: number) {
    this._cache = new Hash<number, Map<string, T>>((h, pid) => {
      const cache = new Map<string, T>();
      h.set(pid, cache);
      return cache;
    });
    this._statementLimit = statementLimit ?? StatementPool.DEFAULT_STATEMENT_LIMIT;
  }

  each(fn: (key: string, stmt: T) => void): void {
    for (const [key, stmt] of this.cache) {
      fn(key, stmt);
    }
  }

  isKey(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  get length(): number {
    return this.cache.size;
  }

  set(key: string, stmt: T): void | Promise<void> {
    let deallocating: Promise<void> | undefined;
    while (this._statementLimit <= this.cache.size) {
      const shifted = this.cache.entries().next().value!;
      this.cache.delete(shifted[0]);
      deallocating = deallocating
        ? deallocating.then(() => this.dealloc(last(shifted) as T))
        : (this.dealloc(last(shifted) as T) ?? undefined);
    }
    this.cache.set(key, stmt);
    return deallocating;
  }

  clear(): void | Promise<void> {
    let deallocating: Promise<void> | undefined;
    for (const stmt of this.cache.values()) {
      deallocating = deallocating
        ? deallocating.then(() => this.dealloc(stmt))
        : (this.dealloc(stmt) ?? undefined);
    }
    this.cache.clear();
    return deallocating;
  }

  reset(): void | Promise<void> {
    this.cache.clear();
  }

  delete(key: string): T | undefined | Promise<T | undefined> {
    if (!this.cache.has(key)) return undefined;
    const stmt = this.cache.get(key) as T;
    this.cache.delete(key);
    const pending = this.dealloc(stmt);
    return pending ? pending.then(() => stmt) : stmt;
  }

  private get cache(): Map<string, T> {
    return this._cache.get(Process.pid)!;
  }

  protected dealloc(_stmt: T): void | Promise<void> {}
}
