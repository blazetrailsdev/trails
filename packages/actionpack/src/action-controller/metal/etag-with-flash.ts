import {
  combineEtags as _combineEtags,
  httpCacheForever as _httpCacheForever,
  includeContent as _includeContent,
  noStore as _noStore,
  type ConditionalGetHost,
  type Etagger,
} from "./conditional-get.js";

/** @internal */
export function includeContent(status: number): boolean {
  return _includeContent(status);
}

export function httpCacheForever(
  this: ConditionalGetHost,
  options: { public?: boolean } = {},
  block?: () => void,
): void {
  return _httpCacheForever.call(this, options, block);
}

export function noStore(this: ConditionalGetHost): void {
  return _noStore.call(this);
}

/** @internal */
export function combineEtags(
  this: { etaggers: Etagger[] },
  validator: unknown,
  options: Record<string, unknown> = {},
): unknown[] {
  return _combineEtags.call(this, validator, options);
}

export function flashEtagger(request: {
  flash?: {
    isEmpty(): boolean;
    toHash?(): unknown;
  };
}): unknown | undefined {
  const flash = request.flash;
  if (!flash || flash.isEmpty()) return undefined;
  return flash.toHash ? flash.toHash() : flash;
}
