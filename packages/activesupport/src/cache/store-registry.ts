import type { CacheStore } from "./index.js";

/**
 * Ruby resolves a cache store class at call time:
 * `require "active_support/cache/#{store}"` then `const_get(store.camelize)`
 * (cache.rb:135-144), so a store shipped by another gem — `redis-activesupport`,
 * `dalli` — resolves with no change to Rails. ESM has no call-time autoload: an
 * `import` is eager and its specifier cannot be built from a runtime name. This
 * registry stands in for the `ActiveSupport::Cache` constant namespace that
 * `const_get` reads, so a store module registers itself the way requiring its
 * file defines its constant, and `retrieve_store_class` looks names up rather
 * than switching over a closed set.
 *
 * @noRailsEquivalent PERMANENT: stands in for Ruby's `const_get` over an
 * autoloaded namespace. ESM imports are eager and their specifier cannot be
 * built from a runtime name, so no port can resolve a store class by name
 * without a registry.
 */
const STORE_CLASSES = new Map<string, new (...args: any[]) => any>();

/**
 * Registers `klass` under the Ruby-symbol name of its store (`":memory_store"`),
 * the trails analogue of `require`-ing `active_support/cache/memory_store`.
 *
 * @noRailsEquivalent PERMANENT: half of the constant-namespace stand-in
 * described on STORE_CLASSES; ESM has no call-time autoload to define it.
 */
export function registerStoreClass(store: string, klass: new (...args: any[]) => any): void {
  STORE_CLASSES.set(store, klass);
}

/**
 * Looks a registered store class up, or returns `undefined` where Ruby's
 * `require` would raise `LoadError`.
 *
 * @noRailsEquivalent PERMANENT: half of the constant-namespace stand-in
 * described on STORE_CLASSES; ESM has no call-time autoload to read it.
 */
export function lookupStoreClass(store: string): (new (...args: any[]) => CacheStore) | undefined {
  return STORE_CLASSES.get(store);
}
