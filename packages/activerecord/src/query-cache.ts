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

export class QueryCache {
  /**
   * Enable query cache on all provided pools/adapters that are not already
   * enabled, skipping (without enabling) those disabled by configuration.
   * Returns the not-already-enabled targets — the receiver of Rails' `each`,
   * config-disabled pools included — so the executor can thread that exact list
   * into `complete`.
   * Called at the start of a request/execution context.
   *
   * Mirrors: ActiveRecord::QueryCache.run
   * (`each_connection_pool.reject(&:query_cache_enabled).each { next if
   * pool.db_config&.query_cache == false; pool.enable_query_cache! }`). Ruby's
   * `Array#each` returns its receiver, so `run` returns the whole
   * `reject(&:query_cache_enabled)` array (including the config-disabled pools
   * `next` skips over), and the executor threads it into `complete(pools)`.
   * `complete` disabling/clearing a config-disabled pool is inert in Rails
   * exactly as in trails — `disable_query_cache!` re-disables an already-off
   * cache and `clear_query_cache` only bumps the version when pinned
   * (query_cache.rb:164-190) — so we mirror Rails rather than pre-filter.
   */
  static run<T extends QueryCacheRunTarget>(targets: T[]): T[] {
    const notAlreadyEnabled = targets.filter((target) => !target.queryCacheEnabled);
    for (const target of notAlreadyEnabled) {
      if (target.queryCacheDisabled) continue;
      target.enableQueryCacheBang();
    }
    return notAlreadyEnabled;
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
      registerHook(hook: {
        run(): (QueryCacheRunTarget & QueryCacheCompleteTarget)[];
        complete(pools: QueryCacheCompleteTarget[]): void;
      }): void;
    },
    targets:
      | (QueryCacheRunTarget & QueryCacheCompleteTarget)[]
      | (() => (QueryCacheRunTarget & QueryCacheCompleteTarget)[]) = [],
  ): void {
    if (!executor) return;
    const resolve = typeof targets === "function" ? targets : () => targets;

    // Mirrors Rails' ExecutorHooks module with static run/complete. Rails'
    // executor keeps per-execution `hook_state` and passes `run`'s return value
    // as the argument to `complete` (execution_wrapper.rb:25-37, :145-148), so
    // `run` returns its not-already-enabled receiver and `complete` receives
    // that exact list — no shared state a nested/overlapping execution could
    // clobber, and `complete` acts only on the pools this execution's `run`
    // observed rather than re-resolving the list independently.
    class ExecutorHooks {
      static run(): (QueryCacheRunTarget & QueryCacheCompleteTarget)[] {
        return QueryCache.run(resolve());
      }
      static complete(pools: QueryCacheCompleteTarget[]): void {
        QueryCache.complete(pools);
      }
    }

    executor.registerHook(ExecutorHooks);
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
  async cache<T>(this: typeof Base, block: () => T | Promise<T>): Promise<T> {
    if (this.isConnected() || !this.configurations().empty) {
      const pool = this.connectionPool();
      const wasEnabled = pool.queryCacheEnabled;
      try {
        return await pool.enableQueryCache(block);
      } finally {
        if (!wasEnabled) pool.clearQueryCache();
      }
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
  ): Promise<T> {
    if (this.isConnected() || !this.configurations().empty) {
      return this.connectionPool().disableQueryCache(block, options);
    }
    return Promise.resolve(block());
  },
};
