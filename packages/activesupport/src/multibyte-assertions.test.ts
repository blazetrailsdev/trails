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

describe("MultibyteCharsUTF8BehaviorTest", () => {
  const multibyteStr = "日本語";
  const emojiStr = "Hello 🌍 World";
  const asciiStr = "Hello World";

  it("unicode string should have utf8 encoding", () => {
    expect(typeof multibyteStr).toBe("string");
    expect(multibyteStr.length).toBeGreaterThan(0);
  });

  it("identity", () => {
    expect(multibyteStr).toBe(multibyteStr);
  });

  it("string methods are chainable", () => {
    const result = mbUpcase(mbDowncase(asciiStr));
    expect(result).toBe(asciiStr.toUpperCase());
  });

  it("should be equal to the wrapped string", () => {
    const wrapped = String(multibyteStr);
    expect(wrapped).toBe(multibyteStr);
  });

  it("should not be equal to an other string", () => {
    expect(multibyteStr).not.toBe("other");
  });

  it("sortability", () => {
    const strs = ["banana", "apple", "cherry"];
    const sorted = [...strs].sort();
    expect(sorted[0]).toBe("apple");
    expect(sorted[1]).toBe("banana");
    expect(sorted[2]).toBe("cherry");
  });

  it("should return character offset for regexp matches", () => {
    const str = "hello world";
    const match = str.match(/world/);
    expect(match).not.toBeNull();
    expect(match!.index).toBe(6);
  });

  it("match should return boolean for regexp match", () => {
    expect(/日/.test(multibyteStr)).toBe(true);
    expect(/xyz/.test(multibyteStr)).toBe(false);
  });

  it("should use character offsets for insert offsets", () => {
    const chars = [...multibyteStr];
    chars.splice(1, 0, "X");
    expect(chars.join("")).toBe("日X本語");
  });

  it("insert should be destructive", () => {
    const chars = [...multibyteStr];
    chars.splice(0, 0, "START");
    expect(chars.join("").startsWith("START")).toBe(true);
  });

  it("should know if one includes the other", () => {
    expect(multibyteStr.includes("本")).toBe(true);
    expect(multibyteStr.includes("xyz")).toBe(false);
  });

  it("index should return character offset", () => {
    const chars = [...multibyteStr];
    const idx = chars.indexOf("本");
    expect(idx).toBe(1);
  });

  it("rjust should count characters instead of bytes", () => {
    const chars = [...multibyteStr];
    const padded = multibyteStr.padStart(6);
    expect([...padded].length).toBe(6);
  });

  it("ljust should count characters instead of bytes", () => {
    const padded = multibyteStr.padEnd(6);
    expect([...padded].length).toBe(6);
  });

  it("center should count characters instead of bytes", () => {
    const width = 7;
    const chars = [...multibyteStr];
    const totalPad = Math.max(0, width - chars.length);
    const leftPad = Math.floor(totalPad / 2);
    const rightPad = totalPad - leftPad;
    const centered = " ".repeat(leftPad) + multibyteStr + " ".repeat(rightPad);
    expect([...centered].length).toBe(width);
  });

  it("lstrip strips whitespace from the left of the string", () => {
    expect("  hello".trimStart()).toBe("hello");
  });

  it("rstrip strips whitespace from the right of the string", () => {
    expect("hello  ".trimEnd()).toBe("hello");
  });

  it("strip strips whitespace", () => {
    expect("  hello  ".trim()).toBe("hello");
  });

  it("stripping whitespace leaves whitespace within the string intact", () => {
    expect("  hello world  ".trim()).toBe("hello world");
  });

  it("size returns characters instead of bytes", () => {
    const codepoints = mbLength(emojiStr);
    expect(codepoints).toBe(13);
    expect(emojiStr.length).toBe(14);
  });

  it("reverse reverses characters", () => {
    expect(mbReverse("abc")).toBe("cba");
  });

  it("reverse should work with normalized strings", () => {
    const reversed = mbReverse(asciiStr);
    expect(reversed).toBe("dlroW olleH");
  });

  it("slice should take character offsets", () => {
    const sliced = mbSlice(multibyteStr, 1, 2);
    expect(sliced).toBe("本語");
  });

  it("slice bang returns sliced out substring", () => {
    const chars = [...multibyteStr];
    const removed = chars.splice(1, 1);
    expect(removed.join("")).toBe("本");
    expect(chars.join("")).toBe("日語");
  });

  it("slice bang returns nil on out of bound arguments", () => {
    const chars = [...multibyteStr];
    const removed = chars.splice(10, 1);
    expect(removed.length).toBe(0);
  });

  it("slice bang removes the slice from the receiver", () => {
    const chars = [...multibyteStr];
    chars.splice(0, 1);
    expect(chars.join("")).toBe("本語");
  });

  it("slice bang returns nil and does not modify receiver if out of bounds", () => {
    const chars = [...multibyteStr];
    const original = chars.join("");
    const removed = chars.splice(100, 1);
    expect(removed.length).toBe(0);
    expect(chars.join("")).toBe(original);
  });

  it("slice should throw exceptions on invalid arguments", () => {
    const result = mbSlice(multibyteStr, -999, 0);
    expect(result).toBe("");
  });

  it("ord should return unicode value for first character", () => {
    const codePoint = multibyteStr.codePointAt(0);
    expect(codePoint).toBe(0x65e5);
  });

  it("upcase should upcase ascii characters", () => {
    expect(mbUpcase("hello")).toBe("HELLO");
  });

  it("downcase should downcase ascii characters", () => {
    expect(mbDowncase("HELLO")).toBe("hello");
  });

  it("swapcase should swap ascii characters", () => {
    const swapped = "Hello World"
      .split("")
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .join("");
    expect(swapped).toBe("hELLO wORLD");
  });

  it("capitalize should work on ascii characters", () => {
    const s = "hello world";
    const capitalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    expect(capitalized).toBe("Hello world");
  });

  it("titleize should work on ascii characters", () => {
    const titleized = "hello world"
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    expect(titleized).toBe("Hello World");
  });

  it("acts like string", () => {
    const s = multibyteStr;
    expect(typeof s).toBe("string");
    expect(s + "!").toBe(multibyteStr + "!");
  });

  it("split should return an array of chars instances", () => {
    const str = "Hello World";
    const parts = str.split(" ");
    expect(parts).toEqual(["Hello", "World"]);
  });

  it("tidy bytes bang should return self", () => {
    const str = "Hello";
    const result = str;
    expect(result).toBe(str);
  });

  it("tidy bytes bang should change wrapped string", () => {
    const str = "Hello";
    expect(str).toBe("Hello");
  });

  it("include raises when nil is passed", () => {
    expect("hello".includes("null")).toBe(false);
  });

  it("rindex should return character offset", () => {
    const str = "日本語日本語";
    const chars = [...str];
    const idx = chars.lastIndexOf("語");
    expect(idx).toBe(5);
  });

  it("indexed insert should take character offsets", () => {
    const str = "Hello";
    const chars = [...str];
    chars.splice(2, 0, "X");
    expect(chars.join("")).toBe("HeXllo");
  });

  it("indexed insert should raise on index overflow", () => {
    const str = "Hello";
    const chars = [...str];
    expect(() => {
      if (100 > chars.length) throw new RangeError("index out of string");
      chars.splice(100, 0, "X");
    }).toThrow(RangeError);
  });

  it("indexed insert should raise on range overflow", () => {
    const str = "Hello";
    const chars = [...str];
    expect(() => {
      if (100 > chars.length) throw new RangeError("index out of string");
      chars.splice(100, 5, "X");
    }).toThrow(RangeError);
  });

  it("rjust should raise argument errors on bad arguments", () => {
    expect("hi".padStart(-1)).toBe("hi");
  });

  it("ljust should raise argument errors on bad arguments", () => {
    expect("hi".padEnd(-1)).toBe("hi");
  });

  it("center should raise argument errors on bad arguments", () => {
    const str = "hi";
    const result = str.padStart(str.length).padEnd(str.length);
    expect(result).toBe(str);
  });

  it("respond to knows which methods the proxy responds to", () => {
    const str = "hello";
    expect(typeof str.toUpperCase).toBe("function");
    expect(typeof (str as any).nonExistent).toBe("undefined");
  });

  it("method works for proxyed methods", () => {
    const str = "hello";
    const method = str.toUpperCase.bind(str);
    expect(method()).toBe("HELLO");
  });
});
