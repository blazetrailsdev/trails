/**
 * `AbstractController::Caching::Fragments` — fragment-level cache reads,
 * writes, existence checks, and expiry, plus the `combinedFragmentCacheKey`
 * helper that controllers use to namespace keys. Hosts may override
 * `instrumentName` / `instrumentPayload` (abstract in Rails, supplied by
 * `ActionController::Caching`); defaults are namespace `"abstract_controller"`
 * and payload `{ key }`. Rails' `.html_safe` step on `readFragment` results
 * is a no-op here — trails has no html-safe marker.
 *
 * Ported from `vendor/rails/actionpack/lib/abstract_controller/caching/fragments.rb`.
 *
 * @internal
 */

import { Notifications } from "@blazetrails/activesupport";
import type { CacheOptions, CacheStore } from "@blazetrails/activesupport";

// `cacheConfigured` is duplicated here (it also lives in `caching.ts`) so
// the module graph stays acyclic: `caching.ts` now imports fragment wrappers
// from this file to republish them on the `Caching` surface (per Rails'
// `include AbstractController::Caching::Fragments`), and an import in the
// other direction would create a cycle. The predicate is a trivial two-property
// check — the duplication is cheaper than threading it through a third file.
function cacheConfigured(host: FragmentsHost): boolean {
  const cls = host.constructor;
  return Boolean(cls.performCaching && cls.cacheStore);
}

export type FragmentCacheKeyBlock = (this: FragmentsHost) => unknown;

export interface FragmentsClassMethods {
  fragmentCacheKeys?: FragmentCacheKeyBlock[];
  cacheStore?: CacheStore | null;
  performCaching?: boolean;
}

export interface FragmentsHost {
  constructor: FragmentsClassMethods;
  // Widened to `unknown` so hosts with a string-form `urlFor` (e.g.
  // `ActionController::Metal`) still satisfy the host interface. Rails'
  // `url_for` likewise accepts strings, hashes, arrays, or nil.
  urlFor?(options: unknown): string;
  instrumentName?(): string;
  instrumentPayload?(key: unknown): Record<string, unknown>;
}

/**
 * Marks a host class as conforming to the fragments slot contract.
 * No-op at runtime — mirrors `applyAssetPaths` / `applyCaching`. Seeding
 * an own `fragmentCacheKeys = []` here would shadow an inherited list
 * on subclasses; instead `fragmentCacheKey` and reads treat `undefined`
 * as an empty list, preserving Rails' `class_attribute` copy-on-write.
 */
export function applyFragments<T extends new (...args: never[]) => unknown>(
  _cls: T & Partial<FragmentsClassMethods>,
): void {
  // Intentionally empty.
}

export function fragmentCacheKey(
  cls: FragmentsClassMethods,
  valueOrBlock: unknown | FragmentCacheKeyBlock,
  block?: FragmentCacheKeyBlock,
): void {
  const entry: FragmentCacheKeyBlock =
    block ??
    (typeof valueOrBlock === "function"
      ? (valueOrBlock as FragmentCacheKeyBlock)
      : () => valueOrBlock);
  cls.fragmentCacheKeys = [...(cls.fragmentCacheKeys ?? []), entry];
}

export function combinedFragmentCacheKey(this: FragmentsHost, key: unknown): unknown[] {
  const heads = (this.constructor.fragmentCacheKeys ?? []).map((k) => k.call(this));
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  // Rails uses `||` here (`ENV["RAILS_CACHE_ID"] || ENV["RAILS_APP_VERSION"]`),
  // so empty strings fall through — not `??`.
  const version = env?.RAILS_CACHE_ID || env?.RAILS_APP_VERSION || null;

  let tail: unknown;
  if (isPlainObject(key)) {
    if (typeof this.urlFor !== "function") {
      throw new TypeError("combinedFragmentCacheKey: hash key requires a host with `urlFor`");
    }
    const url = this.urlFor(key);
    if (typeof url !== "string") {
      throw new TypeError(
        `combinedFragmentCacheKey: urlFor must return a string, got ${typeof url}`,
      );
    }
    const idx = url.indexOf("://");
    tail = idx >= 0 ? url.slice(idx + 3) : url;
  } else {
    tail = key;
  }

  const out: unknown[] = ["views", version];
  for (const h of heads) flattenOne(out, h);
  flattenOne(out, tail);
  return out.filter((v) => v != null);
}

function flattenOne(out: unknown[], value: unknown): void {
  if (Array.isArray(value)) for (const v of value) out.push(v);
  else out.push(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function writeFragment(
  this: FragmentsHost,
  key: unknown,
  content: string,
  options?: CacheOptions,
): string {
  if (!cacheConfigured(this)) return content;
  const combined = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache(this, "write_fragment", combined, () => {
    this.constructor.cacheStore!.write(combined, content, options);
    return content;
  });
}

export function readFragment(this: FragmentsHost, key: unknown, options?: CacheOptions): unknown {
  if (!cacheConfigured(this)) return undefined;
  const combined = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache(this, "read_fragment", combined, () =>
    this.constructor.cacheStore!.read(combined, options),
  );
}

// `_options` on fragmentExist / expireFragment: Rails forwards options
// to `cache_store.exist?` / `delete` / `delete_matched`, but the trails
// `CacheStore` interface in activesupport doesn't accept options on
// those methods. Follow-up: widen `CacheStore.exist` / `delete` /
// `deleteMatched` signatures, then drop the `_` prefix here.
export function fragmentExist(
  this: FragmentsHost,
  key: unknown,
  _options?: CacheOptions,
): boolean | undefined {
  if (!cacheConfigured(this)) return undefined;
  const combined = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache(this, "exist_fragment?", combined, () =>
    this.constructor.cacheStore!.exist(combined),
  );
}

export function expireFragment(
  this: FragmentsHost,
  key: unknown,
  _options?: CacheOptions,
): unknown {
  if (!cacheConfigured(this)) return undefined;
  const store = this.constructor.cacheStore!;
  if (key instanceof RegExp) {
    return instrumentFragmentCache(this, "expire_fragment", key, () => store.deleteMatched(key));
  }
  const combined = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache(this, "expire_fragment", combined, () => store.delete(combined));
}

export function instrumentFragmentCache<T>(
  host: FragmentsHost,
  name: string,
  key: unknown,
  block: () => T,
): T {
  const ns = host.instrumentName?.() ?? "abstract_controller";
  const payload = host.instrumentPayload?.(key) ?? { key };
  return Notifications.instrument(`${name}.${ns}`, payload, block) as T;
}

function stringifyKey(parts: unknown[]): string {
  return parts.map(stringifyPart).join("/");
}

function stringifyPart(part: unknown): string {
  if (part == null) return "";
  if (typeof part === "string") return part;
  if (typeof part === "number" || typeof part === "boolean" || typeof part === "bigint") {
    return String(part);
  }
  const maybe = (part as { cacheKey?: () => string }).cacheKey;
  if (typeof maybe === "function") return maybe.call(part);
  try {
    return JSON.stringify(part) ?? "";
  } catch {
    return String(part);
  }
}
