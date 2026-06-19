import type { CacheLogger } from "./index.js";

/**
 * Mirrors Rails `ActiveSupport::Cache::Store` base class (cache.rb).
 * Holds the class-level logger attribute used by serializers and stores.
 * @internal
 */
export class Store {
  static logger: CacheLogger | null = null;

  static with<T>(options: { logger: CacheLogger }, fn: () => T): T {
    const prev = Store.logger;
    Store.logger = options.logger;
    try {
      return fn();
    } finally {
      Store.logger = prev;
    }
  }
}
