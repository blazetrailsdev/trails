export class StatementPool<T = unknown> {
  static readonly DEFAULT_STATEMENT_LIMIT = 1000;

  private _cache: Map<string, T>;
  private _statementLimit: number;

  constructor(statementLimit?: number) {
    this._cache = new Map<string, T>();
    this._statementLimit = statementLimit ?? StatementPool.DEFAULT_STATEMENT_LIMIT;
  }

  get length(): number {
    return this.cache.size;
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  /** @missingRailsCall last — PERMANENT */
  set(key: string, stmt: T): void | Promise<void> {
    const deallocating: Array<Promise<void>> = [];
    while (this._statementLimit <= this.cache.size) {
      const [firstKey, evicted] = this.cache.entries().next().value!;
      this.cache.delete(firstKey);
      const pending = this.dealloc(evicted);
      if (pending) deallocating.push(pending);
    }
    this.cache.set(key, stmt);
    if (deallocating.length > 0) return Promise.all(deallocating).then(() => {});
  }

  isKey(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): T | undefined | Promise<T | undefined> {
    if (!this.cache.has(key)) return undefined;
    const stmt = this.cache.get(key) as T;
    this.cache.delete(key);
    const pending = this.dealloc(stmt);
    return pending ? pending.then(() => stmt) : stmt;
  }

  clear(): void | Promise<void> {
    const deallocating: Array<Promise<void>> = [];
    for (const stmt of this.cache.values()) {
      const pending = this.dealloc(stmt);
      if (pending) deallocating.push(pending);
    }
    this.cache.clear();
    if (deallocating.length > 0) return Promise.all(deallocating).then(() => {});
  }

  reset(): void | Promise<void> {
    this.cache.clear();
  }

  each(fn: (key: string, stmt: T) => void): void {
    for (const [key, stmt] of this.cache) {
      fn(key, stmt);
    }
  }

  private get cache(): Map<string, T> {
    return this._cache;
  }

  protected dealloc(_stmt: T): void | Promise<void> {}
}
