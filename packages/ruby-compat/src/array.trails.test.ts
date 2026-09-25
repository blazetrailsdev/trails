import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { TypeError } from "./type-error.js";
import { aryDelete, aryPop, arySlice, compact, pack, sort, toA, uniq, unpack1 } from "./array.js";
import { Range } from "./range.js";
import { byteslice } from "./string/byte-methods.js";

describe("Array#pack", () => {
  const long = "a".repeat(100);

  it("m0 is strict Base64 with no line breaks", () => {
    expect(pack([long], "m0")).toBe(
      "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYQ==",
    );
  });

  it("m wraps at 60 characters and ends with a newline", () => {
    expect(pack([long], "m")).toBe(
      "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh\n" +
        "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh\n" +
        "YWFhYWFhYWFhYQ==\n",
    );
  });

  it("m6 wraps at the given input width rounded down to a multiple of three", () => {
    expect(pack(["abcdefghi"], "m6")).toBe("YWJjZGVm\nZ2hp\n");
  });

  it("m* is m, not m0", () => {
    expect(pack([long], "m*")).toBe(pack([long], "m"));
  });

  it("pads a partial trailing group", () => {
    expect(pack(["ab"], "m0")).toBe("YWI=");
    expect(pack(["a"], "m0")).toBe("YQ==");
    expect(pack(["abc"], "m0")).toBe("YWJj");
  });

  it("encodes the empty string as the empty string", () => {
    expect(pack([""], "m")).toBe("");
    expect(pack([""], "m0")).toBe("");
  });

  it("encodes bytes 0x80..0xff rather than UTF-8-expanding them", () => {
    expect(pack(["\x00\x7f\x80\xff"], "m0")).toBe("AH+A/w==");
    expect(pack(["\x80\xff"], "m0")).toBe("gP8=");
    expect(pack(["\xc3\xbf"], "m0")).toBe("w78=");
  });

  it("packs the HTTP Basic credential Rack::Test builds", () => {
    expect(pack(["user:pass"], "m0")).toBe("dXNlcjpwYXNz");
  });

  it("raises on an unknown directive", () => {
    expect(() => pack(["a"], "Y")).toThrow(new ArgumentError("unknown pack directive 'Y' in 'Y'"));
  });

  it("raises when the array runs out", () => {
    expect(() => pack([], "m0")).toThrow(new ArgumentError("too few arguments"));
  });

  it("skips whitespace and # comments in the format", () => {
    expect(pack(["ab"], " m0")).toBe("YWI=");
    expect(pack(["ab"], "#skip\nm0")).toBe("YWI=");
  });

  it("U packs one character per codepoint, and U* takes the rest of the array", () => {
    expect(pack([101, 769], "U*")).toBe("e\u0301");
    expect(pack([97, 98], "U")).toBe("a");
    expect(pack([97, 98], "U2")).toBe("ab");
    expect(pack([0x1f600], "U")).toBe("\u{1f600}");
  });

  it("U raises on a negative codepoint", () => {
    expect(() => pack([-1], "U")).toThrow(new RangeError("pack(U): value out of range"));
  });

  it("U converts its argument with to_int", () => {
    expect(pack([233.7], "U")).toBe("\u00e9");
    expect(() => pack(["a"], "U")).toThrow(
      new TypeError("no implicit conversion of String into Integer"),
    );
  });
});

describe("Array#pack integer, float and position directives", () => {
  it("packs the CEl< header Cache::Coder writes", () => {
    expect(pack([0x81, 1.5, 15], "CEl<")).toBe("\x81\x00\x00\x00\x00\x00\x00\xF8?\x0F\x00\x00\x00");
  });

  it("C truncates to the low byte and converts with to_int", () => {
    expect(pack([300], "C")).toBe(",");
    expect(pack([1.5], "C")).toBe("\x01");
    expect(() => pack(["x"], "C")).toThrow(
      new TypeError("no implicit conversion of String into Integer"),
    );
  });

  it("l packs two's complement, little-endian with < and big-endian with >", () => {
    expect(pack([-1], "l<")).toBe("\xFF\xFF\xFF\xFF");
    expect(pack([-2], "l>")).toBe("\xFF\xFF\xFF\xFE");
    expect(pack([2 ** 32 + 5], "l<")).toBe("\x05\x00\x00\x00");
  });

  it("E packs a little-endian double", () => {
    expect(pack([1], "E")).toBe("\x00\x00\x00\x00\x00\x00\xF0?");
    expect(pack([-1.0], "E")).toBe("\x00\x00\x00\x00\x00\x00\xF0\xBF");
    expect(() => pack(["x"], "E")).toThrow(new TypeError("can't convert String into Float"));
    expect(() => pack([null as never], "E")).toThrow(new TypeError("can't convert nil into Float"));
  });

  it("@ null-fills to, or truncates back to, an absolute position", () => {
    expect(pack([0], "@2C")).toBe("\x00\x00\x00");
    expect(pack([1, 2], "@0C@5C")).toBe("\x01\x00\x00\x00\x00\x02");
    expect(pack([1, 2], "CC@1")).toBe("\x01");
    expect(pack([1, 2], "C@4")).toBe("\x01\x00\x00\x00");
  });

  it("< is allowed only after the endstr types", () => {
    expect(() => pack([1], "C<")).toThrow(
      new ArgumentError("'<' allowed only after types sSiIlLqQjJ"),
    );
  });
});

describe("String#unpack1", () => {
  const packed = "\x00\x11" + pack([0x81, 1.5, -1], "CEl<") + "ab";

  it("reads the Cache::Coder header back at its fixed offsets", () => {
    expect(unpack1(packed, "@2C")).toBe(129);
    expect(unpack1(packed, "@3E")).toBe(1.5);
    expect(unpack1(packed, "@11l<")).toBe(-1);
    expect(unpack1("\x00\x00\x00\x01", "l>")).toBe(1);
    expect(unpack1("\x00\x00\x00\x80", "l<")).toBe(-2147483648);
  });

  it("answers nil when the string is short of an item's bytes", () => {
    expect(unpack1("ab", "@2l<")).toBeNull();
    expect(unpack1("", "E")).toBeNull();
    expect(unpack1("a", "C*")).toBe(97);
  });

  it("raises when @ or the offset is outside of the string", () => {
    expect(() => unpack1("ab", "@3C")).toThrow(new ArgumentError("@ outside of string"));
    expect(() => unpack1("a", "C", { offset: 2 })).toThrow(
      new ArgumentError("offset outside of string"),
    );
    expect(() => unpack1("a", "y")).toThrow(
      new ArgumentError("unknown unpack directive 'y' in 'y'"),
    );
  });
});

describe("String#byteslice over an ASCII-8BIT string", () => {
  const packed = "\x00\x11" + pack([0x81, 1.5, 2], "CEl<") + "ab";

  it("counts one byte per code unit", () => {
    expect(byteslice(packed, 15, 2)).toBe("ab");
    expect(byteslice(packed, new Range(15, null))).toBe("ab");
    expect(byteslice("\xFF", 0, 1)).toBe("\xFF");
  });
});

describe("Array#to_a", () => {
  it("answers the receiver itself for an Array", () => {
    const ary = [1, 2];
    expect(toA(ary)).toBe(ary);
  });

  it("answers a plain Array copy for a subclass instance", () => {
    class Sub<T> extends Array<T> {}
    const ary = Sub.from([1, 2]);
    const result = toA(ary);
    expect(result).not.toBe(ary);
    expect(result.constructor).toBe(Array);
    expect(result).toEqual([1, 2]);
  });
});

describe("Array#compact and Array#uniq", () => {
  it("drops every nil element and keeps the rest in order", () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    expect(compact([0, "", false])).toEqual([0, "", false]);
  });

  it("dedups by eql?, not identity, keeping the first of each", () => {
    expect(uniq([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
    expect(
      uniq([
        [1, 2],
        [1, 2],
        [1, 3],
      ]),
    ).toEqual([
      [1, 2],
      [1, 3],
    ]);
    expect(uniq([{ a: 1 }, { a: 1 }])).toEqual([{ a: 1 }]);
    expect(uniq([new Map([["a", 1]]), new Map([["a", 1]]), { a: 1 }])).toEqual([
      new Map([["a", 1]]),
    ]);
  });

  it("collapses the two JS seats of one Ruby Integer", () => {
    expect(uniq([1, 1n])).toEqual([1]);
    expect(
      uniq([
        [1n, 3],
        [1, 3],
      ]),
    ).toEqual([[1n, 3]]);
  });
});

describe("arySlice", () => {
  it("enforces Array#slice arity 1..2", () => {
    expect(() => (arySlice as (...a: unknown[]) => unknown)([1])).toThrow(ArgumentError);
    expect(() => (arySlice as (...a: unknown[]) => unknown)([1], 0, 1, 2)).toThrow(ArgumentError);
    expect(arySlice([1, 2, 3], 1, 2)).toEqual([2, 3]);
    expect(() => arySlice([1, 2, 3], 0, undefined)).toThrow(TypeError);
    expect(() => arySlice([1, 2, 3], undefined as never)).toThrow(TypeError);
    expect(() => arySlice([1, 2, 3], undefined as never, 1)).toThrow(TypeError);
  });
});

describe("aryDelete", () => {
  it("removes every == element in place and returns the last one removed", () => {
    const a = { equals: (o: unknown) => o === a || o === b };
    const b = { equals: (o: unknown) => o === a || o === b };
    const ary: unknown[] = [a, 1, b, 2];
    expect(aryDelete(ary, a)).toBe(b);
    expect(ary).toEqual([1, 2]);
  });

  it("compares with ==, not identity", () => {
    const ary: unknown[] = [[1, 2], 3];
    expect(aryDelete(ary, [1, 2])).toEqual([1, 2]);
    expect(ary).toEqual([3]);
  });

  it("returns nil, or the block's value, when nothing matched", () => {
    const ary = [1, 2];
    expect(aryDelete(ary, 3)).toBeUndefined();
    expect(aryDelete(ary, 3, (item) => `not found: ${item}`)).toBe("not found: 3");
    expect(ary).toEqual([1, 2]);
  });
});

describe("aryPop", () => {
  it("pops the last n elements in place, all of them past the length", () => {
    const ary = [1, 2, 3];
    expect(aryPop(ary, 2)).toEqual([2, 3]);
    expect(ary).toEqual([1]);
    expect(aryPop(ary, 0)).toEqual([]);
    expect(aryPop(ary, 5)).toEqual([1]);
    expect(ary).toEqual([]);
  });

  it("raises for a negative count", () => {
    expect(() => aryPop([1], -1)).toThrow("negative array size");
  });
});

describe("Array#sort", () => {
  it("orders by <=> and leaves the receiver alone", () => {
    const ary = [3, 1, 2, 1];
    expect(sort(ary)).toEqual([1, 1, 2, 3]);
    expect(sort(["b", "c", "a"])).toEqual(["a", "b", "c"]);
    expect(ary).toEqual([3, 1, 2, 1]);
  });

  it("raises ArgumentError naming both classes when <=> is nil", () => {
    class A {}
    expect(() => sort([1, new A()])).toThrow(
      new ArgumentError("comparison of Integer with A failed"),
    );
    expect(() => sort(["a", 1])).toThrow(new ArgumentError("comparison of String with 1 failed"));
  });
});
