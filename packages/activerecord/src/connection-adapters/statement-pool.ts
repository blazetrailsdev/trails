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

  get(key: string): T | undefined {
    if (!this._statements.has(key)) return undefined;
    const stmt = this._statements.get(key) as T;
    // Move to end for LRU
    this._statements.delete(key);
    this._statements.set(key, stmt);
    return stmt;
  }

  set(key: string, stmt: T): void {
    if (this._maxSize <= 0) return;
    this._statements.delete(key);
    while (this._statements.size >= this._maxSize) {
      const firstKey = this._statements.keys().next().value;
      if (firstKey === undefined) break;
      const evicted = this._statements.get(firstKey)!;
      this._statements.delete(firstKey);
      this.dealloc(evicted);
    }
    this._statements.set(key, stmt);
  }

  has(key: string): boolean {
    return this._statements.has(key);
  }

  delete(key: string): T | undefined {
    if (!this._statements.has(key)) return undefined;
    const stmt = this._statements.get(key) as T;
    this._statements.delete(key);
    this.dealloc(stmt);
    return stmt;
  }

  clear(): void {
    for (const stmt of this._statements.values()) {
      this.dealloc(stmt);
    }
    this._statements.clear();
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
   * Mirrors: ActiveRecord::ConnectionAdapters::StatementPool#dealloc
   */
  protected dealloc(_stmt: T): void {
    // Base implementation is a no-op; adapter-specific pools override.
  }
}
