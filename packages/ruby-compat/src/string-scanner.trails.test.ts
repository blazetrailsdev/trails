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

  it("scan anchors ^ at the scan pointer", () => {
    const s = new StringScanner("ab");
    expect(s.scan(/^a/)).toBe("a");
    expect(s.scan(/^b/)).toBe("b");
  });

  it("scanUntil searches the rest of the string and records the match", () => {
    const s = new StringScanner("a <num>12 and <num>3 x");
    expect(s.scanUntil(/<num>(\d+)( | and )<num>(\d+)/)).toBe("a <num>12 and <num>3");
    expect(s.pos).toBe(20);
    expect(s.matchedSize()).toBe(18);
    expect(s.get(1)).toBe("12");
    expect(s.get(2)).toBe(" and ");
    expect(s.get(3)).toBe("3");
    expect(s.get(4)).toBeNull();
    expect(s.get(-1)).toBe("3");
  });

  it("string= and reset rewind the pointer and clear the match", () => {
    const s = new StringScanner("abc");
    s.scanUntil(/b/);
    s.string = "xy";
    expect(s.pos).toBe(0);
    expect(s.get(0)).toBeNull();
    s.scan(/x/);
    s.reset();
    expect(s.pos).toBe(0);
    expect(s.get(0)).toBeNull();
    expect(s.scanUntil(/z/)).toBeNull();
    expect(s.matchedSize()).toBeNull();
  });
});
