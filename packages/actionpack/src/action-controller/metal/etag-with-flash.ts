/**
 * ActionController::EtagWithFlash
 *
 * When the flash is set, includes its contents in the ETag so that
 * flash-dependent views properly bust caches.
 * @see https://api.rubyonrails.org/classes/ActionController/EtagWithFlash.html
 */

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
