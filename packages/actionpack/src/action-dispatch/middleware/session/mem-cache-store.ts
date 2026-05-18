/**
 * ActionDispatch::Session::MemCacheStore
 *
 * Mirrors `vendor/rails/actionpack/lib/action_dispatch/middleware/session/mem_cache_store.rb`.
 *
 * A session store that uses MemCache (Dalli) to implement storage. In Rails
 * this subclasses `Rack::Session::Dalli`; trails does not yet have a Dalli
 * port, so this mirrors the Rails class shape by subclassing `CacheStore`
 * and typing `cache` as a memcache-backed `ActiveSupport::Cache::Store`.
 * Wire a real memcached cache once `@blazetrails/activesupport`'s
 * `MemCacheStore` ships.
 *
 * Options:
 * - `expireAfter` — the length of time a session will be stored before
 *   automatically expiring. Falls back to `expires` (Rails alias).
 */

import { CacheStore, type CacheStoreSessionOptions } from "./cache-store.js";

export interface MemCacheStoreSessionOptions extends CacheStoreSessionOptions {
  /** Rails: `options[:expire_after] ||= options[:expires]`. */
  expires?: number;
}

/** Rails: `class MemCacheStore < Rack::Session::Dalli`. */
export class MemCacheStore extends CacheStore {
  constructor(app: unknown, options: MemCacheStoreSessionOptions = {}) {
    // Rails: `options[:expire_after] ||= options[:expires]`. The caller's
    // options hash is mutated in place to match Rails semantics.
    if (options.expireAfter == null && options.expires != null) {
      options.expireAfter = options.expires;
    }
    super(app, options);
  }
}
