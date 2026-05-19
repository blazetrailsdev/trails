import { describe, expect, it } from "vitest";

import { Response } from "../response.js";
import {
  etagMatches,
  fresh,
  generateStrongEtag,
  generateWeakEtag,
  getLastModified,
  handleConditionalGetBang,
  isWeakEtag,
  mergeAndNormalizeCacheControlBang,
  notModified,
  setEtag,
  setLastModified,
  type RequestCacheHost,
} from "./cache.js";

const req = (h: Record<string, string> = {}): RequestCacheHost => ({ getHeader: (n) => h[n] });
// Real Response exercises the prototype-wired Cache::Response mixin
// (see ./response.ts; ../response.ts is a re-export shim). The
// case-insensitive header lookup in Response#getHeader means tests can
// assert via either casing.
const res = (h: Record<string, string> = {}): Response => new Response(200, h);

describe("Cache::Request", () => {
  it("not_modified? compares If-Modified-Since to modified_at", () => {
    const r = req({ "If-Modified-Since": "Sun, 06 Nov 1994 08:49:37 GMT" });
    expect(notModified.call(r, new Date("1994-11-06T08:49:36Z"))).toBe(true);
    expect(notModified.call(r, new Date("1994-11-06T08:49:38Z"))).toBe(false);
  });

  it("if_modified_since parses RFC 2822 numeric zone offsets (Time.rfc2822 parity)", () => {
    const r = req({ "If-Modified-Since": "Sun, 06 Nov 1994 03:49:37 -0500" });
    // Same instant as "Sun, 06 Nov 1994 08:49:37 GMT"
    expect(notModified.call(r, new Date("1994-11-06T08:49:36Z"))).toBe(true);
  });

  it("if_modified_since rejects malformed values (no permissive Date.parse fallback)", () => {
    const r = req({ "If-None-Match": '"abc"', "If-Modified-Since": "yesterday" });
    expect(fresh.call(r, { etag: '"abc"' })).toBe(true); // etag still matches
    // not_modified? returns false because the date is unparseable
    expect(notModified.call(r, new Date("1994-11-06T08:49:36Z"))).toBe(false);
  });

  it("etag_matches? handles list and wildcard", () => {
    expect(etagMatches.call(req({ "If-None-Match": '"a", "b"' }), '"a"')).toBe(true);
    expect(etagMatches.call(req({ "If-None-Match": "*" }), '"x"')).toBe(true);
    expect(etagMatches.call(req(), '"a"')).toBe(false);
  });

  it("fresh? requires both validators when both sent", () => {
    expect(fresh.call(req(), {})).toBe(false);
    const r = req({
      "If-Modified-Since": "Sun, 06 Nov 1994 08:49:37 GMT",
      "If-None-Match": '"abc"',
    });
    expect(fresh.call(r, { etag: '"abc"', lastModified: new Date("1994-11-06T08:49:36Z") })).toBe(
      true,
    );
    expect(fresh.call(r, { etag: '"xyz"', lastModified: new Date("1994-11-06T08:49:36Z") })).toBe(
      false,
    );
  });
});

describe("Cache::Response", () => {
  it("last_modified parses strict RFC 1123 (Time.httpdate parity)", () => {
    expect(getLastModified.call(res({ "Last-Modified": "Sun, 06 Nov 1994 08:49:37 GMT" }))).toEqual(
      new Date("1994-11-06T08:49:37Z"),
    );
  });

  it("last_modified rejects RFC 850 / asctime / numeric-zone forms (httpdate is strict)", () => {
    // RFC 850 form
    expect(
      getLastModified.call(res({ "Last-Modified": "Sunday, 06-Nov-94 08:49:37 GMT" })),
    ).toBeUndefined();
    // asctime form
    expect(
      getLastModified.call(res({ "Last-Modified": "Sun Nov  6 08:49:37 1994" })),
    ).toBeUndefined();
    // Numeric zone offset — valid RFC 2822 but rejected by Time.httpdate
    expect(
      getLastModified.call(res({ "Last-Modified": "Sun, 06 Nov 1994 08:49:37 -0500" })),
    ).toBeUndefined();
  });

  it("last_modified rejects out-of-range and impossible-calendar values", () => {
    expect(
      getLastModified.call(res({ "Last-Modified": "Sun, 99 Nov 1994 08:49:37 GMT" })),
    ).toBeUndefined();
    // 31 Feb — Date.UTC would silently roll into March
    expect(
      getLastModified.call(res({ "Last-Modified": "Tue, 31 Feb 2015 08:49:37 GMT" })),
    ).toBeUndefined();
  });

  it("etag= sets weak validator", () => {
    const r = res();
    setEtag.call(r, "foo");
    expect(r.getHeader("ETag")?.startsWith('W/"')).toBe(true);
    expect(isWeakEtag.call(r)).toBe(true);
  });

  it("generate_weak_etag wraps generate_strong_etag; arrays expand by '/'", () => {
    expect(generateWeakEtag("x")).toBe(`W/${generateStrongEtag("x")}`);
    expect(generateStrongEtag(["a", "b"])).toBe(generateStrongEtag("a/b"));
  });

  it("handle_conditional_get! sets default only when validator present and header missing", () => {
    const r = res();
    setEtag.call(r, "x");
    handleConditionalGetBang.call(r);
    expect(r.getHeader("Cache-Control")).toBe("max-age=0, private, must-revalidate");

    const r2 = res({ "Cache-Control": "public" });
    setEtag.call(r2, "x");
    handleConditionalGetBang.call(r2);
    expect(r2.getHeader("Cache-Control")).toBe("public");
  });

  it("merge_and_normalize_cache_control! emits directives in Rails order", () => {
    const r = res();
    mergeAndNormalizeCacheControlBang.call(r, { max_age: 60, public: true });
    expect(r.getHeader("Cache-Control")).toBe("max-age=60, public");

    const r2 = res();
    mergeAndNormalizeCacheControlBang.call(r2, { no_store: true, private: true });
    expect(r2.getHeader("Cache-Control")).toBe("private, no-store");

    const r3 = res({ "Cache-Control": "no-cache, community=internal" });
    mergeAndNormalizeCacheControlBang.call(r3, { max_age: 10, public: true });
    expect(r3.getHeader("Cache-Control")).toBe("max-age=10, public, community=internal");
  });

  it("last_modified= writes httpdate", () => {
    const r = res();
    setLastModified.call(r, new Date(Date.UTC(1994, 10, 6, 8, 49, 37)));
    expect(r.getHeader("Last-Modified")).toBe("Sun, 06 Nov 1994 08:49:37 GMT");
  });
});
