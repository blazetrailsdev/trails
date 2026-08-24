/**
 * Statement pool — LRU cache for prepared statements.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool
 */

export class StatementPool<T = unknown> {
  private _cache = new Map<string, T>();
  private _maxSize: number;

  constructor(maxSize = 1000) {
    this._maxSize = maxSize;
  }

  get length(): number {
    return this.cache.size;
  }

  get maxSize(): number {
    return this._maxSize;
  }

  /**
   * Shrink (or grow) the LRU bound. Shrinking evicts the
   * least-recently-used statements via `dealloc` — matches Rails'
   * behavior when `statement_limit` is changed mid-session.
   */
  setMaxSize(maxSize: number): void | Promise<void> {
    if (!Number.isInteger(maxSize) || maxSize < 0) {
      throw new RangeError(
        `StatementPool#setMaxSize expected a finite non-negative integer; got ${String(maxSize)}`,
      );
    }
    this._maxSize = maxSize;
    const deallocating: Array<Promise<void>> = [];
    while (this.cache.size > this._maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      const evicted = this.cache.get(firstKey)!;
      this.cache.delete(firstKey);
      const pending = this.dealloc(evicted);
      if (pending) deallocating.push(pending);
    }
    if (deallocating.length > 0) return Promise.all(deallocating).then(() => {});
  }

  get(key: string): T | undefined {
    if (!this.cache.has(key)) return undefined;
    const stmt = this.cache.get(key) as T;
    this.cache.delete(key);
    this.cache.set(key, stmt);
    return stmt;
  }

  set(key: string, stmt: T): void | Promise<void> {
    this.cache.delete(key);
    const deallocating: Array<Promise<void>> = [];
    while (this._maxSize <= this.cache.size) {
      // `dealloc(cache.shift.last)` (statement_pool.rb:32). The non-null
      // assertion carries Rails' failure mode rather than papering over it: at
      // `statement_limit` 0 the loop runs on an empty cache, Ruby's
      // `Hash#shift` returns nil and `nil.last` raises NoMethodError. A limit
      // of 0 is unsupported in Rails, and the destructure raises here for the
      // same reason at the same point.
      const [firstKey, evicted] = this.cache.entries().next().value!;
      this.cache.delete(firstKey);
      const pending = this.dealloc(evicted);
      if (pending) deallocating.push(pending);
    }
    this.cache.set(key, stmt);
    if (deallocating.length > 0) return Promise.all(deallocating).then(() => {});
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Alias for has() — mirrors Ruby's key? */
  isKey(key: string): boolean {
    return this.has(key);
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

  /**
   * Clear without deallocating — only safe when the server has
   * independently deallocated all statements (e.g. reconnect, DISCARD ALL).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#reset
   */
  reset(): void {
    this.cache.clear();
  }

  /**
   * Iterate over all [key, statement] pairs.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#each (Enumerable)
   */
  each(fn: (key: string, stmt: T) => void): void {
    for (const [key, stmt] of this.cache) {
      fn(key, stmt);
    }
  }

  get keys(): string[] {
    return [...this.cache.keys()];
  }

  /**
   * Rails scopes the statement cache by `Process.pid` so a forked child starts
   * with an empty cache (statement_pool.rb:60-62). Node is single-process, so
   * the one map is returned directly.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#cache (private)
   */
  private get cache(): Map<string, T> {
    return this._cache;
  }

  /**
   * Deallocate a prepared statement. Subclasses override this to
   * release adapter-specific resources (e.g. PG DEALLOCATE).
   *
   * Rails' `dealloc` blocks on libpq (postgresql_adapter.rb:307), so `[]=` is
   * done with the eviction by the time it returns. node-pg returns a promise, so
   * an override may return it and the mutating methods thread it back to the
   * eviction site, which awaits where Rails blocks.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#dealloc
   */
  protected dealloc(_stmt: T): void | Promise<void> {}
}
