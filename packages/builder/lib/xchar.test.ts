import { describe, expect, it } from "vitest";
import { XChar } from "./xchar.js";

function toXs(string: string | Uint8Array, escape = true): string | Uint8Array {
  const result = XChar.encode(string);
  if (escape) {
    // eslint-disable-next-line no-control-regex
    return result.replace(/[^\u0000-\u007F]/gu, (c) => `&#${c.codePointAt(0)};`);
  } else {
    return new TextEncoder().encode(result);
  }
}

function binary(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

describe("TestXmlEscaping", () => {
  const REPLACEMENT_CHAR = toXs(XChar.REPLACEMENT_CHAR);

  it("ascii", () => {
    expect(toXs("abc")).toBe("abc");
  });

  it("predefined", () => {
    expect(toXs("&")).toBe("&amp;");
    expect(toXs("<")).toBe("&lt;");
    expect(toXs(">")).toBe("&gt;");
  });

  it("invalid", () => {
    expect(toXs("\x00")).toBe(REPLACEMENT_CHAR);
    expect(toXs("\x0C")).toBe(REPLACEMENT_CHAR);
    expect(toXs("￿")).toBe(REPLACEMENT_CHAR);
  });

  it("iso 8859 1", () => {
    expect(toXs(binary(0xe7))).toBe("&#231;");
    expect(toXs(binary(0xa9))).toBe("&#169;");
  });

  it("win 1252", () => {
    expect(toXs(binary(0x92))).toBe("&#8217;");
    expect(toXs(binary(0x80))).toBe("&#8364;");
  });

  it("utf8", () => {
    expect(toXs("’")).toBe("&#8217;");
    expect(toXs("©")).toBe("&#169;");
  });

  it("utf8 verbatim", () => {
    expect(toXs("’", false)).toEqual(binary(0xe2, 0x80, 0x99));
    expect(toXs("©", false)).toEqual(binary(0xc2, 0xa9));
    expect(toXs("©&©", false)).toEqual(
      binary(0xc2, 0xa9, 0x26, 0x61, 0x6d, 0x70, 0x3b, 0xc2, 0xa9),
    );
  });
});
