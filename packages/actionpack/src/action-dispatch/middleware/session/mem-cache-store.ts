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

import { include } from "@blazetrails/activesupport";
import {
  Compatibility,
  type SessionId,
  SessionObject,
  StaleSessionCheck,
} from "./abstract-store.js";
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

  /**
   * Preserve the `SessionId`-returning shape inherited from
   * `AbstractSecureStore` / `CacheStore`. Rails' `Compatibility` mixin
   * redefines `generate_sid` as a hex string, which would otherwise be
   * copied onto this prototype by the `include` calls below.
   */
  override generateSid(): SessionId {
    return super.generateSid();
  }
}

// Rails: `include Compatibility; include StaleSessionCheck; include SessionObject`.
// The CacheStore parent also mixes these in, but Rails registers them on
// MemCacheStore directly (since the parent there is Rack::Session::Dalli),
// so api:compare expects the methods on MemCacheStore's own surface.
include(MemCacheStore, Compatibility);
include(MemCacheStore, StaleSessionCheck);
include(MemCacheStore, SessionObject);
