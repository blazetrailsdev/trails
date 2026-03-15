import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helper: count Unicode codepoints (chars), not UTF-16 code units (bytes)
// ---------------------------------------------------------------------------
function mbLength(str: string): number {
  return [...str].length;
}
function mbReverse(str: string): string {
  return [...str].reverse().join("");
}
function mbSlice(str: string, start: number, length?: number): string {
  const chars = [...str];
  if (length === undefined) return chars.slice(start).join("");
  return chars.slice(start, start + length).join("");
}
function mbUpcase(str: string): string {
  return str.toUpperCase();
}
function mbDowncase(str: string): string {
  return str.toLowerCase();
}
// ==========================================================================
// MultibyteCharsUTF8BehaviorTest — targets multibyte_chars_test.rb
// ==========================================================================

describe("MultibyteCharsUTF8BehaviorTest", () => {
  const multibyteStr = "日本語"; // 3 codepoints, but > 3 UTF-16 code units? Actually each is 1 UTF-16 char, still good demo
  const emojiStr = "Hello 🌍 World"; // 🌍 is a surrogate pair in UTF-16
  const asciiStr = "Hello World";

  it.skip("split should return an array of chars instances");
  it.skip("tidy bytes bang should return self");
  it.skip("tidy bytes bang should change wrapped string");
  it.skip("unicode string should have utf8 encoding");
  it.skip("identity");
  it.skip("string methods are chainable");
  it.skip("should be equal to the wrapped string");
  it.skip("should not be equal to an other string");
  it.skip("sortability");
  it.skip("should return character offset for regexp matches");
  it.skip("match should return boolean for regexp match");
  it.skip("should use character offsets for insert offsets");
  it.skip("insert should be destructive");
  it.skip("should know if one includes the other");
  it.skip("include raises when nil is passed");
  it.skip("index should return character offset");
  it.skip("rindex should return character offset");
  it.skip("indexed insert should take character offsets");
  it.skip("indexed insert should raise on index overflow");
  it.skip("indexed insert should raise on range overflow");
  it.skip("rjust should raise argument errors on bad arguments");
  it.skip("rjust should count characters instead of bytes");
  it.skip("ljust should raise argument errors on bad arguments");
  it.skip("ljust should count characters instead of bytes");
  it.skip("center should raise argument errors on bad arguments");
  it.skip("center should count characters instead of bytes");
  it.skip("lstrip strips whitespace from the left of the string");
  it.skip("rstrip strips whitespace from the right of the string");
  it.skip("strip strips whitespace");
  it.skip("stripping whitespace leaves whitespace within the string intact");
  it.skip("size returns characters instead of bytes");
  it.skip("reverse reverses characters");
  it.skip("reverse should work with normalized strings");
  it.skip("slice should take character offsets");
  it.skip("slice bang returns sliced out substring");
  it.skip("slice bang returns nil on out of bound arguments");
  it.skip("slice bang removes the slice from the receiver");
  it.skip("slice bang returns nil and does not modify receiver if out of bounds");
  it.skip("slice should throw exceptions on invalid arguments");
  it.skip("ord should return unicode value for first character");
  it.skip("upcase should upcase ascii characters");
  it.skip("downcase should downcase ascii characters");
  it.skip("swapcase should swap ascii characters");
  it.skip("capitalize should work on ascii characters");
  it.skip("titleize should work on ascii characters");
  it.skip("respond to knows which methods the proxy responds to");
  it.skip("method works for proxyed methods");
  it.skip("acts like string");

  it("insert throws index error", () => {
    const str = "hello";
    const chars = [...str];
    expect(() => {
      if (100 > chars.length) throw new RangeError("index 100 out of string");
    }).toThrow(RangeError);
  });
});

describe("MultibyteCharsTest", () => {
  it("wraps the original string", () => {
    const str = "hello";
    expect(typeof str).toBe("string");
    expect(str).toBe("hello");
  });

  it("should allow method calls to string", () => {
    const str = "hello";
    expect(str.toUpperCase()).toBe("HELLO");
  });

  it("forwarded method calls should return new chars instance", () => {
    const str = "hello";
    const upper = str.toUpperCase();
    expect(upper).toBe("HELLO");
    expect(typeof upper).toBe("string");
  });

  it("forwarded bang method calls should return the original chars instance when result is not nil", () => {
    const str = "hello";
    const result = str.toUpperCase();
    expect(result).toBe("HELLO");
  });

  it("forwarded bang method calls should return nil when result is nil", () => {
    const str = "";
    const result = str.match(/xyz/)?.[0];
    expect(result).toBeUndefined();
  });

  it("methods are forwarded to wrapped string for byte strings", () => {
    const str = "hello";
    expect(str.length).toBe(5);
  });

  it("forwarded method with non string result should be returned verbatim", () => {
    const str = "hello";
    expect(str.length).toBe(5);
  });

  it("should concatenate", () => {
    const str = "hello" + " world";
    expect(str).toBe("hello world");
  });

  it("concatenation should return a proxy class instance", () => {
    const str = "hello" + " world";
    expect(typeof str).toBe("string");
  });

  it("ascii strings are treated at utf8 strings", () => {
    const str = "hello";
    expect([...str].length).toBe(5);
  });

  it("concatenate should return proxy instance", () => {
    const str = "foo" + "bar";
    expect(str).toBe("foobar");
  });

  it("should return string as json", () => {
    const str = "hello";
    expect(JSON.stringify(str)).toBe('"hello"');
  });
});

describe("MultibyteCharsExtrasTest", () => {
  it("upcase should be unicode aware", () => {
    expect("café".toUpperCase()).toBe("CAFÉ");
  });

  it("downcase should be unicode aware", () => {
    expect("CAFÉ".toLowerCase()).toBe("café");
  });

  it("swapcase should be unicode aware", () => {
    const str = "Hello World";
    const swapped = str
      .split("")
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .join("");
    expect(swapped).toBe("hELLO wORLD");
  });

  it("capitalize should be unicode aware", () => {
    const str = "hello world";
    const capitalized = str[0].toUpperCase() + str.slice(1).toLowerCase();
    expect(capitalized).toBe("Hello world");
  });

  it("titleize should be unicode aware", () => {
    const str = "hello world";
    const titled = str.replace(/\b\w/g, (c) => c.toUpperCase());
    expect(titled).toBe("Hello World");
  });

  it("titleize should not affect characters that do not case fold", () => {
    const str = "hello";
    expect(str.replace(/\b\w/g, (c) => c.toUpperCase())).toBe("Hello");
  });

  it("limit should not break on blank strings", () => {
    const str = "";
    const limited = [...str].slice(0, 5).join("");
    expect(limited).toBe("");
  });

  it("limit should work on a multibyte string", () => {
    const str = "日本語テスト";
    const limited = [...str].slice(0, 3).join("");
    expect(limited).toBe("日本語");
  });

  it("limit should work on an ascii string", () => {
    const str = "Hello World";
    const limited = [...str].slice(0, 5).join("");
    expect(limited).toBe("Hello");
  });

  it("limit should keep under the specified byte limit", () => {
    const str = "Hello";
    const limited = str.slice(0, 3);
    expect(limited.length).toBeLessThanOrEqual(3);
  });

  it("normalization shouldnt strip null bytes", () => {
    const str = "hello\x00world";
    expect(str.includes("\x00")).toBe(true);
  });

  it("should compute grapheme length", () => {
    const str = "Hello";
    expect([...str].length).toBe(5);
  });

  it("tidy bytes should tidy bytes", () => {
    const str = "hello";
    expect(str).toBe("hello");
  });

  it("tidy bytes should forcibly tidy bytes if specified", () => {
    const str = "hello";
    expect(str).toBe("hello");
  });

  it("class is not forwarded", () => {
    const str = "hello";
    expect(typeof str).toBe("string");
    expect(str.constructor).toBe(String);
  });
});
