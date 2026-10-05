/**
 * ActionController::ConditionalGet
 *
 * Provides fresh_when, stale?, expires_in, expires_now, http_cache_forever, no_store.
 * @see https://api.rubyonrails.org/classes/ActionController/ConditionalGet.html
 *
 * @boundary-file: parses RFC 7231 `If-Modified-Since` / `Last-Modified` header
 *   strings via JS `Date.parse` semantics for the freshness comparison.
 */

import { Concern, Module, classAttribute, extend } from "@blazetrails/activesupport";
import { getCrypto } from "@blazetrails/ruby-compat";

import { includeContent as _includeContent } from "./head.js";

/** @internal */
export function includeContent(status: number): boolean {
  return _includeContent(status);
}

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
    maxAge: 100 * 365.25 * 24 * 60 * 60,
    public: options.public ?? false,
    immutable: true,
  });
  this.response.setHeader("cache-control", cc);
  block?.();
}

export function noStore(this: ConditionalGetHost): void {
  this.response.setHeader("cache-control", buildCacheControl({ noStore: true }));
}

export type Etagger = (this: unknown, options: Record<string, unknown>) => unknown;

export const ClassMethods = {
  etag(this: { etaggers: Etagger[] }, etagger: Etagger): void {
    this.etaggers = [...this.etaggers, etagger];
  },
};

/** @missingRailsCall include — CONVERGEABLE head-is-a-module-included-by-conditional-get-not-a-metal-method */
export const ConditionalGet = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      classAttribute.call(this, "etaggers", { default: [] });
    },
  );

  mod.defineMethod("httpCacheForever", httpCacheForever);
  mod.defineMethod("noStore", noStore);
  mod.defineMethod("combineEtags", combineEtags);
}) as Module<{
  httpCacheForever: typeof httpCacheForever;
  noStore: typeof noStore;
  combineEtags: typeof combineEtags;
}> & { ClassMethods: typeof ClassMethods };
ConditionalGet.ClassMethods = ClassMethods;

/** @internal */
export function combineEtags(
  this: { etaggers: Etagger[] },
  validator: unknown,
  options: Record<string, unknown> = {},
): unknown[] {
  return [validator, ...this.etaggers.map((etagger) => etagger.call(this, options))].filter(
    (e) => e !== null && e !== undefined,
  );
}
