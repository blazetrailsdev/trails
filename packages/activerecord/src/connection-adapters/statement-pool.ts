import {
  eachValue,
  Hash,
  last,
  NotImplementedError,
  Process,
  rtest,
} from "@blazetrails/ruby-compat";

export class StatementPool<T = unknown> {
  static readonly DEFAULT_STATEMENT_LIMIT = 1000;

  private _cache: Hash<number, Hash<string, T>>;
  private _statementLimit: number;

  constructor(statementLimit?: number) {
    this._cache = new Hash<number, Hash<string, T>>((h, pid) => {
      const cache = new Hash<string, T>();
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

  set(sql: string, stmt: T): T {
    while (this._statementLimit <= this.cache.size) {
      void this.dealloc(last(this.cache.shift()!) as T);
    }
    this.cache.set(sql, stmt);
    return stmt;
  }

  clear(): void {
    eachValue(this.cache, (stmt) => {
      void this.dealloc(stmt);
    });
    this.cache.clear();
  }

  reset(): void {
    this.cache.clear();
  }

  delete(key: string): T | undefined {
    const stmt = this.cache.delete(key) as T | undefined;
    if (rtest(stmt)) {
      void this.dealloc(stmt);
    }
    return stmt;
  }

  private get cache(): Hash<string, T> {
    return this._cache.get(Process.pid)!;
  }

  protected dealloc(_stmt: T): void | Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/statement_pool.rb:60
    throw new NotImplementedError();
  }
}
