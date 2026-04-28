/**
 * ActionController::ConditionalGet
 *
 * Provides fresh_when, stale?, expires_in, expires_now, http_cache_forever, no_store.
 * @see https://api.rubyonrails.org/classes/ActionController/ConditionalGet.html
 */

import { getCrypto } from "@blazetrails/activesupport";

export function generateWeakEtag(seed: string): string {
  const hash = getCrypto().createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `W/"${hash}"`;
}

export function generateStrongEtag(seed: string): string {
  const hash = getCrypto().createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `"${hash}"`;
}

export function isFresh(
  request: {
    getHeader(name: string): string | undefined;
  },
  response: {
    getHeader(name: string): string | undefined;
  },
): boolean {
  const ifNoneMatch = request.getHeader("if-none-match");
  const ifModifiedSince = request.getHeader("if-modified-since");
  const etag = response.getHeader("etag");
  const lastModified = response.getHeader("last-modified");

  if (ifNoneMatch && etag) {
    if (ifNoneMatch === "*") return true;
    const clientTags = ifNoneMatch.split(",").map((t) => t.trim());
    const normalizedEtag = etag.replace(/^W\//, "");
    return clientTags.some((t) => t === etag || t.replace(/^W\//, "") === normalizedEtag);
  }
  if (ifModifiedSince && lastModified) {
    return new Date(ifModifiedSince) >= new Date(lastModified);
  }
  return false;
}

export function buildCacheControl(options: {
  maxAge?: number;
  public?: boolean;
  mustRevalidate?: boolean;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  immutable?: boolean;
  noCache?: boolean;
  noStore?: boolean;
}): string {
  const parts: string[] = [];

  if (options.noStore) {
    parts.push("no-store");
    return parts.join(", ");
  }

  if (options.noCache) {
    parts.push("no-cache");
    return parts.join(", ");
  }

  if (options.maxAge !== undefined) parts.push(`max-age=${options.maxAge}`);
  if (options.public) parts.push("public");
  else parts.push("private");
  if (options.mustRevalidate) parts.push("must-revalidate");
  if (options.staleWhileRevalidate !== undefined)
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  if (options.staleIfError !== undefined) parts.push(`stale-if-error=${options.staleIfError}`);
  if (options.immutable) parts.push("immutable");

  return parts.join(", ");
}

export interface ConditionalGetHost {
  response: {
    setHeader(name: string, value: string): void;
    getHeader(name: string): string | undefined;
  };
}

export function httpCacheForever(
  this: ConditionalGetHost,
  options: { public?: boolean } = {},
  block?: () => void,
): void {
  const cc = buildCacheControl({
    maxAge: 100 * 365.25 * 24 * 60 * 60, // 100 years in seconds
    public: options.public ?? false,
    immutable: true,
  });
  this.response.setHeader("cache-control", cc);
  block?.();
}

export function noStore(this: ConditionalGetHost): void {
  this.response.setHeader("cache-control", buildCacheControl({ noStore: true }));
}

type Etagger = (this: unknown, options: Record<string, unknown>) => unknown;

const _etaggers: Etagger[] = [];

export function etag(block: Etagger): void {
  _etaggers.push(block);
}

export function getEtaggers(): ReadonlyArray<Etagger> {
  return _etaggers;
}

/** Clear the registered etaggers. Test seam; mirrors `clearDefaultHeaders`. */
export function clearEtaggers(): void {
  _etaggers.length = 0;
}

/**
 * Mirrors Rails:
 *   def combine_etags(validator, options)
 *     [validator, *etaggers.map { |etagger| instance_exec(options, &etagger) }].compact
 *   end
 *
 * Ruby's `compact` only drops nil — it keeps `false`, `0`, `""`. We match that
 * with `!= null` (drops null/undefined only) rather than `.filter(Boolean)`,
 * which would also drop empty strings and zeros.
 *
 * Rails etaggers can return any object (template digest, model record,
 * arbitrary marker) — `response.weak_etag=` / `strong_etag=` serialize the
 * resulting array. So both validator and the result are typed as `unknown`,
 * not `string`, to keep the door open for parity etaggers like
 * `etag_with_template_digest`.
 *
 * Rails uses `instance_exec(options, &etagger)` so the etagger block runs
 * with the controller as `self`. We mirror that by accepting the controller
 * via `this` and dispatching with `etagger.call(this, options)`. Callers
 * (e.g. `freshWhen`) bind `this` to the controller; tests bind to a stub or
 * leave it `undefined`.
 */
export function combineEtags(
  this: unknown,
  validator: unknown,
  options: Record<string, unknown> = {},
): unknown[] {
  return [validator, ..._etaggers.map((etagger) => etagger.call(this, options))].filter(
    (e) => e !== null && e !== undefined,
  );
}
