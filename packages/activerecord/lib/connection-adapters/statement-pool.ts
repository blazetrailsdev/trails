import {
  Hash,
  hashAref,
  hashAset,
  hashDelete,
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

  async set(sql: string, stmt: T): Promise<T> {
    while (this._statementLimit <= size(this.cache)) {
      const shifted = Object.entries(this.cache)[0];
      delete this.cache[shifted[0]];
      await this.dealloc((shifted.at(-1) ?? null) as T);
    }
    hashAset(this.cache, sql, stmt);
    return stmt;
  }

  async clear(): Promise<void> {
    for (const stmt of Object.values(this.cache)) {
      await this.dealloc(stmt);
    }
    for (const key of Object.keys(this.cache)) delete this.cache[key];
  }

  reset(): void | Promise<void> {
    for (const key of Object.keys(this.cache)) delete this.cache[key];
  }

  async delete(key: string): Promise<T | null> {
    const stmt = hashDelete(this.cache, key);
    if (rtest(stmt)) {
      await this.dealloc(stmt);
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
