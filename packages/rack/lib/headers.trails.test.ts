/**
 * trails-only cover for `rb_hash_default_value` (`vendor/ruby/v3.3.11/hash.c:2068`)
 * yielding the RECEIVER to the default_proc: `Rack::Headers < Hash`, so the
 * block sees the headers, not an inner seat.
 */
import { describe, it, expect } from "vitest";
import { Headers } from "./headers.js";

describe("Rack::Headers", () => {
  it("yields the headers themselves to the default_proc", () => {
    const h = new Headers();
    h.setDefaultProc((hash, k) => {
      expect(hash).toBe(h);
      return k;
    });
    expect(h.get("A")).toBe("a");
  });
});

describe("Rack::Headers#member? and #merge!", () => {
  it("answers member? case-insensitively and merges in place", () => {
    const h = new Headers();
    h.set("Content-Type", "text/plain");
    expect(h.isMember("CONTENT-TYPE")).toBe(true);
    expect(h.isMember("etag")).toBe(false);
    expect(h.mergeBang({ "Content-Type": "text/html", ETag: "x" }, (_k, o, n) => o + n)).toBe(h);
    expect(h.get("content-type")).toBe("text/plaintext/html");
    expect(h.get("etag")).toBe("x");
  });
});
