/**
 * trails-only cover for `rb_hash_default_value` (`vendor/ruby/hash.c:2068`)
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
