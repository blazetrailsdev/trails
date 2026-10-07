import { describe, expect, it } from "vitest";
import { IndexError } from "./index-error.js";
import { block } from "./hash.js";
import { ArgumentError } from "./argument-error.js";
import { TypeError } from "./type-error.js";
import {
  aryCount,
  rbFArray,
  toH,
  zip,
  aryDelete,
  aryDeleteIf,
  aryFetch,
  aryIncludes,
  aryPop,
  deleteAt,
  arySlice,
  compact,
  compactBang,
  isIntersect,
  last,
  pack,
  each,
  groupBy,
  partition,
  sort,
  toA,
  union,
  uniq,
  flatten,
  unpack,
  unpack1,
} from "./array.js";
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

  it("l with no modifier packs in the host byte order", () => {
    const host = String.fromCharCode(...new Uint8Array(new Uint32Array([1]).buffer));
    expect(pack([1], "l")).toBe(host);
    expect(unpack1(host, "l")).toBe(1);
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

describe("String#unpack", () => {
  it("answers every item the format pushes, and packs L as it unpacks it", () => {
    const packed = pack([1, 0xffffffff, 2n], "CL>*");
    expect(packed).toBe("\x01\xff\xff\xff\xff\x00\x00\x00\x02");
    expect(unpack(packed, "CL>*")).toEqual([1, 0xffffffff, 2]);
    expect(unpack(Uint8Array.of(7, 0, 0), "CL>*")).toEqual([7]);
    expect(unpack1(packed, "L>", { offset: 1 })).toBe(0xffffffff);
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

  it("reads h as hex digits, low nibble first", () => {
    expect(unpack1("a", "h*")).toBe("16");
    expect(unpack1("\xc3\xa9(", "h*")).toBe("3c9a82");
    expect(unpack1("ab", "h3")).toBe("162");
  });

  it("reads H as hex digits, high nibble first, off a String or its binary seat", () => {
    expect(unpack1("\xc3\xa9(", "H*")).toBe("c3a928");
    expect(unpack1("ab", "H3")).toBe("616");
    expect(unpack1("a", "H")).toBe("6");
    expect(unpack1(new Uint8Array([0xc3, 0xa9, 0x28]), "H*")).toBe("c3a928");
    expect(unpack1(new Uint8Array(0), "H*")).toBe("");
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

describe("Array#flatten", () => {
  it("flattens every level and converts an element that answers to_ary", () => {
    const pair = { toAry: () => ["c", ["d"]] };
    expect(flatten(["a", [["b"], pair], null])).toEqual(["a", "b", "c", "d", null]);
  });

  it("leaves an element whose to_ary answers nil and raises when it answers a non-Array", () => {
    const none = { toAry: () => null };
    expect(flatten([none])).toEqual([none]);
    expect(() => flatten([{ toAry: () => 1 }])).toThrow(
      "can't convert Hash to Array (Hash#to_ary gives Integer)",
    );
  });

  it("raises on an array nested in itself", () => {
    const ary: unknown[] = [1];
    ary.push(ary);
    expect(() => flatten(ary)).toThrow(ArgumentError);
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

describe("Array#zip", () => {
  it("pairs each element with the same index of every argument", () => {
    expect(zip([1, 2], ["a", "b"])).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
    expect(zip<number, string | boolean>([1, 2], ["a", "b"], [true, false])).toEqual([
      [1, "a", true],
      [2, "b", false],
    ]);
  });

  it("is as long as the receiver, nil past an argument's end", () => {
    expect(zip([1, 2, 3], ["a"])).toEqual([
      [1, "a"],
      [2, undefined],
      [3, undefined],
    ]);
    expect(zip([1], ["a", "b"])).toEqual([[1, "a"]]);
  });
});

describe("Array#to_h", () => {
  it("builds a Hash from [key, value] pairs, the last of a repeated key winning", () => {
    const hash = toH<string, number>([
      ["a", 1],
      ["b", 2],
      ["a", 3],
    ]);
    expect([...hash]).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
  });

  it("raises TypeError for an element that is not an array", () => {
    expect(() => toH([["a", 1], "b"])).toThrow("wrong element type String at 1 (expected array)");
  });

  it("raises ArgumentError for a pair of the wrong length", () => {
    expect(() => toH([["a", 1, 2]])).toThrow("wrong array length at 0 (expected 2, was 3)");
  });
});

describe("Array#count", () => {
  it("counts the elements the block answers truthily for", () => {
    expect(aryCount([1, 2, 3, 4], (i) => i % 2 === 0)).toBe(2);
    expect(aryCount([0, "", null, false], (i) => i)).toBe(2);
  });

  it("answers the length with no block", () => {
    expect(aryCount([1, null, 3])).toBe(3);
  });
});

describe("Array#each", () => {
  it("yields each element and returns the receiver, with or without a block", () => {
    const ary = [1, 2];
    const seen: number[] = [];
    expect(each(ary, (i) => seen.push(i))).toBe(ary);
    expect(seen).toEqual([1, 2]);
    expect(each(ary)).toBe(ary);
  });
});

describe("Enumerable#group_by", () => {
  it("groups the elements under the block's result, keeping order", () => {
    const hash = groupBy(["apple", "avocado", "banana"], (i) => i[0]);
    expect([...hash]).toEqual([
      ["a", ["apple", "avocado"]],
      ["b", ["banana"]],
    ]);
  });
});

describe("Enumerable#partition", () => {
  it("splits on the block's truthiness, keeping order", () => {
    expect(partition([1, 2, 3, 4], (i) => i % 2 === 0)).toEqual([
      [2, 4],
      [1, 3],
    ]);
  });

  it("counts 0 and the empty string as truthy, nil and false as not", () => {
    expect(partition([0, "", null, false, undefined], (i) => i)).toEqual([
      [0, ""],
      [null, false, undefined],
    ]);
  });
});

describe("Array#compact and Array#uniq", () => {
  it("drops every nil element and keeps the rest in order", () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    expect(compact([0, "", false])).toEqual([0, "", false]);
  });

  it("compact! removes nils in place and answers nil when there were none", () => {
    const ary = [1, null, 2, undefined, 3];
    expect(compactBang(ary)).toBe(ary);
    expect(ary).toEqual([1, 2, 3]);
    expect(compactBang(ary)).toBeNull();
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

describe("arySlice index and length coercion", () => {
  const ary = [1, 2, 3];
  const slice = arySlice as (ary: unknown[], ...argv: unknown[]) => unknown;

  it("raises rb_num2long's TypeError for nil", () => {
    expect(() => slice(ary, null)).toThrow("no implicit conversion from nil to integer");
    expect(() => slice(ary, 0, null)).toThrow("no implicit conversion from nil to integer");
  });

  it("raises a TypeError naming the operand's class", () => {
    expect(() => slice(ary, "1")).toThrow(TypeError);
    expect(() => slice(ary, "1")).toThrow("no implicit conversion of String into Integer");
    expect(() => slice(ary, "1", 2)).toThrow("no implicit conversion of String into Integer");
    expect(() => slice(ary, 0, "2")).toThrow("no implicit conversion of String into Integer");
    expect(() => slice(ary, true)).toThrow("no implicit conversion of true into Integer");
  });

  it("truncates a Float toward zero", () => {
    expect(slice(ary, 1.9)).toBe(2);
    expect(slice(ary, -1.2)).toBe(3);
    expect(slice(ary, 1.5, 1.9)).toEqual([2]);
  });

  it("takes an in-range bigint and raises RangeError past long", () => {
    expect(slice(ary, 1n)).toBe(2);
    expect(slice(ary, 2n ** 40n)).toBeNull();
    expect(() => slice(ary, 2n ** 64n)).toThrow("bignum too big to convert into `long'");
  });

  it("answers nil for a start past the end and an empty array at the end", () => {
    expect(slice(ary, 5, 1)).toBeNull();
    expect(slice(ary, 3, 1)).toEqual([]);
  });
});

describe("aryDeleteIf", () => {
  it("removes every element the block answers truthily for, in place", () => {
    const ary = [1, 2, 3, 4];
    expect(aryDeleteIf(ary, (item) => item % 2 === 0)).toBe(ary);
    expect(ary).toEqual([1, 3]);
  });

  it("keeps an element the block answers nil or false for", () => {
    const ary = [0, "", null, false];
    aryDeleteIf(ary, (item) => item);
    expect(ary).toEqual([null, false]);
  });

  it("returns the receiver when nothing matched", () => {
    const ary = [1, 2];
    expect(aryDeleteIf(ary, () => false)).toBe(ary);
    expect(ary).toEqual([1, 2]);
  });

  it("keeps the unvisited elements when the block raises", () => {
    const ary = [1, 2, 3, 4, 5];
    expect(() =>
      aryDeleteIf(ary, (item) => {
        if (item === 4) throw new Error("boom");
        return item % 2 === 0;
      }),
    ).toThrow("boom");
    expect(ary).toEqual([1, 3, 4, 5]);
  });
});

describe("aryIncludes", () => {
  it("asks each element's == with the item", () => {
    const seen: unknown[] = [];
    const e = {
      equals(other: unknown) {
        seen.push(other);
        return other === "wanted";
      },
    };
    expect(aryIncludes([1, e], "wanted")).toBe(true);
    expect(aryIncludes([1, e], "other")).toBe(false);
    expect(seen).toEqual(["wanted", "other"]);
  });

  it("compares with ==, not identity", () => {
    expect(aryIncludes([[1, 2], 3], [1, 2])).toBe(true);
    expect(aryIncludes([[1, 2], 3], [2, 1])).toBe(false);
    expect(aryIncludes([], 1)).toBe(false);
  });
});

describe("aryFetch", () => {
  it("answers the element, the block's value, the default, or raises IndexError", () => {
    const ary = ["foo", "bar", 2];
    expect([aryFetch(ary, 1), aryFetch(ary, -1), aryFetch(ary, 1, null)]).toEqual([
      "bar",
      2,
      "bar",
    ]);
    expect(
      aryFetch(
        ary,
        50,
        block((index: number) => `Value for ${index}`),
      ),
    ).toBe("Value for 50");
    expect(aryFetch(ary, 50, null)).toBeNull();
    expect(() => aryFetch(ary, 50)).toThrow(
      new IndexError("index 50 outside of array bounds: -3...3"),
    );
    expect(() => aryFetch(ary, -4)).toThrow("index -4 outside of array bounds: -3...3");
    expect(() => aryFetch(ary, 1, 2, 3)).toThrow(/\(given 3, expected 1\.\.2\)/);
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

describe("last", () => {
  it("answers the last element, or nil for an empty array", () => {
    expect(last([1, 2, 3])).toBe(3);
    expect(last([])).toBeUndefined();
  });

  it("answers the last n elements in order", () => {
    expect(last([1, 2, 3], 2)).toEqual([2, 3]);
    expect(last([1, 2, 3], 0)).toEqual([]);
    expect(last([1], 5)).toEqual([1]);
  });

  it("raises on a negative n", () => {
    expect(() => last([1], -1)).toThrow(ArgumentError);
    expect(() => last([1], -1)).toThrow("negative array size");
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

describe("Array#|", () => {
  it("keeps first occurrences across both arrays, deduplicated by eql?", () => {
    expect(union<unknown>([["a", "asc"], "b", "b"], [["a", "asc"], { x: 1 }, { x: 1 }, 1])).toEqual(
      [["a", "asc"], "b", { x: 1 }, 1],
    );
  });
});

describe("Array#intersect?", () => {
  it("answers whether the arrays share an element, compared by eql?", () => {
    expect(isIntersect([1, 2, 3], [3, 4, 5])).toBe(true);
    expect(isIntersect([1, 2, 3], [5, 6, 7])).toBe(false);
    expect(isIntersect<unknown>([["a", "asc"]], [["a", "asc"]])).toBe(true);
  });

  it("answers false when either array is empty", () => {
    expect(isIntersect([], [1])).toBe(false);
    expect(isIntersect([1], [])).toBe(false);
  });
});

describe("rbFArray", () => {
  it("answers an Array, a to_ary or a to_a, else wraps the argument", () => {
    const ary = [0, 1, 2];
    expect(rbFArray(ary)).toBe(ary);
    expect(rbFArray(null)).toEqual([]);
    expect(rbFArray({ a: 1, b: 2 })).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(rbFArray(new Set([1, 2]))).toEqual([1, 2]);
    expect(rbFArray(new Range(1, 3))).toEqual([1, 2, 3]);
    expect(() => rbFArray(new Range(1, null))).toThrow(
      new RangeError("cannot convert endless range to an array"),
    );
    expect(() => rbFArray(new Range(null, 3))).toThrow(
      new globalThis.TypeError("can't iterate from NilClass"),
    );
    expect(rbFArray({ toAry: () => [1] })).toEqual([1]);
    expect(rbFArray("json")).toEqual(["json"]);
    expect(rbFArray(false)).toEqual([false]);
  });
});

describe("deleteAt", () => {
  it("removes the element at a non-negative index and answers it", () => {
    const ary = ["foo", "bar", 2];
    expect(deleteAt(ary, 1)).toBe("bar");
    expect(ary).toEqual(["foo", 2]);
  });

  it("counts a negative index back from the end", () => {
    const ary = ["foo", "bar", 2];
    expect(deleteAt(ary, -2)).toBe("bar");
    expect(ary).toEqual(["foo", 2]);
  });

  it("converts the index as NUM2LONG does before indexing", () => {
    const ary = ["a", "b", "c", "d"];
    expect(deleteAt(ary, 1.9)).toBe("b");
    expect(deleteAt(ary, -1.9)).toBe("d");
    expect(ary).toEqual(["a", "c"]);
    expect(() => deleteAt(ary, NaN)).toThrow();
    expect(ary).toEqual(["a", "c"]);
  });

  it("answers nil and leaves the array alone when the index is out of range", () => {
    const ary = ["foo"];
    expect(deleteAt(ary, 1)).toBeNull();
    expect(deleteAt(ary, -2)).toBeNull();
    expect(ary).toEqual(["foo"]);
  });
});
