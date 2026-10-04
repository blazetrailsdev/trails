import { describe, expect, it } from "vitest";
import { StringScanner } from "./string-scanner.js";

describe("StringScanner", () => {
  // vendor/ruby/v3.3.11/ext/strscan/strscan.c:667-678, the `scan` call-seq.
  it("scan anchors at the scan pointer and advances past each match", () => {
    const s = new StringScanner("test string");
    expect(s.scan(/\w+/)).toBe("test");
    expect(s.scan(/\w+/)).toBeNull();
    expect(s.scan(/\s+/)).toBe(" ");
    expect(s.scan(/\w+/)).toBe("string");
    expect(s.scan(/./)).toBeNull();
  });

  it("scan ignores a pattern's own global and sticky state", () => {
    const re = /[/.?]|[^/.?]+/g;
    const s = new StringScanner("/a.b");
    expect([s.scan(re), s.scan(re), s.scan(re), s.scan(re), s.scan(re)]).toEqual([
      "/",
      "a",
      ".",
      "b",
      null,
    ]);
  });

  // vendor/ruby/v3.3.11/ext/strscan/strscan.c:709-722, the `skip` call-seq.
  it("skip answers the matched length and eos? the end of the string", () => {
    const s = new StringScanner("test string");
    expect(s.skip(/\w+/)).toBe(4);
    expect(s.skip(/\w+/)).toBeNull();
    expect(s.isEos()).toBe(false);
    expect(s.skip(/\s+/)).toBe(1);
    expect(s.skip(/\w+/)).toBe(6);
    expect(s.isEos()).toBe(true);
    expect(s.string).toBe("test string");
  });
});
