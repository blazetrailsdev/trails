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
    if (this._statements.size >= this._maxSize) {
      const firstKey = this._statements.keys().next().value;
      if (firstKey !== undefined) this._statements.delete(firstKey);
    }
    this._statements.set(key, stmt);
  }

  has(key: string): boolean {
    return this._statements.has(key);
  }

  delete(key: string): boolean {
    return this._statements.delete(key);
  }

  clear(): void {
    this._statements.clear();
  }

  get keys(): string[] {
    return [...this._statements.keys()];
  }
}
