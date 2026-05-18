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
  return parseRfc2822Date(this.getHeader(HTTP_IF_MODIFIED_SINCE));
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

const RFC1123_RE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const RFC2822_ZONE_RE = /^(?:GMT|UT|UTC|Z|[+-]\d{4}|EDT|EST|CDT|CST|MDT|MST|PDT|PST)$/;

/**
 * Parse an RFC 2822 date — Rails' `Time.rfc2822` is used by
 * `ActionDispatch::Http::Cache::Request#if_modified_since`. Accepts numeric
 * zone offsets (`+0000`, `-0500`) and the obsolete zone names from RFC 2822
 * §4.3, plus `GMT` which is what real-world HTTP clients send.
 *
 * @internal
 */
export function parseRfc2822Date(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m =
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2,4}) (\d{2}):(\d{2}):(\d{2}) (\S+)$/.exec(
      s,
    );
  if (!m) return undefined;
  const [, day, mon, yr, hh, mm, ss, zone] = m;
  if (!RFC2822_ZONE_RE.test(zone)) return undefined;
  const d = Number(day),
    h = Number(hh),
    mi = Number(mm),
    s2 = Number(ss);
  // Rails' Time.rfc2822 raises ArgumentError on out-of-range components.
  if (d < 1 || d > 31 || h > 23 || mi > 59 || s2 > 60) return undefined;
  let year = Number(yr);
  if (year < 50) year += 2000;
  else if (year < 1000) year += 1900;
  // Round-trip-validate calendar day (rejects 31 Feb, 30 Feb, etc.).
  // boundary: probe Date used only to read normalized UTC components.
  const probe = new Date(Date.UTC(year, MONTHS[mon], d));
  if (probe.getUTCMonth() !== MONTHS[mon] || probe.getUTCDate() !== d) return undefined;
  let offsetMin = 0;
  if (/^[+-]\d{4}$/.test(zone)) {
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(3, 5));
    if (oh > 23 || om > 59) return undefined;
    const sign = zone[0] === "-" ? -1 : 1;
    offsetMin = sign * (oh * 60 + om);
  } else if (zone === "EDT") offsetMin = -4 * 60;
  else if (zone === "EST" || zone === "CDT") offsetMin = -5 * 60;
  else if (zone === "CST" || zone === "MDT") offsetMin = -6 * 60;
  else if (zone === "MST" || zone === "PDT") offsetMin = -7 * 60;
  else if (zone === "PST") offsetMin = -8 * 60;
  const t = Date.UTC(year, MONTHS[mon], Number(day), Number(hh), Number(mm), Number(ss));
  if (Number.isNaN(t)) return undefined;
  // boundary: HTTP-date wire-format header value parsed as JS Date.
  return new Date(t - offsetMin * 60_000);
}

/**
 * Parse an HTTP-date header value, strict RFC 1123 (IMF-fixdate) per RFC 9110.
 * Returns undefined for any non-conforming value — including the obsolete
 * RFC 850 and asctime forms, and any locale-sensitive `Date.parse` interpretations.
 *
 * Rails' `Time.httpdate` is similarly strict (accepts only RFC 1123 / RFC 2616).
 *
 * @internal
 */
export function parseHttpDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = RFC1123_RE.exec(s);
  if (!m) return undefined;
  const [, day, mon, year, hh, mm, ss] = m;
  const d = Number(day),
    h = Number(hh),
    mi = Number(mm),
    s2 = Number(ss);
  // Rails' Time.httpdate raises ArgumentError on out-of-range components.
  if (d < 1 || d > 31 || h > 23 || mi > 59 || s2 > 60) return undefined;
  const yr = Number(year);
  // Round-trip-validate calendar day (rejects 31 Feb, 30 Feb, etc.).
  // boundary: probe Date used only to read normalized UTC components.
  const probe = new Date(Date.UTC(yr, MONTHS[mon], d));
  if (probe.getUTCMonth() !== MONTHS[mon] || probe.getUTCDate() !== d) return undefined;
  const t = Date.UTC(yr, MONTHS[mon], d, h, mi, s2);
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
