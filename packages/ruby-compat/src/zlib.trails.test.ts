import { describe, expect, it } from "vitest";

import { Zlib } from "./zlib.js";

/**
 * Expected values are MRI's, from
 * `ruby -rzlib -e 'puts Zlib.crc32(...)'` against
 * `vendor/ruby/ext/zlib/zlib.c:507`.
 */
describe("Zlib.crc32", () => {
  it("answers 0 for no argument and for the empty string", () => {
    expect(Zlib.crc32()).toBe(0);
    expect(Zlib.crc32("")).toBe(0);
  });

  it("answers MRI's checksum for an ASCII string", () => {
    expect(Zlib.crc32("hello")).toBe(907060870);
    expect(Zlib.crc32("The quick brown fox")).toBe(3074782430);
    expect(Zlib.crc32("blog_development")).toBe(434552276);
    expect(Zlib.crc32("logo.png")).toBe(2915011424);
  });

  it("checksums the bytes of a multibyte string", () => {
    expect(Zlib.crc32("héllo")).toBe(2654700086);
  });

  it("continues from the given crc", () => {
    expect(Zlib.crc32("abc", 42)).toBe(16679668);
    expect(Zlib.crc32("lo", Zlib.crc32("hel"))).toBe(Zlib.crc32("hello"));
  });
});
