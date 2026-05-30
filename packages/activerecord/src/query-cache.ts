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
import { Store as QueryCacheStore } from "./connection-adapters/abstract/query-cache.js";

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
  readonly queryCacheDisabled?: boolean;
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

/**
 * A connection pool whose query cache `cache`/`uncached` block helpers can
 * drive. Mirrors the `connection_pool` that Rails'
 * `ActiveRecord::QueryCache::ClassMethods` operate on (`enable_query_cache`
 * via the clear-on-exit `withQueryCache`, and `disable_query_cache`).
 */
export interface QueryCacheBlockPool {
  withQueryCache<T>(fn: () => T | Promise<T>): Promise<T>;
  disableQueryCache<T>(fn: () => T | Promise<T>, options?: { dirties?: boolean }): Promise<T>;
}

export class QueryCache {
  /**
   * Enable the query cache on `pool` for the duration of `block`, then restore
   * the prior state — clearing the cache on exit unless it was already enabled.
   *
   * Mirrors: ActiveRecord::QueryCache::ClassMethods#cache
   * (`pool.enable_query_cache(&block)` with `pool.clear_query_cache unless
   * was_enabled` in the ensure; the pool's `withQueryCache` owns that logic).
   */
  static cache<T>(pool: QueryCacheBlockPool, block: () => T | Promise<T>): Promise<T> {
    return pool.withQueryCache(block);
  }

  /**
   * Disable the query cache on `pool` within `block`. Pass `dirties: false` to
   * stop write operations from clearing every connection's query cache (the
   * default dirties them in case they are replicas with now-stale caches).
   *
   * Mirrors: ActiveRecord::QueryCache::ClassMethods#uncached
   * (`connection_pool.disable_query_cache(dirties: dirties, &block)`).
   */
  static uncached<T>(
    pool: QueryCacheBlockPool,
    block: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): Promise<T> {
    return pool.disableQueryCache(block, options);
  }

  /**
   * Enable query cache on all provided pools/adapters, skipping those whose
   * cache is already enabled or disabled by configuration.
   * Called at the start of a request/execution context.
   *
   * Mirrors: ActiveRecord::QueryCache.run
   * (`each_connection_pool.reject(&:query_cache_enabled).each { next if
   * pool.db_config&.query_cache == false; pool.enable_query_cache! }`)
   */
  static run(targets: QueryCacheRunTarget[]): void {
    for (const target of targets) {
      if (target.queryCacheEnabled || target.queryCacheDisabled) continue;
      target.enableQueryCacheBang();
    }
  }

  /**
   * Disable and clear query cache on all provided targets.
   * Called at the end of a request/execution context.
   *
   * Mirrors: ActiveRecord::QueryCache::ExecutorHooks.complete
   */
  static complete(targets: QueryCacheCompleteTarget[]): void {
    for (const target of targets) {
      target.disableQueryCacheBang();
      target.clearQueryCache();
    }
  }

  /**
   * Register query cache hooks with an executor-like object.
   *
   * Mirrors: ActiveRecord::QueryCache.install_executor_hooks
   */
  static installExecutorHooks(
    executor?: {
      registerHook(hook: { run(): void; complete(): void }): void;
    },
    targets:
      | (QueryCacheRunTarget & QueryCacheCompleteTarget)[]
      | (() => (QueryCacheRunTarget & QueryCacheCompleteTarget)[]) = [],
  ): void {
    if (!executor) return;
    const resolve = typeof targets === "function" ? targets : () => targets;

    // Mirrors Rails' ExecutorHooks module with static run/complete
    class ExecutorHooks {
      static run() {
        QueryCache.run(resolve());
      }
      static complete() {
        QueryCache.complete(resolve());
      }
    }

    executor.registerHook(ExecutorHooks);
  }
}
