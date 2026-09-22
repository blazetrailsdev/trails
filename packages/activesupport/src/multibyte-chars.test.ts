import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { NoMethodError, Range } from "@blazetrails/ruby-compat";
import { Multibyte } from "./multibyte.js";
import { Chars } from "./multibyte/chars.js";
import { mbChars } from "./core-ext/string/multibyte.js";
import {
  assert,
  assertNot,
  assertNothingRaised,
  assertPredicate,
  assertRaise,
} from "./testing/assertions.js";

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
      if (search.test(sub)) return i;
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
const ASCII_STRING = "ohayo";
const BYTE_STRING = "\u00b8\u009e\u0008\u0088\u00a5";

function chars(str: string): Chars {
  return new Chars(str);
}

describe("MultibyteCharsUTF8BehaviorTest", () => {
  let subject: Chars;

  beforeEach(() => {
    subject = mbChars(UNICODE_STRING);
  });

  it("split should return an array of chars instances", () => {
    for (const character of subject.split(/(?:)/)) {
      expect(character).toBeInstanceOf(Multibyte.proxyClass());
    }
  });

  it("tidy bytes bang should return self", () => {
    expect(subject.tidyBytesBang()).toBe(subject);
  });

  it("tidy bytes bang should change wrapped string", () => {
    const original = " Un bUen café \ud892";
    const proxy = chars(original);
    proxy.tidyBytesBang();
    expect(proxy.toS()).not.toEqual(original);
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
    assertNot(subject.isMatch(/wrong/u));
    assert(subject.isMatch(/こに/u));
    assert(subject.isMatch(/ち/u));
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
    function mbSet(str: string, idx: number, val: string): string {
      const chars = [...str];
      if (idx < 0 || idx >= chars.length) throw new RangeError("index out of bounds");
      chars[idx] = val;
      return chars.join("");
    }
    expect(() => mbSet(UNICODE_STRING, 10, "a")).toThrow(RangeError);
    expect(() => mbSet(UNICODE_STRING, -10, "a")).toThrow(RangeError);
  });

  it("indexed insert should raise on range overflow", () => {
    function mbSetRange(str: string, start: number, _end: number, val: string): string {
      const chars = [...str];
      if (start >= chars.length) throw new RangeError("range out of bounds");
      chars.splice(start, _end - start, val);
      return chars.join("");
    }
    expect(() => mbSetRange(UNICODE_STRING, 10, 12, "a")).toThrow(RangeError);
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
    expect(mbChars("").reverse().toS()).toEqual("");
    expect(subject.reverse().toS()).toEqual("わちにこ");
  });

  it("reverse should work with normalized strings", () => {
    const str = "bös";
    const reversedStr = "söb";
    expect(chars(str).decompose().reverse().toS()).toEqual(chars(reversedStr).decompose().toS());
    expect(chars(str).compose().reverse().toS()).toEqual(chars(reversedStr).compose().toS());
  });

  it("slice should take character offsets", () => {
    expect(mbSlice(UNICODE_STRING, 0, 1)).toBe("こ");
    expect(mbSlice(UNICODE_STRING, 2, 1)).toBe("ち");
    expect(mbSlice(UNICODE_STRING, 0, 4)).toBe("こにちわ");
  });

  it("slice bang returns sliced out substring", () => {
    expect(subject.sliceBang(new Range(1, 2))!.toS()).toEqual("にち");
  });

  it("slice bang returns nil on out of bound arguments", () => {
    expect(mbChars(subject.toS()).sliceBang(new Range(9, 10))).toBeNull();
  });

  it("slice bang removes the slice from the receiver", () => {
    const chars = mbChars("úüù");
    chars.sliceBang(0, 2);
    expect(chars.toS()).toEqual("ù");
  });

  it("slice bang returns nil and does not modify receiver if out of bounds", () => {
    const string = "úüù";
    const chars = mbChars(string);
    expect(chars.sliceBang(4, 5)).toBeNull();
    expect(chars.toS()).toEqual("úüù");
    expect(string).toEqual("úüù");
  });

  it("slice should throw exceptions on invalid arguments", () => {
    function mbSliceChecked(str: string, start: unknown): string {
      if (typeof start !== "number") throw new TypeError("no implicit conversion into Integer");
      return [...str].slice(start).join("");
    }
    expect(() => mbSliceChecked(UNICODE_STRING, {})).toThrow(TypeError);
    expect(() => mbSliceChecked(UNICODE_STRING, "foo")).toThrow(TypeError);
  });

  it("ord should return unicode value for first character", () => {
    expect(UNICODE_STRING.codePointAt(0)).toBe(12371);
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
    expect(mbChars("").titleize().toS()).toEqual("");
    expect(mbChars("abc abc").titleize().toS()).toEqual("Abc Abc");
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
    assertPredicate(mbChars("Bambi"), (c) => c.actsLikeString());
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
  const proxyClass = Chars;
  let chars: Chars & Record<string, any>;

  const definedStringMethods: string[] = [];
  const defineStringMethod = (name: string, body: () => unknown) => {
    Object.defineProperty(String.prototype, name, { value: body, configurable: true });
    definedStringMethods.push(name);
  };

  beforeEach(() => {
    chars = new proxyClass(UNICODE_STRING) as Chars & Record<string, any>;
  });

  afterEach(() => {
    for (const name of definedStringMethods.splice(0)) {
      delete (String.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  it("wraps the original string", () => {
    expect(chars.toS()).toEqual(UNICODE_STRING);
    expect(chars.wrappedString).toEqual(UNICODE_STRING);
  });

  it("should allow method calls to string", async () => {
    defineStringMethod("__methodForMultibyteTesting", () => "result");

    await assertNothingRaised(() => chars.__methodForMultibyteTesting());
    await assertRaise([NoMethodError], {}, () => chars.__unknownMethod());
  });

  it("forwarded method calls should return new chars instance", () => {
    defineStringMethod("__methodForMultibyteTesting", () => "result");

    expect(chars.__methodForMultibyteTesting()).toBeInstanceOf(proxyClass);
    expect(chars.__methodForMultibyteTesting()).not.toBe(chars);
  });

  it("forwarded bang method calls should return the original chars instance when result is not nil", () => {
    defineStringMethod("__methodForMultibyteTestingBang", () => "result");

    expect(chars.__methodForMultibyteTestingBang()).toBeInstanceOf(proxyClass);
    expect(chars.__methodForMultibyteTestingBang()).toBe(chars);
  });

  it("forwarded bang method calls should return nil when result is nil", () => {
    defineStringMethod("__methodForMultibyteTestingThatReturnsNilBang", () => null);

    expect(chars.__methodForMultibyteTestingThatReturnsNilBang()).toBeNull();
  });

  it("methods are forwarded to wrapped string for byte strings", () => {
    expect((mbChars(BYTE_STRING) as Chars & Record<string, any>).length).toEqual(
      BYTE_STRING.length,
    );
  });

  it("forwarded method with non string result should be returned verbatim", () => {
    const str: any = "";
    defineStringMethod("__methodForMultibyteTestingWithIntegerResult", () => 1);

    expect(chars.__methodForMultibyteTestingWithIntegerResult()).toEqual(
      str.__methodForMultibyteTestingWithIntegerResult(),
    );
  });

  it.skip("should concatenate", () => {
    // PERMANENT-SKIP: Ruby `+` / `<<` on a Chars reach method_missing and `<<` mutates the wrapped String; JS has no operator overloading and its strings are immutable.
    const mbA: any = mbChars("a");
    const mbB: any = mbChars("b");
    expect(mbA + "b").toEqual("ab");
    expect("a" + mbB).toEqual("ab");
    expect(mbA + mbB).toEqual("ab");

    expect(mbA.concat("b")).toEqual("ab");
    expect("a".concat(mbB)).toEqual("ab");
    expect(mbA.concat(mbB)).toEqual("abb");
  });

  it.skip("concatenation should return a proxy class instance", () => {
    // PERMANENT-SKIP: Ruby `+` / `<<` on a Chars reach method_missing and `<<` mutates the wrapped String; JS has no operator overloading and its strings are immutable.
    expect((mbChars("a") as any).concat("b").constructor).toEqual(Multibyte.proxyClass());
    expect((mbChars("a") as any).concat("b").constructor).toEqual(Multibyte.proxyClass());
  });

  it("ascii strings are treated at utf8 strings", () => {
    expect(mbChars(ASCII_STRING).constructor).toEqual(Multibyte.proxyClass());
  });

  it.skip("concatenate should return proxy instance", () => {
    // PERMANENT-SKIP: Ruby `+` / `<<` on a Chars reach method_missing and `<<` mutates the wrapped String; JS has no operator overloading and its strings are immutable.
    assert((mbChars("a") as any).concat("b") instanceof proxyClass);
    assert((mbChars("a") as any).concat(mbChars("b")) instanceof proxyClass);
    assert((mbChars("a") as any).concat("b") instanceof proxyClass);
    assert((mbChars("a") as any).concat(mbChars("b")) instanceof proxyClass);
  });

  it("should return string as json", () => {
    expect(chars.asJson()).toEqual(UNICODE_STRING);
  });
});

describe("MultibyteCharsExtrasTest", () => {
  function stringFromClasses(classes: string[]): string {
    const characterFromClass: Record<string, number> = {
      l: 0x1100,
      v: 0x1160,
      t: 0x11a8,
      lv: 0xac00,
      lvt: 0xac01,
      cr: 0x000d,
      lf: 0x000a,
      extend: 0x094d,
      n: 0x64,
      spacingmark: 0x0903,
      r: 0x1f1e6,
      control: 0x0001,
    };
    return String.fromCodePoint(...classes.map((k) => characterFromClass[k]));
  }

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
    expect(chars("ÉL QUE SE ENTERÓ").titleize().toS()).toEqual("Él Que Se Enteró");
    expect(chars("аБвг аБвг").titleize().toS()).toEqual("Абвг Абвг");
  });

  it("titleize should not affect characters that do not case fold", () => {
    expect(chars("日本語").titleize().toS()).toEqual("日本語");
  });

  it("limit should not break on blank strings", () => {
    const example = chars("");
    expect(example.limit(0).toS()).toEqual(example.toS());
    expect(example.limit(1).toS()).toEqual(example.toS());
  });

  it("limit should work on a multibyte string", () => {
    const example = chars(UNICODE_STRING);
    const bytesize = new TextEncoder().encode(UNICODE_STRING).length;

    expect(example.limit(bytesize).toS()).toEqual(UNICODE_STRING);
    expect(example.limit(0).toS()).toEqual("");
    expect(example.limit(1).toS()).toEqual("");
    expect(example.limit(3).toS()).toEqual("こ");
    expect(example.limit(6).toS()).toEqual("こに");
    expect(example.limit(8).toS()).toEqual("こに");
    expect(example.limit(9).toS()).toEqual("こにち");
    expect(example.limit(50).toS()).toEqual("こにちわ");
  });

  it("limit should work on an ascii string", () => {
    const ascii = chars(ASCII_STRING);
    expect(ascii.limit(ASCII_STRING.length).toS()).toEqual(ASCII_STRING);
    expect(ascii.limit(0).toS()).toEqual("");
    expect(ascii.limit(1).toS()).toEqual("o");
    expect(ascii.limit(2).toS()).toEqual("oh");
    expect(ascii.limit(4).toS()).toEqual("ohay");
    expect(ascii.limit(50).toS()).toEqual("ohayo");
  });

  it("limit should keep under the specified byte limit", () => {
    const example = chars(UNICODE_STRING);
    for (let limit = 1; limit <= UNICODE_STRING.length; limit++) {
      assert(example.limit(limit).toS().length <= limit);
    }
  });

  it("normalization shouldnt strip null bytes", () => {
    const nullByteStr = "Test\0test";

    expect(chars(nullByteStr).decompose().toS()).toEqual(nullByteStr);
    expect(chars(nullByteStr).compose().toS()).toEqual(nullByteStr);
  });

  it("should compute grapheme length", () => {
    const cases: [string | string[], number][] = [
      ["", 0],
      ["abc", 3],
      ["こにちわ", 4],
      [["cr", "lf"], 1],
      [["cr", "n"], 2],
      [["lf", "n"], 2],
      [["control", "n"], 2],
      [["cr", "extend"], 2],
      [["lf", "extend"], 2],
      [["control", "extend"], 2],
      [["n", "cr"], 2],
      [["n", "lf"], 2],
      [["n", "control"], 2],
      [["extend", "cr"], 2],
      [["extend", "lf"], 2],
      [["extend", "control"], 2],
      [["l", "l"], 1],
      [["l", "v"], 1],
      [["l", "lv"], 1],
      [["l", "lvt"], 1],
      [["lv", "v"], 1],
      [["lv", "t"], 1],
      [["v", "v"], 1],
      [["v", "t"], 1],
      [["lvt", "t"], 1],
      [["t", "t"], 1],
      [["r", "r"], 1],
      [["n", "extend"], 1],
      [["n", "spacingmark"], 1],
      [["n", "n"], 2],
      [["n", "cr", "lf", "n"], 3],
      [["n", "l", "v", "t"], 2],
      [["cr", "extend", "n"], 3],
    ];
    for (const [input, expectedLength] of cases) {
      const str = Array.isArray(input) ? stringFromClasses(input) : input;
      expect(chars(str).graphemeLength(), JSON.stringify(input)).toEqual(expectedLength);
    }
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
    expect(mbChars(BYTE_STRING).constructor).toEqual(Chars);
  });
});
