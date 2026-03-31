/**
 * ActionController::EtagWithFlash
 *
 * When the flash is set, includes its contents in the ETag so that
 * flash-dependent views properly bust caches.
 * @see https://api.rubyonrails.org/classes/ActionController/EtagWithFlash.html
 */

export function flashEtagger(request: {
  flash?: {
    empty?: boolean;
    toJSON?(): unknown;
    toSessionValue?(): unknown;
    toHash?(): unknown;
  };
}): unknown | undefined {
  const flash = request.flash;
  if (!flash || flash.empty) return undefined;

  if (flash.toJSON) return flash.toJSON();
  if (flash.toSessionValue) return flash.toSessionValue();
  if (flash.toHash) return flash.toHash();
  return flash;
}
