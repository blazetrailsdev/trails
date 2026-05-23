/**
 * ActionController::EtagWithFlash
 *
 * When the flash is set, includes its contents in the ETag so that
 * flash-dependent views properly bust caches.
 * @see https://api.rubyonrails.org/classes/ActionController/EtagWithFlash.html
 */

import {
  combineEtags as _combineEtags,
  httpCacheForever as _httpCacheForever,
  includeContent as _includeContent,
  noStore as _noStore,
  type ConditionalGetHost,
} from "./conditional-get.js";

/**
 * Rails `Head#include_content?` — re-exposed because `EtagWithFlash` includes
 * `ConditionalGet` which includes `Head`.
 * @internal
 */
export function includeContent(status: number): boolean {
  return _includeContent(status);
}

/** Rails `ConditionalGet#http_cache_forever` — re-exposed via include chain. */
export function httpCacheForever(
  this: ConditionalGetHost,
  options: { public?: boolean } = {},
  block?: () => void,
): void {
  return _httpCacheForever.call(this, options, block);
}

/** Rails `ConditionalGet#no_store` — re-exposed via include chain. */
export function noStore(this: ConditionalGetHost): void {
  return _noStore.call(this);
}

/**
 * Rails `ConditionalGet#combine_etags` — re-exposed via include chain.
 * @internal
 */
export function combineEtags(
  this: unknown,
  validator: unknown,
  options: Record<string, unknown> = {},
): unknown[] {
  return _combineEtags.call(this, validator, options);
}

// Rails: `etag { flash if request.respond_to?(:flash) && !flash.empty? }`
// Rails passes the flash object itself to the ETagger (serialized via expand_cache_key).
// That includes flash.now entries — they live in @flashes until swept, so the ETag
// correctly changes when flash.now changes. toHash() replicates this: it returns all
// of @flashes (including flash.now entries). toSessionValue() would be wrong here —
// it calls @flashes.except(*@discard) which strips flash.now entries before hashing.
export function flashEtagger(request: {
  flash?: {
    empty?: boolean;
    toHash?(): unknown;
  };
}): unknown | undefined {
  const flash = request.flash;
  if (!flash || flash.empty) return undefined;
  return flash.toHash ? flash.toHash() : flash;
}
