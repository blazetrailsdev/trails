/**
 * Pool-based query-cache middleware surface.
 *
 * Mirrors: ActiveRecord::QueryCache (lib/active_record/query_cache.rb)
 *
 * The connection-level cache itself lives in the `QueryCache` mixin on
 * `AbstractAdapter` (`connection-adapters/abstract/query-cache.ts`); this file
 * only models the request-lifecycle hooks (`run`/`complete`) and the
 * `cache`/`uncached` block helpers that operate on a connection pool.
 */

// Import under the qualified TS name so the public surface doesn't leak the
// generic `Store` symbol into the generated `.d.ts`.
import { Executor } from "@blazetrails/activesupport";
import { Store as QueryCacheStore } from "./connection-adapters/abstract/query-cache.js";
import { ActiveRecordError } from "./errors.js";
import type { Base } from "./base.js";

// Deep-import convenience: consumers doing
// `import { ... } from "@blazetrails/activerecord/query-cache.js"`
// can still reach the Store class from here under its
// root-exported name.
export { QueryCacheStore };

/**
 * A query-cache target whose cache `run` can enable. The guard lives here,
 * mirroring Rails' `QueryCache.run`: targets already enabled, or disabled by
 * config, are skipped. Satisfied by both connection pools and the
 * connection-level `QueryCache` mixin on `AbstractAdapter`.
 */
export interface QueryCacheRunTarget {
  readonly queryCacheEnabled: boolean;
  /** Rails asks `pool.db_config&.query_cache == false` (`query_cache.rb:39`). The
   * connection-level `QueryCache` mixin has no `db_config`, hence optional. */
  readonly dbConfig?: { readonly queryCache?: unknown } | null;
  enableQueryCacheBang(): void;
}

/**
 * A query-cache target `complete` can disable and clear at the end of a
 * request/execution context.
 */
export interface QueryCacheCompleteTarget {
  disableQueryCacheBang(): void;
  clearQueryCache(): void;
}

/** @internal Set by `base.ts` at the bottom of its own module body — see the note there. */
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
  /**
   * Mirrors: ActiveRecord::QueryCache.run (query_cache.rb:37-42).
   *
   * Ruby's `Array#each` returns its receiver, so `run` returns the whole
   * `reject(&:query_cache_enabled)` array (including the config-disabled pools
   * `next` skips over), and the executor threads it into `complete(pools)`.
   * `complete` disabling/clearing a config-disabled pool is inert in Rails
   * exactly as in trails — `disable_query_cache!` re-disables an already-off
   * cache and `clear_query_cache` only bumps the version when pinned
   * (query_cache.rb:164-190) — so we mirror Rails rather than pre-filter.
   */
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

  /**
   * Mirrors: ActiveRecord::QueryCache.complete (query_cache.rb:44-48).
   */
  static complete(targets: QueryCacheCompleteTarget[]): void {
    for (const target of targets) {
      target.disableQueryCacheBang();
      target.clearQueryCache();
    }
  }

  /**
   * Mirrors: ActiveRecord::QueryCache.install_executor_hooks (query_cache.rb:51-53).
   */
  static installExecutorHooks(executor: typeof Executor = Executor): void {
    executor.registerHook(this);
  }
}

/**
 * Model-level query-cache delegation, mixed into `Base` via `extend`.
 *
 * Mirrors: ActiveRecord::QueryCache::ClassMethods (lib/active_record/query_cache.rb).
 * Both methods short-circuit to a plain `yield` when Active Record is not
 * configured (no connection and no configurations), exactly as Rails does, so
 * callers can wrap blocks unconditionally.
 */
export const ClassMethods = {
  /**
   * Mirrors: ActiveRecord::QueryCache::ClassMethods#cache
   */
  cache<T>(this: typeof Base, block: () => T | Promise<T>): T | Promise<T> {
    if (this.connectedQ() || !this.configurations().empty) {
      const pool = this.connectionPool();
      const wasEnabled = pool.queryCacheEnabled;
      // Ruby's `ensure` fires when the block RETURNS, so a block handing back a
      // pending FutureResult clears synchronously and the handle passes through
      // untouched; awaiting it would adopt the thenable and resolve the
      // scheduled query away.
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

  /**
   * Mirrors: ActiveRecord::QueryCache::ClassMethods#uncached
   * (`connection_pool.disable_query_cache(dirties: dirties, &block)`). Pass
   * `dirties: false` to stop writes inside the block from clearing every
   * connection's query cache.
   */
  uncached<T>(
    this: typeof Base,
    block: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): T | Promise<T> {
    if (this.connectedQ() || !this.configurations().empty) {
      return this.connectionPool().disableQueryCache(block, options);
    }
    // Ruby returns the block's value; resolving it here would adopt a pending
    // FutureResult, which `skip_query_cache_if_necessary` (relation.rb:
    // 1466-1471) hands back untouched.
    return block();
  },
};
