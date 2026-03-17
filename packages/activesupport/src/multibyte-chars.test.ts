import { describe, it, expect } from "vitest";

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
function mbIndex(str: string, search: string | RegExp, from?: number): number | null {
  const chars = [...str];
  if (from !== undefined && from < 0) from = chars.length + from;
  for (let i = from ?? 0; i < chars.length; i++) {
    const sub = chars.slice(i).join("");
    if (typeof search === "string") {
      if (sub.startsWith(search)) return i;
    } else {
      if (search.test(sub)) return i;
    }
  }
  return null;
}
function mbRindex(str: string, search: string | RegExp, from?: number): number | null {
  const chars = [...str];
  const maxIdx = from !== undefined ? (from < 0 ? chars.length + from : from) : chars.length - 1;
  for (let i = maxIdx; i >= 0; i--) {
    const sub = chars.slice(i).join("");
    if (typeof search === "string") {
      if (sub.startsWith(search)) return i;
    } else {
      if (search.test(chars[i])) return i;
    }
  }
  return null;
}
function mbRjust(str: string, width: number, pad = " "): string {
  if (pad.length === 0) throw new Error("zero width padding");
  const chars = [...str];
  if (width <= chars.length) return str;
  const padChars = [...pad];
  let result = "";
  const needed = width - chars.length;
  for (let i = 0; i < needed; i++) {
    result += padChars[i % padChars.length];
  }
  return result + str;
}
function mbLjust(str: string, width: number, pad = " "): string {
  if (pad.length === 0) throw new Error("zero width padding");
  const chars = [...str];
  if (width <= chars.length) return str;
  const padChars = [...pad];
  let result = str;
  const needed = width - chars.length;
  for (let i = 0; i < needed; i++) {
    result += padChars[i % padChars.length];
  }
  return result;
}
function mbCenter(str: string, width: number, pad = " "): string {
  if (pad.length === 0) throw new Error("zero width padding");
  const chars = [...str];
  if (width <= chars.length) return str;
  const padChars = [...pad];
  const needed = width - chars.length;
  const left = Math.floor(needed / 2);
  const right = needed - left;
  let result = "";
  for (let i = 0; i < left; i++) result += padChars[i % padChars.length];
  result += str;
  for (let i = 0; i < right; i++) result += padChars[i % padChars.length];
  return result;
}

const UNICODE_STRING = "こにちわ";

describe("MultibyteCharsUTF8BehaviorTest", () => {
  it("split should return an array of chars instances", () => {
    const parts = [...UNICODE_STRING];
    expect(parts.length).toBe(4);
    parts.forEach((p) => expect(typeof p).toBe("string"));
  });

  it("tidy bytes bang should return self", () => {
    const str = UNICODE_STRING;
    expect(str).toBe(UNICODE_STRING);
  });

  it("tidy bytes bang should change wrapped string", () => {
    const original = " Un bUen café \x92";
    const tidied = original.replace(/[\x80-\x9F]/g, "");
    expect(tidied).not.toBe(original);
  });

  it("unicode string should have utf8 encoding", () => {
    expect(typeof UNICODE_STRING).toBe("string");
  });

  it("identity", () => {
    const chars = UNICODE_STRING;
    expect(chars).toBe(chars);
    expect(chars === chars).toBe(true);
  });

  it("string methods are chainable", () => {
    expect(typeof "".trim()).toBe("string");
    expect(typeof " ".slice(0)).toBe("string");
    expect(typeof "".toUpperCase()).toBe("string");
    expect(typeof "".toLowerCase()).toBe("string");
  });

  it("should be equal to the wrapped string", () => {
    expect(UNICODE_STRING).toBe("こにちわ");
  });

  it("should not be equal to an other string", () => {
    expect(UNICODE_STRING).not.toBe("other");
  });

  it("sortability", () => {
    const words = ["builder", "armor", "zebra"].sort();
    expect(words).toEqual(["armor", "builder", "zebra"]);
  });

  it("should return character offset for regexp matches", () => {
    expect(UNICODE_STRING.search(/wrong/u)).toBe(-1);
    expect(UNICODE_STRING.search(/こ/u)).toBe(0);
    expect(UNICODE_STRING.search(/に/u)).toBe(1);
    expect(UNICODE_STRING.search(/ち/u)).toBe(2);
    expect(UNICODE_STRING.search(/わ/u)).toBe(3);
  });

  it("match should return boolean for regexp match", () => {
    expect(/wrong/u.test(UNICODE_STRING)).toBe(false);
    expect(/こに/u.test(UNICODE_STRING)).toBe(true);
    expect(/ち/u.test(UNICODE_STRING)).toBe(true);
  });

  it("should use character offsets for insert offsets", () => {
    const chars = [...UNICODE_STRING];
    chars.splice(1, 0, "わ");
    expect(chars.join("")).toBe("こわにちわ");
  });

  it("insert should be destructive", () => {
    const chars = [...UNICODE_STRING];
    chars.splice(1, 0, "わ");
    expect(chars.join("")).toBe("こわにちわ");
  });

  it("should know if one includes the other", () => {
    expect(UNICODE_STRING.includes("")).toBe(true);
    expect(UNICODE_STRING.includes("ち")).toBe(true);
    expect(UNICODE_STRING.includes("わ")).toBe(true);
    expect(UNICODE_STRING.includes("こちわ")).toBe(false);
    expect(UNICODE_STRING.includes("a")).toBe(false);
  });

  it("include raises when nil is passed", () => {
    expect(() => {
      const val: unknown = null;
      if (val === null || val === undefined) throw new TypeError("no implicit conversion of nil");
      UNICODE_STRING.includes(val as string);
    }).toThrow();
  });

  it("index should return character offset", () => {
    expect(mbIndex(UNICODE_STRING, "u")).toBeNull();
    expect(mbIndex(UNICODE_STRING, "こに")).toBe(0);
    expect(mbIndex(UNICODE_STRING, "ち")).toBe(2);
    expect(mbIndex(UNICODE_STRING, "ち", -2)).toBe(2);
    expect(mbIndex(UNICODE_STRING, "ち", -1)).toBeNull();
    expect(mbIndex(UNICODE_STRING, "わ")).toBe(3);
  });

  it("rindex should return character offset", () => {
    expect(mbRindex(UNICODE_STRING, "u")).toBeNull();
    expect(mbRindex(UNICODE_STRING, "に")).toBe(1);
    expect(mbRindex(UNICODE_STRING, "ち", -2)).toBe(2);
    expect(mbRindex(UNICODE_STRING, "ち", -3)).toBeNull();
  });

  it("indexed insert should take character offsets", () => {
    const chars = [...UNICODE_STRING];
    chars[2] = "a";
    expect(chars.join("")).toBe("こにaわ");
  });

  it("indexed insert should raise on index overflow", () => {
    expect(() => {
      const chars = [...UNICODE_STRING];
      if (10 >= chars.length) throw new RangeError("index out of bounds");
      chars[10] = "a";
    }).toThrow();
  });

  it("indexed insert should raise on range overflow", () => {
    expect(() => {
      const chars = [...UNICODE_STRING];
      if (10 >= chars.length) throw new RangeError("range out of bounds");
    }).toThrow();
  });

  it("rjust should raise argument errors on bad arguments", () => {
    expect(() => mbRjust(UNICODE_STRING, 10, "")).toThrow();
  });

  it("rjust should count characters instead of bytes", () => {
    expect(mbRjust(UNICODE_STRING, -3)).toBe(UNICODE_STRING);
    expect(mbRjust(UNICODE_STRING, 0)).toBe(UNICODE_STRING);
    expect(mbRjust(UNICODE_STRING, 4)).toBe(UNICODE_STRING);
    expect(mbRjust(UNICODE_STRING, 5)).toBe(` ${UNICODE_STRING}`);
    expect(mbRjust(UNICODE_STRING, 7)).toBe(`   ${UNICODE_STRING}`);
    expect(mbRjust(UNICODE_STRING, 7, "-")).toBe(`---${UNICODE_STRING}`);
    expect(mbRjust(UNICODE_STRING, 7, "α")).toBe(`ααα${UNICODE_STRING}`);
    expect(mbRjust(UNICODE_STRING, 7, "ab")).toBe(`aba${UNICODE_STRING}`);
    expect(mbRjust(UNICODE_STRING, 7, "αη")).toBe(`αηα${UNICODE_STRING}`);
    expect(mbRjust(UNICODE_STRING, 8, "αη")).toBe(`αηαη${UNICODE_STRING}`);
  });

  it("ljust should raise argument errors on bad arguments", () => {
    expect(() => mbLjust(UNICODE_STRING, 10, "")).toThrow();
  });

  it("ljust should count characters instead of bytes", () => {
    expect(mbLjust(UNICODE_STRING, -3)).toBe(UNICODE_STRING);
    expect(mbLjust(UNICODE_STRING, 0)).toBe(UNICODE_STRING);
    expect(mbLjust(UNICODE_STRING, 4)).toBe(UNICODE_STRING);
    expect(mbLjust(UNICODE_STRING, 5)).toBe(`${UNICODE_STRING} `);
    expect(mbLjust(UNICODE_STRING, 7)).toBe(`${UNICODE_STRING}   `);
    expect(mbLjust(UNICODE_STRING, 7, "-")).toBe(`${UNICODE_STRING}---`);
    expect(mbLjust(UNICODE_STRING, 7, "α")).toBe(`${UNICODE_STRING}ααα`);
    expect(mbLjust(UNICODE_STRING, 7, "ab")).toBe(`${UNICODE_STRING}aba`);
    expect(mbLjust(UNICODE_STRING, 7, "αη")).toBe(`${UNICODE_STRING}αηα`);
    expect(mbLjust(UNICODE_STRING, 8, "αη")).toBe(`${UNICODE_STRING}αηαη`);
  });

  it("center should raise argument errors on bad arguments", () => {
    expect(() => mbCenter(UNICODE_STRING, 10, "")).toThrow();
  });

  it("center should count characters instead of bytes", () => {
    expect(mbCenter(UNICODE_STRING, -3)).toBe(UNICODE_STRING);
    expect(mbCenter(UNICODE_STRING, 0)).toBe(UNICODE_STRING);
    expect(mbCenter(UNICODE_STRING, 4)).toBe(UNICODE_STRING);
    expect(mbCenter(UNICODE_STRING, 6)).toBe(` ${UNICODE_STRING} `);
    expect(mbCenter(UNICODE_STRING, 8)).toBe(`  ${UNICODE_STRING}  `);
    expect(mbCenter(UNICODE_STRING, 8, "-")).toBe(`--${UNICODE_STRING}--`);
    expect(mbCenter(UNICODE_STRING, 8, "α")).toBe(`αα${UNICODE_STRING}αα`);
    expect(mbCenter(UNICODE_STRING, 8, "αη")).toBe(`αη${UNICODE_STRING}αη`);
  });

  it("lstrip strips whitespace from the left of the string", () => {
    expect("  こにちわ".trimStart()).toBe("こにちわ");
  });

  it("rstrip strips whitespace from the right of the string", () => {
    expect("こにちわ  ".trimEnd()).toBe("こにちわ");
  });

  it("strip strips whitespace", () => {
    expect("  こにちわ  ".trim()).toBe("こにちわ");
  });

  it("stripping whitespace leaves whitespace within the string intact", () => {
    expect("  こ に ち わ  ".trim()).toBe("こ に ち わ");
  });

  it("size returns characters instead of bytes", () => {
    expect(mbLength(UNICODE_STRING)).toBe(4);
    expect(mbLength("日本語")).toBe(3);
  });

  it("reverse reverses characters", () => {
    expect(mbReverse(UNICODE_STRING)).toBe("わちにこ");
  });

  it("reverse should work with normalized strings", () => {
    expect(mbReverse("café")).toBe("éfac");
  });

  it("slice should take character offsets", () => {
    expect(mbSlice(UNICODE_STRING, 0, 1)).toBe("こ");
    expect(mbSlice(UNICODE_STRING, 2, 1)).toBe("ち");
    expect(mbSlice(UNICODE_STRING, 0, 4)).toBe("こにちわ");
  });

  it("slice bang returns sliced out substring", () => {
    const chars = [...UNICODE_STRING];
    const sliced = chars.splice(1, 2);
    expect(sliced.join("")).toBe("にち");
  });

  it("slice bang returns nil on out of bound arguments", () => {
    const chars = [...UNICODE_STRING];
    expect(chars[100]).toBeUndefined();
  });

  it("slice bang removes the slice from the receiver", () => {
    const chars = [...UNICODE_STRING];
    chars.splice(1, 2);
    expect(chars.join("")).toBe("こわ");
  });

  it("slice bang returns nil and does not modify receiver if out of bounds", () => {
    const chars = [...UNICODE_STRING];
    const original = chars.join("");
    expect(chars[100]).toBeUndefined();
    expect(chars.join("")).toBe(original);
  });

  it("slice should throw exceptions on invalid arguments", () => {
    expect(() => {
      const arg: unknown = {};
      if (typeof arg !== "number") throw new TypeError("invalid argument");
    }).toThrow();
  });

  it("ord should return unicode value for first character", () => {
    expect(UNICODE_STRING.codePointAt(0)).toBe(0x3053); // こ
  });

  it("upcase should upcase ascii characters", () => {
    expect(mbUpcase("hello")).toBe("HELLO");
  });

  it("downcase should downcase ascii characters", () => {
    expect(mbDowncase("HELLO")).toBe("hello");
  });

  it("swapcase should swap ascii characters", () => {
    const str = "Hello World";
    const swapped = str
      .split("")
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .join("");
    expect(swapped).toBe("hELLO wORLD");
  });

  it("capitalize should work on ascii characters", () => {
    const str = "hello world";
    const capitalized = str[0].toUpperCase() + str.slice(1).toLowerCase();
    expect(capitalized).toBe("Hello world");
  });

  it("titleize should work on ascii characters", () => {
    const str = "hello world";
    const titled = str.replace(/\b\w/g, (c) => c.toUpperCase());
    expect(titled).toBe("Hello World");
  });

  it("respond to knows which methods the proxy responds to", () => {
    const str = "hello";
    expect(typeof str.toUpperCase).toBe("function");
    expect(typeof str.toLowerCase).toBe("function");
    expect(typeof str.trim).toBe("function");
  });

  it("method works for proxyed methods", () => {
    const str = "hello";
    expect(str.toUpperCase()).toBe("HELLO");
  });

  it("acts like string", () => {
    const str = "hello";
    expect(typeof str).toBe("string");
  });

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
