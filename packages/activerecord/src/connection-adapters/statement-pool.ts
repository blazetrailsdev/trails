import { Process } from "@blazetrails/ruby-compat";

export class StatementPool<T = unknown> {
  static readonly DEFAULT_STATEMENT_LIMIT = 1000;

  private _cache: Map<number, Map<string, T>>;
  private _statementLimit: number;

  constructor(statementLimit?: number) {
    this._cache = new Map<number, Map<string, T>>();
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
    let deallocating: Promise<void> | undefined;
    while (this._statementLimit <= this.cache.size) {
      const [firstKey, evicted] = this.cache.entries().next().value!;
      this.cache.delete(firstKey);
      deallocating = deallocating
        ? deallocating.then(() => this.dealloc(evicted))
        : (this.dealloc(evicted) ?? undefined);
    }
    this.cache.set(key, stmt);
    return deallocating;
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

  each(fn: (key: string, stmt: T) => void): void {
    for (const [key, stmt] of this.cache) {
      fn(key, stmt);
    }
  }

  private get cache(): Map<string, T> {
    let cache = this._cache.get(Process.pid);
    if (cache === undefined) {
      cache = new Map<string, T>();
      this._cache.set(Process.pid, cache);
    }
    return cache;
  }

  protected dealloc(_stmt: T): void | Promise<void> {}
}
