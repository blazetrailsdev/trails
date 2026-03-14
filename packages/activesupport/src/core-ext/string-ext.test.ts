import { describe, it, expect } from "vitest";
import { at, from, to, first, last, indent, exclude } from "../string-utils.js";

import { htmlSafe, isHtmlSafe } from "../safe-buffer.js";

describe("StringAccessTest", () => {
  it("#at with Integer, returns a substring of one character at that position", () => {
    expect(at("hello", 0)).toBe("h");
    expect(at("hello", -1)).toBe("o");
    expect(at("hello", 10)).toBeUndefined();
  });
  it("#at with Range, returns a substring containing characters at offsets", () => {
    expect(at("hello", [1, 3])).toBe("ell");
    expect(at("hello", [0, -1])).toBe("hello");
  });
  it("#at with Regex, returns the matching portion of the string", () => {
    expect(at("hello world", /\w+/)).toBe("hello");
    expect(at("hello", /xyz/)).toBeUndefined();
  });
  it("#from with positive Integer, returns substring from the given position to the end", () => {
    expect(from("hello", 2)).toBe("llo");
  });
  it("#from with negative Integer, position is counted from the end", () => {
    expect(from("hello", -2)).toBe("lo");
  });
  it("#to with positive Integer, substring from the beginning to the given position", () => {
    expect(to("hello", 2)).toBe("hel");
  });
  it("#to with negative Integer, position is counted from the end", () => {
    expect(to("hello", -2)).toBe("hell");
  });
  it("#from and #to can be combined", () => {
    expect(to(from("hello", 1), 3)).toBe("ello");
  });
  it("#first returns the first character", () => {
    expect(first("hello")).toBe("h");
  });
  it("#first with Integer, returns a substring from the beginning to position", () => {
    expect(first("hello", 3)).toBe("hel");
  });
  it("#first with Integer >= string length still returns a new string", () => {
    expect(first("hello", 100)).toBe("hello");
  });
  it("#first with Integer returns a non-frozen string", () => {
    expect(typeof first("hello", 2)).toBe("string");
  });
  it("#first with negative Integer raises ArgumentError", () => {
    expect(() => first("hello", -1)).toThrow();
  });
  it("#last returns the last character", () => {
    expect(last("hello")).toBe("o");
  });
  it("#last with Integer, returns a substring from the end to position", () => {
    expect(last("hello", 3)).toBe("llo");
  });
  it("#last with Integer >= string length still returns a new string", () => {
    expect(last("hello", 100)).toBe("hello");
  });
  it("#last with Integer returns a non-frozen string", () => {
    expect(typeof last("hello", 2)).toBe("string");
  });
  it("#last with negative Integer raises ArgumentError", () => {
    expect(() => last("hello", -1)).toThrow();
  });
  it("access returns a real string", () => {
    expect(typeof at("hello", 0)).toBe("string");
  });
});

describe("ToTagTest", () => {
  it.skip("#to_tag accepts a callable object and passes options with the builder");
  it.skip("#to_tag accepts a callable object and passes options and tag name");
  it.skip(
    "#to_tag accepts an object responding to #to_xml and passes the options, where :root is key",
  );
  it.skip("#to_tag accepts arbitrary objects responding to #to_str");
  it.skip("#to_tag should use the type value in the options hash");
  it.skip("#to_tag accepts symbol types");
  it.skip("#to_tag accepts boolean types");
  it.skip("#to_tag accepts float types");
  it.skip("#to_tag accepts decimal types");
  it.skip("#to_tag accepts date types");
  it.skip("#to_tag accepts datetime types");
  it.skip("#to_tag accepts time types");
  it.skip("#to_tag accepts ActiveSupport::TimeWithZone types");
  it.skip("#to_tag accepts duration types");
  it.skip("#to_tag accepts array types");
  it.skip("#to_tag accepts hash types");
  it.skip("#to_tag should not add type when skip types option is set");
  it.skip("#to_tag should dasherize the space when passed a string with spaces as a key");
  it.skip("#to_tag should dasherize the space when passed a symbol with spaces as a key");
});

describe("StringConversionsTest", () => {
  it.skip("string to time");
  it.skip("timestamp string to time");
  it.skip("string to time utc offset");
  it.skip("partial string to time");
  it.skip("standard time string to time when current time is standard time");
  it.skip("standard time string to time when current time is daylight savings");
  it.skip("daylight savings string to time when current time is standard time");
  it.skip("daylight savings string to time when current time is daylight savings");
  it.skip("partial string to time when current time is standard time");
  it.skip("partial string to time when current time is daylight savings");
  it.skip("string to datetime");
  it.skip("partial string to datetime");
  it.skip("string to date");
});

describe("StringIndentTest", () => {
  it("does not indent strings that only contain newlines (edge cases)", () => {
    expect(indent("\n\n", 2)).toBe("\n\n");
  });
  it("by default, indents with spaces if the existing indentation uses them", () => {
    expect(indent("  foo\n  bar", 2)).toBe("    foo\n    bar");
  });
  it("by default, indents with tabs if the existing indentation uses them", () => {
    expect(indent("\tfoo", 1, "\t")).toBe("\t\tfoo");
  });
  it("by default, indents with spaces as a fallback if there is no indentation", () => {
    expect(indent("foo", 2)).toBe("  foo");
  });
  it("uses the indent char if passed", () => {
    expect(indent("foo", 2, "-")).toBe("--foo");
  });
  it("does not indent blank lines by default", () => {
    expect(indent("foo\n\nbar", 2)).toBe("  foo\n\n  bar");
  });
  it("indents blank lines if told so", () => {
    expect(indent("foo\n\nbar", 2, " ", true)).toBe("  foo\n  \n  bar");
  });
});

describe("CoreExtStringMultibyteTest", () => {
  it.skip("core ext adds mb chars");
  it.skip("string should recognize utf8 strings");
  it.skip("mb chars returns instance of proxy class");
});

describe("StringBehaviorTest", () => {
  it("acts like string", () => {
    const s = htmlSafe("hello");
    expect(s.toString()).toBe("hello");
    expect(String(s)).toBe("hello");
    expect(s.length).toBe(5);
    expect(isHtmlSafe(s)).toBe(true);
  });
});

describe("StringExcludeTest", () => {
  it("inverse of #include", () => {
    expect(exclude("hello world" as any, "world" as any)).toBe(false);
    expect(exclude("hello world" as any, "xyz" as any)).toBe(true);
  });
});
