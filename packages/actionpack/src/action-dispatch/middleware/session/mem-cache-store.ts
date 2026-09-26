import type { RackApp } from "@blazetrails/rack";
import { CacheStore, type CacheStoreSessionOptions } from "./cache-store.js";

export interface MemCacheStoreSessionOptions extends CacheStoreSessionOptions {
  expires?: number;
}

/**
 * `ActionDispatch::Session::MemCacheStore`
 * (`actionpack/lib/action_dispatch/middleware/session/mem_cache_store.rb:23-26`)
 * descends from `Rack::Session::Dalli`, a class of the dalli gem, which trails
 * does not vendor, and includes `Compatibility`, `StaleSessionCheck` and
 * `SessionObject` into that ancestry. With no Dalli seat, `CacheStore` stands
 * in as the superclass. `CacheStore` already has the three modules through
 * `AbstractSecureStore` (`abstract_store.rb:97-100`), so Ruby's
 * `include_modules_at` would skip all three (`vendor/ruby/v3.3.11/class.c:1281,1291,1296`),
 * and the calls are not made.
 */
export class MemCacheStore extends CacheStore {
  constructor(app?: RackApp, options: MemCacheStoreSessionOptions = {}) {
    if (options.expireAfter == null && options.expires != null) {
      options.expireAfter = options.expires;
    }
    super(app, options);
  }
}
