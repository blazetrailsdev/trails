import { Executor } from "@blazetrails/activesupport";
import { Store as QueryCacheStore } from "./connection-adapters/abstract/query-cache.js";
import { ActiveRecordError } from "./errors.js";
import type { Base } from "./base.js";

export { QueryCacheStore };

export interface QueryCacheRunTarget {
  readonly queryCacheEnabled: boolean;
  readonly dbConfig?: { readonly queryCache?: unknown } | null;
  enableQueryCacheBang(): void;
}

export interface QueryCacheCompleteTarget {
  disableQueryCacheBang(): void;
  clearQueryCache(): void;
}

/** @internal */
let _base: typeof Base | undefined;

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

export class QueryCache {
  static run(): QueryCacheRunTarget[] {
    const allPools: QueryCacheRunTarget[] = [];
    baseClass().connectionHandler.eachConnectionPool((pool) => allPools.push(pool));
    const pools = allPools.filter((pool) => !pool.queryCacheEnabled);
    for (const pool of pools) {
      if (pool.dbConfig?.queryCache === false) continue;
      pool.enableQueryCacheBang();
    }
    return pools;
  }

  static complete(pools: QueryCacheCompleteTarget[]): void {
    for (const pool of pools) {
      pool.disableQueryCacheBang();
      pool.clearQueryCache();
    }
  }

  static installExecutorHooks(executor: typeof Executor = Executor): void {
    executor.registerHook(this);
  }
}

export const ClassMethods = {
  cache<T>(this: typeof Base, block: () => T | Promise<T>): T | Promise<T> {
    if (this.connectedQ() || !this.configurations().empty) {
      const pool = this.connectionPool();
      const wasEnabled = pool.queryCacheEnabled;
      const ensure = () => {
        if (!wasEnabled) pool.clearQueryCache();
      };
      let result: T | Promise<T>;
      try {
        result = pool.enableQueryCache(block);
      } catch (error) {
        ensure();
        throw error;
      }
      if (result instanceof Promise) return result.finally(ensure);
      ensure();
      return result;
    }
    return block();
  },

  uncached<T>(
    this: typeof Base,
    block: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): T | Promise<T> {
    if (this.connectedQ() || !this.configurations().empty) {
      return this.connectionPool().disableQueryCache(block, options);
    }
    return block();
  },
};
