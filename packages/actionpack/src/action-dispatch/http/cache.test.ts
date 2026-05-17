import { describe, expect, it } from "vitest";

import {
  etagMatches,
  fresh,
  generateStrongEtag,
  generateWeakEtag,
  handleConditionalGet,
  isWeakEtag,
  mergeAndNormalizeCacheControl,
  notModified,
  setEtag,
  setLastModified,
  type RequestCacheHost,
  type ResponseCacheHost,
} from "./cache.js";

const req = (h: Record<string, string> = {}): RequestCacheHost => ({ getHeader: (n) => h[n] });
const res = (h: Record<string, string> = {}): ResponseCacheHost => ({
  getHeader: (k) => h[k],
  setHeader: (k, v) => {
    h[k] = v;
  },
});

describe("Cache::Request", () => {
  it("not_modified? compares If-Modified-Since to modified_at", () => {
    const r = req({ "If-Modified-Since": "Sun, 06 Nov 1994 08:49:37 GMT" });
    expect(notModified.call(r, new Date("1994-11-06T08:49:36Z"))).toBe(true);
    expect(notModified.call(r, new Date("1994-11-06T08:49:38Z"))).toBe(false);
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
  it("etag= sets weak validator", () => {
    const h: Record<string, string> = {};
    setEtag.call(res(h), "foo");
    expect(h.ETag.startsWith('W/"')).toBe(true);
    expect(isWeakEtag.call(res(h))).toBe(true);
  });

  it("generate_weak_etag wraps generate_strong_etag; arrays expand by '/'", () => {
    expect(generateWeakEtag("x")).toBe(`W/${generateStrongEtag("x")}`);
    expect(generateStrongEtag(["a", "b"])).toBe(generateStrongEtag("a/b"));
  });

  it("handle_conditional_get! sets default only when validator present and header missing", () => {
    const h: Record<string, string> = {};
    const r = res(h);
    setEtag.call(r, "x");
    handleConditionalGet.call(r);
    expect(h["Cache-Control"]).toBe("max-age=0, private, must-revalidate");

    const h2: Record<string, string> = { "Cache-Control": "public" };
    setEtag.call(res(h2), "x");
    handleConditionalGet.call(res(h2));
    expect(h2["Cache-Control"]).toBe("public");
  });

  it("merge_and_normalize_cache_control! emits directives in Rails order", () => {
    const h: Record<string, string> = {};
    mergeAndNormalizeCacheControl.call(res(h), { max_age: 60, public: true });
    expect(h["Cache-Control"]).toBe("max-age=60, public");

    const h2: Record<string, string> = {};
    mergeAndNormalizeCacheControl.call(res(h2), { no_store: true, private: true });
    expect(h2["Cache-Control"]).toBe("private, no-store");

    const h3: Record<string, string> = { "Cache-Control": "no-cache, community=internal" };
    mergeAndNormalizeCacheControl.call(res(h3), { max_age: 10, public: true });
    expect(h3["Cache-Control"]).toBe("max-age=10, public, community=internal");
  });

  it("last_modified= writes httpdate", () => {
    const h: Record<string, string> = {};
    setLastModified.call(res(h), new Date(Date.UTC(1994, 10, 6, 8, 49, 37)));
    expect(h["Last-Modified"]).toBe("Sun, 06 Nov 1994 08:49:37 GMT");
  });
});
