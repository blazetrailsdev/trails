/**
 * ActionDispatch::Http::Cache
 *
 * Mirrors `ActionDispatch::Http::Cache::Request` / `::Response`: conditional-GET
 * helpers (`If-Modified-Since` / `If-None-Match`), ETag generation, and
 * `Cache-Control` normalization. Reference: rfc7232#section-6.
 */

import { getCrypto } from "@blazetrails/activesupport";

const HTTP_IF_MODIFIED_SINCE = "If-Modified-Since";
const HTTP_IF_NONE_MATCH = "If-None-Match";
const DATE = "Date";
const LAST_MODIFIED = "Last-Modified";
const ETAG = "ETag";
const CACHE_CONTROL = "Cache-Control";
// prettier-ignore
const SPECIAL_KEYS = new Set(["extras", "no-store", "no-cache", "max-age", "public", "private", "must-revalidate"]);
const DEFAULT_CACHE_CONTROL = "max-age=0, private, must-revalidate";
const NO_STORE = "no-store",
  NO_CACHE = "no-cache",
  PUBLIC = "public",
  PRIVATE = "private";
const MUST_REVALIDATE = "must-revalidate",
  IMMUTABLE = "immutable";

export const CacheConfig = { strictFreshness: false };

// --- Request -----------------------------------------------------------------

export interface RequestCacheHost {
  getHeader(name: string): string | undefined;
}

export interface CacheResponseLike {
  etag?: string;
  lastModified?: Date;
}

export function ifModifiedSince(this: RequestCacheHost): Date | undefined {
  const since = this.getHeader(HTTP_IF_MODIFIED_SINCE);
  if (!since) return undefined;
  const t = Date.parse(since);
  // boundary: HTTP-date wire-format header value parsed as JS Date.
  return Number.isNaN(t) ? undefined : new Date(t);
}

export function ifNoneMatch(this: RequestCacheHost): string | undefined {
  return this.getHeader(HTTP_IF_NONE_MATCH);
}

export function ifNoneMatchEtags(this: RequestCacheHost): string[] {
  const h = ifNoneMatch.call(this);
  return h ? h.split(",").map((s) => s.trim()) : [];
}

export function notModified(this: RequestCacheHost, modifiedAt: Date | undefined): boolean {
  const since = ifModifiedSince.call(this);
  return !!(since && modifiedAt && since.getTime() >= modifiedAt.getTime());
}

export function etagMatches(this: RequestCacheHost, etag: string | undefined): boolean {
  if (!etag) return false;
  const v = ifNoneMatchEtags.call(this);
  return v.includes(etag) || v.includes("*");
}

export function fresh(this: RequestCacheHost, response: CacheResponseLike): boolean {
  if (CacheConfig.strictFreshness) {
    if (ifNoneMatch.call(this)) return etagMatches.call(this, response.etag);
    if (ifModifiedSince.call(this)) return notModified.call(this, response.lastModified);
    return false;
  }
  const lm = ifModifiedSince.call(this);
  const et = ifNoneMatch.call(this);
  if (!lm && !et) return false;
  let ok = true;
  if (lm) ok &&= notModified.call(this, response.lastModified);
  if (et) ok &&= etagMatches.call(this, response.etag);
  return ok;
}

// --- Response ----------------------------------------------------------------

export interface ResponseCacheHost {
  getHeader(key: string): string | undefined;
  setHeader(key: string, value: string): void;
  hasHeader?(key: string): boolean;
}

function hdrSet(host: ResponseCacheHost, key: string): boolean {
  return host.hasHeader ? host.hasHeader(key) : host.getHeader(key) !== undefined;
}

function parseHttpDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  // boundary: HTTP-date wire-format header value parsed as JS Date.
  return Number.isNaN(t) ? undefined : new Date(t);
}

type R = ResponseCacheHost;
export function getLastModified(this: R) {
  return parseHttpDate(this.getHeader(LAST_MODIFIED));
}
export function hasLastModified(this: R) {
  return hdrSet(this, LAST_MODIFIED);
}
export function setLastModified(this: R, t: Date) {
  this.setHeader(LAST_MODIFIED, t.toUTCString());
}
export function getDate(this: R) {
  return parseHttpDate(this.getHeader(DATE));
}
export function hasDate(this: R) {
  return hdrSet(this, DATE);
}
export function setDate(this: R, t: Date) {
  this.setHeader(DATE, t.toUTCString());
}
export function setEtag(this: R, v: unknown) {
  setWeakEtag.call(this, v);
}
export function setWeakEtag(this: R, v: unknown) {
  this.setHeader(ETAG, generateWeakEtag(v));
}
export function setStrongEtag(this: R, v: unknown) {
  this.setHeader(ETAG, generateStrongEtag(v));
}
export function getEtag(this: R) {
  return this.getHeader(ETAG);
}
export function hasEtag(this: R) {
  return !!getEtag.call(this);
}
export function isWeakEtag(this: R) {
  const e = getEtag.call(this);
  return !!e && e.startsWith('W/"');
}
export function isStrongEtag(this: R) {
  return hasEtag.call(this) && !isWeakEtag.call(this);
}

/** @internal */
export function generateWeakEtag(validators: unknown): string {
  return `W/${generateStrongEtag(validators)}`;
}
/** @internal */
export function generateStrongEtag(validators: unknown): string {
  return `"${getCrypto().createHash("md5").update(expandCacheKey(validators)).digest("hex").slice(0, 32)}"`;
}

/** @internal Minimal ActiveSupport::Cache.expand_cache_key analogue. */
function expandCacheKey(key: unknown): string {
  if (Array.isArray(key)) return key.map(expandCacheKey).join("/");
  if (key == null) return "";
  if (typeof key === "object") {
    const obj = key as { cacheKey?: () => string };
    if (typeof obj.cacheKey === "function") return obj.cacheKey();
  }
  return String(key);
}

/** @internal */
export function cacheControlSegments(this: ResponseCacheHost): string[] | undefined {
  const cc = this.getHeader(CACHE_CONTROL);
  return cc ? cc.replace(/ /g, "").split(",") : undefined;
}

export type CacheControlHash = Record<string, unknown> & { extras?: string[] };

/** @internal */
export function cacheControlHeaders(this: ResponseCacheHost): CacheControlHash {
  const result: CacheControlHash = {};
  const segments = cacheControlSegments.call(this);
  if (!segments) return result;
  for (const segment of segments) {
    const eq = segment.indexOf("=");
    const directive = eq === -1 ? segment : segment.slice(0, eq);
    const argument = eq === -1 ? undefined : segment.slice(eq + 1);
    if (SPECIAL_KEYS.has(directive)) {
      result[directive.replace(/-/g, "_")] = argument ?? true;
    } else {
      (result.extras ??= []).push(segment);
    }
  }
  return result;
}

/** Rails' `attr_reader :cache_control` — returns the parsed hash. */
export function cacheControl(this: ResponseCacheHost): CacheControlHash {
  return cacheControlHeaders.call(this);
}

/** @internal */
export function prepareCacheControl(this: ResponseCacheHost): CacheControlHash {
  return cacheControlHeaders.call(this);
}

export function handleConditionalGet(this: ResponseCacheHost): void {
  if ((hasEtag.call(this) || hasLastModified.call(this)) && !this.getHeader(CACHE_CONTROL)) {
    this.setHeader(CACHE_CONTROL, DEFAULT_CACHE_CONTROL);
  }
}

/** @internal */
export function mergeAndNormalizeCacheControl(
  this: ResponseCacheHost,
  cacheControl: CacheControlHash,
): void {
  const control = cacheControlHeaders.call(this);
  const ccKeys = Object.keys(cacheControl);
  if (Object.keys(control).length === 0 && ccKeys.length === 0) return;

  if (ccKeys.length > 0) {
    delete control.no_cache;
    delete control.no_store;
    if (control.extras) {
      cacheControl.extras = [
        ...new Set([...(cacheControl.extras ?? []), ...(control.extras as string[])]),
      ];
      delete control.extras;
    }
    Object.assign(control, cacheControl);
  }

  const options: string[] = [];
  if (control.no_store) {
    if (control.private) options.push(PRIVATE);
    options.push(NO_STORE);
  } else if (control.no_cache) {
    if (control.public) options.push(PUBLIC);
    options.push(NO_CACHE);
    if (control.extras) options.push(...(control.extras as string[]));
  } else {
    const max = control.max_age;
    const swr = control.stale_while_revalidate;
    const sie = control.stale_if_error;
    if (max !== undefined) options.push(`max-age=${parseInt(String(max), 10) || 0}`);
    options.push(control.public ? PUBLIC : PRIVATE);
    if (control.must_revalidate) options.push(MUST_REVALIDATE);
    if (swr !== undefined) options.push(`stale-while-revalidate=${parseInt(String(swr), 10) || 0}`);
    if (sie !== undefined) options.push(`stale-if-error=${parseInt(String(sie), 10) || 0}`);
    if (control.immutable) options.push(IMMUTABLE);
    if (control.extras) options.push(...(control.extras as string[]));
  }
  this.setHeader(CACHE_CONTROL, options.join(", "));
}
