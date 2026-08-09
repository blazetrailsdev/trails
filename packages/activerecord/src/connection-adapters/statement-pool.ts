/**
 * Statement pool — LRU cache for prepared statements.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool
 */

export class StatementPool<T = unknown> {
  private _statements = new Map<string, T>();
  private _maxSize: number;

  constructor(maxSize = 1000) {
    this._maxSize = maxSize;
  }

  get length(): number {
    return this._statements.size;
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
    while (this._statements.size > this._maxSize) {
      const firstKey = this._statements.keys().next().value;
      if (firstKey === undefined) break;
      const evicted = this._statements.get(firstKey)!;
      this._statements.delete(firstKey);
      const pending = this.dealloc(evicted);
      if (pending) deallocating.push(pending);
    }
    if (deallocating.length > 0) return Promise.all(deallocating).then(() => {});
  }

  get(key: string): T | undefined {
    if (!this._statements.has(key)) return undefined;
    const stmt = this._statements.get(key) as T;
    // Move to end for LRU
    this._statements.delete(key);
    this._statements.set(key, stmt);
    return stmt;
  }

  set(key: string, stmt: T): void | Promise<void> {
    this._statements.delete(key);
    const deallocating: Array<Promise<void>> = [];
    while (this._statements.size >= this._maxSize) {
      const firstKey = this._statements.keys().next().value;
      if (firstKey === undefined) break;
      const evicted = this._statements.get(firstKey)!;
      this._statements.delete(firstKey);
      const pending = this.dealloc(evicted);
      if (pending) deallocating.push(pending);
    }
    this._statements.set(key, stmt);
    if (deallocating.length > 0) return Promise.all(deallocating).then(() => {});
  }

  has(key: string): boolean {
    return this._statements.has(key);
  }

  /** Alias for has() — mirrors Ruby's key? */
  isKey(key: string): boolean {
    return this.has(key);
  }

  delete(key: string): T | undefined | Promise<T | undefined> {
    if (!this._statements.has(key)) return undefined;
    const stmt = this._statements.get(key) as T;
    this._statements.delete(key);
    const pending = this.dealloc(stmt);
    return pending ? pending.then(() => stmt) : stmt;
  }

  clear(): void | Promise<void> {
    const deallocating: Array<Promise<void>> = [];
    for (const stmt of this._statements.values()) {
      const pending = this.dealloc(stmt);
      if (pending) deallocating.push(pending);
    }
    this._statements.clear();
    if (deallocating.length > 0) return Promise.all(deallocating).then(() => {});
  }

  /**
   * Clear without deallocating — only safe when the server has
   * independently deallocated all statements (e.g. reconnect, DISCARD ALL).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#reset
   */
  reset(): void {
    this._statements.clear();
  }

  /**
   * Iterate over all [key, statement] pairs.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#each (Enumerable)
   */
  each(fn: (key: string, stmt: T) => void): void {
    for (const [key, stmt] of this._statements) {
      fn(key, stmt);
    }
  }

  get keys(): string[] {
    return [...this._statements.keys()];
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
  protected dealloc(_stmt: T): void | Promise<void> {
    // Base implementation is a no-op; adapter-specific pools override.
  }
}

/**
 * Returns the per-process statement cache. Rails scopes this by Process.pid so
 * forked child processes start with an empty cache; Node is single-process so
 * the internal Map is returned directly.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#cache (private)
 *
 * @internal
 */
export function cache<T>(pool: StatementPool<T>): Map<string, T> {
  return (pool as any)._statements as Map<string, T>;
}
