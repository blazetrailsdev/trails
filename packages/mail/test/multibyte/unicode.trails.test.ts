import { NoMethodError } from "@blazetrails/ruby-compat";
import { Chars } from "../../lib/multibyte/chars.js";
import { describe, expect, it } from "vitest";
import { Unicode } from "../../lib/multibyte/unicode.js";

describe("Mail::Multibyte::Unicode.tidy_bytes", () => {
  it("recodes CP1252 bytes and cleans an interrupted sequence back to its lead", () => {
    expect(Unicode.tidyBytes("café €")).toBe("café €");
    expect(Unicode.tidyBytes("a\udc93b")).toBe("a“b");
    expect(Unicode.tidyBytes("\udce9\udc80A")).toBe("é€A");
    expect(Unicode.tidyBytes("\udc93hi\udc94", true)).toBe("“hi”");
  });

  it("recodes every byte 0x80-0x9F as Ruby's Windows-1252 transcoder does", () => {
    const cp1252 = [
      0x20ac,
      null,
      0x201a,
      0x192,
      0x201e,
      0x2026,
      0x2020,
      0x2021,
      0x2c6,
      0x2030,
      0x160,
      0x2039,
      0x152,
      null,
      0x17d,
      null,
      null,
      0x2018,
      0x2019,
      0x201c,
      0x201d,
      0x2022,
      0x2013,
      0x2014,
      0x2dc,
      0x2122,
      0x161,
      0x203a,
      0x153,
      null,
      0x17e,
      0x178,
    ];
    cp1252.forEach((cp, i) => {
      const byte = 0x80 + i;
      expect(Unicode.tidyBytes(String.fromCharCode(0xdc00 + byte), true)).toBe(
        String.fromCodePoint(cp ?? byte),
      );
    });
  });

  it("raises NoMethodError where the backward clean reaches an already tidied byte", () => {
    expect(() => Unicode.tidyBytes("\udce0\udcf1a")).toThrow(NoMethodError);
  });
});

describe("Mail::Multibyte::Unicode reorder_characters", () => {
  it("reorders combining marks by combining class", () => {
    expect(Unicode.reorderCharacters([0x61, 0x301, 0x323])).toEqual([0x61, 0x323, 0x301]);
  });
});

describe("Mail::Multibyte::Chars strip bangs", () => {
  it("strips the wrapped string in place and returns self", () => {
    const chars = new Chars("  héllo  ");
    expect(chars.stripBang()).toBe(chars);
    expect(chars.toS()).toBe("héllo");
    expect(new Chars(" a ").lstripBang().toS()).toBe("a ");
    expect(new Chars(" a ").rstripBang().toS()).toBe(" a");
  });
});
