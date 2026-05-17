/**
 * `AbstractController::Caching` — config slot contract and convenience
 * `cache(key, options, block)` helper. The fragment sub-module
 * (`AbstractController::Caching::Fragments`) lives in `./fragments.ts`
 * and is re-exported from here.
 *
 * Ported from `vendor/rails/actionpack/lib/abstract_controller/caching.rb`.
 *
 * @internal
 */

import type { CacheOptions, CacheStore } from "@blazetrails/activesupport";

const SLOTS = ["defaultStaticExtension", "performCaching", "enableFragmentCacheLogging"] as const;

export type CachingSlot = (typeof SLOTS)[number];

/** Reified list of config-slot names — useful for introspection / api:compare. */
export const CACHING_SLOTS: readonly CachingSlot[] = SLOTS;

/**
 * Rails-shaped class-level defaults. Hosts read these once at include
 * time; we don't install them eagerly to avoid the
 * subclass-shadowing trap (see `applyAssetPaths` docstring).
 */
export const CACHING_DEFAULTS = {
  defaultStaticExtension: ".html",
  performCaching: true,
  enableFragmentCacheLogging: false,
} as const;

export type ViewCacheDependency = (this: CachingHost) => unknown;

export interface CachingClassMethods {
  cacheStore?: CacheStore | null;
  performCaching?: boolean;
  defaultStaticExtension?: string;
  enableFragmentCacheLogging?: boolean;
  /** Class-level cache-dependency blocks, appended via `viewCacheDependency`. */
  _viewCacheDependencies?: ViewCacheDependency[];
}

export interface CachingHost {
  constructor: CachingClassMethods;
}

/**
 * Marks a host class as conforming to the `CachingClassMethods` slot
 * contract. No-op at runtime — see `applyAssetPaths` for the rationale.
 */
export function applyCaching<T extends new (...args: never[]) => unknown>(
  _cls: T & Partial<CachingClassMethods>,
): void {
  // Intentionally empty.
}

/**
 * `ConfigMethods#cache_store` reader. Rails delegates to `config.cache_store`;
 * trails stores the slot directly on the class, so this is a thin lookup
 * that walks the prototype chain via `host.constructor`.
 */
export function cacheStore(this: CachingHost): CacheStore | null {
  return this.constructor.cacheStore ?? null;
}

/**
 * `ConfigMethods#cache_store=` writer. Rails wraps via
 * `ActiveSupport::Cache.lookup_store(*store)`; that helper isn't ported
 * yet, so for now we accept a fully-constructed `CacheStore` (or `null`)
 * and assign it onto the class slot directly. The signature stays
 * Rails-shaped so future wiring of `lookupStore` is a drop-in upgrade.
 */
export function setCacheStore(this: CachingHost, store: CacheStore | null): void {
  this.constructor.cacheStore = store;
}

/**
 * Mirrors `AbstractController::Caching::ConfigMethods#cache_configured?`.
 * Truthy when caching is on AND a store is wired up.
 */
export function cacheConfigured(host: CachingHost): boolean {
  const cls = host.constructor;
  return Boolean(cls.performCaching && cls.cacheStore);
}

/**
 * Append a block that's evaluated per-request to derive a fragment
 * cache-key dependency. Stored on the **class** so subclasses inherit.
 * Mirrors `ClassMethods#view_cache_dependency`.
 */
export function viewCacheDependency(cls: CachingClassMethods, block: ViewCacheDependency): void {
  const existing = cls._viewCacheDependencies ?? [];
  cls._viewCacheDependencies = [...existing, block];
}

/**
 * Evaluate every registered dependency block in the instance's context
 * and return the non-nullish results. Mirrors Rails' `filter_map` —
 * `nil` (here: `null` / `undefined`) entries are dropped.
 */
export function viewCacheDependencies(this: CachingHost): unknown[] {
  const deps = this.constructor._viewCacheDependencies ?? [];
  const out: unknown[] = [];
  for (const dep of deps) {
    const value = dep.call(this);
    if (value != null) out.push(value);
  }
  return out;
}

/**
 * Convenience `cache(key, options?, block)` — mirrors the private
 * helper in `AbstractController::Caching`. Delegates to
 * `cacheStore.fetch(expandedKey, options, block)` when caching is
 * configured; otherwise just runs `block`.
 *
 * The Rails impl calls `ActiveSupport::Cache.expand_cache_key(key, :controller)`.
 * Trails doesn't yet expose a public `expandCacheKey` helper, so we
 * inline the same shape: stringify the key and prepend the
 * `"controller/"` namespace fragment so the on-disk layout matches.
 */
export function cache<T>(this: CachingHost, key: unknown, options: CacheOptions, block: () => T): T;
export function cache<T>(this: CachingHost, key: unknown, block: () => T): T;
export function cache<T>(
  this: CachingHost,
  key: unknown,
  optionsOrBlock: CacheOptions | (() => T),
  maybeBlock?: () => T,
): T {
  const block = typeof optionsOrBlock === "function" ? (optionsOrBlock as () => T) : maybeBlock!;
  const options = typeof optionsOrBlock === "function" ? ({} as CacheOptions) : optionsOrBlock;

  if (!cacheConfigured(this)) return block();

  const store = this.constructor.cacheStore!;
  const expanded = expandControllerCacheKey(key);
  return store.fetch(expanded, options, block) as T;
}

/**
 * Tiny stand-in for `ActiveSupport::Cache.expand_cache_key(key, :controller)`.
 * Mirrors the shape (`"<namespace>/<flattened-key>"`) without pulling in
 * the full Rails helper, which isn't ported yet.
 */
function expandControllerCacheKey(key: unknown): string {
  const flat = Array.isArray(key) ? key.map(stringify).join("/") : stringify(key);
  return `controller/${flat}`;
}

function stringify(part: unknown): string {
  if (part == null) return "";
  if (typeof part === "string") return part;
  if (typeof part === "number" || typeof part === "boolean" || typeof part === "bigint") {
    return String(part);
  }
  // Match Rails' `cache_key` convention where objects implement it; fall
  // back to JSON for plain objects so the key is at least deterministic.
  const maybe = (part as { cacheKey?: () => string }).cacheKey;
  if (typeof maybe === "function") return maybe.call(part);
  try {
    return JSON.stringify(part) ?? "";
  } catch {
    return String(part);
  }
}
