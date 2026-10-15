import {
  eachValue,
  Hash,
  hashAref,
  hashAset,
  hashDelete,
  last,
  NotImplementedError,
  Process,
  rtest,
  size,
} from "@blazetrails/ruby-compat";

export class StatementPool<T = unknown> {
  static readonly DEFAULT_STATEMENT_LIMIT = 1000;

  private _cache: Hash<number, Record<string, T>>;
  private _statementLimit: number;

  constructor(statementLimit?: number) {
    this._cache = new Hash<number, Record<string, T>>((h, pid) => {
      const cache: Record<string, T> = {};
      h.set(pid, cache);
      return cache;
    });
    this._statementLimit = statementLimit ?? StatementPool.DEFAULT_STATEMENT_LIMIT;
  }

  each(block: (key: string, stmt: T) => void): void {
    for (const [key, stmt] of Object.entries(this.cache)) block(key, stmt);
  }

  isKey(key: string): boolean {
    return Object.hasOwn(this.cache, key);
  }

  get(key: string): T | null {
    return hashAref(this.cache, key) as T | null;
  }

  get length(): number {
    return size(this.cache);
  }

  set(sql: string, stmt: T): T {
    while (this._statementLimit <= size(this.cache)) {
      const shifted = Object.entries(this.cache)[0];
      delete this.cache[shifted[0]];
      void this.dealloc(last(shifted) as T);
    }
    hashAset(this.cache, sql, stmt);
    return stmt;
  }

  clear(): void {
    eachValue(this.cache, (stmt) => {
      void this.dealloc(stmt);
    });
    for (const key of Object.keys(this.cache)) delete this.cache[key];
  }

  reset(): void {
    for (const key of Object.keys(this.cache)) delete this.cache[key];
  }

  delete(key: string): T | null {
    const stmt = hashDelete(this.cache, key);
    if (rtest(stmt)) {
      void this.dealloc(stmt);
    }
    return stmt;
  }

  private get cache(): Record<string, T> {
    return this._cache.get(Process.pid)!;
  }

  protected dealloc(_stmt: T): void | Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/statement_pool.rb:60
    throw new NotImplementedError();
  }
}
