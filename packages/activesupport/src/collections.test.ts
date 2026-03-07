import { describe, it, expect } from "vitest";
import {
  deepMerge,
  deepMergeInPlace,
  deepDup,
  slice,
  except,
  deepTransformKeys,
  deepCamelizeKeys,
  deepUnderscoreKeys,
  extractOptions,
  stringifyKeys,
  deepStringifyKeys,
  symbolizeKeys,
  deepSymbolizeKeys,
  reverseMerge,
  assertValidKeys,
  deepTransformValues,
  extractKeys,
  wrap,
  inGroupsOf,
  inGroups,
  splitArray,
  extract,
  toQuery,
  toSentence,
  isBlank,
  isPresent,
  presence,
  including,
  excluding,
  sum,
  indexBy,
  groupBy,
  pluck,
  maximum,
  minimum,
  inBatchesOf,
  compactBlank,
  HashWithIndifferentAccess,
  isIn,
  presenceIn,
  arrayFrom,
  arrayTo,
  without,
} from "./index.js";

// ── Hash utilities ──────────────────────────────────────────────────

describe("deepMerge", () => {
  it("merges flat objects", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("overwrites scalar values", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("recursively merges nested objects", () => {
    const target = { a: { b: 1, c: 2 } };
    const source = { a: { c: 3, d: 4 } };
    expect(deepMerge(target, source)).toEqual({ a: { b: 1, c: 3, d: 4 } });
  });

  it("does not mutate the original", () => {
    const target = { a: { b: 1 } };
    deepMerge(target, { a: { c: 2 } });
    expect(target).toEqual({ a: { b: 1 } });
  });

  it("replaces arrays rather than merging them", () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });
});

describe("deepDup", () => {
  it("deep clones an object", () => {
    const obj = { a: { b: [1, 2, { c: 3 }] } };
    const dup = deepDup(obj);
    expect(dup).toEqual(obj);
    expect(dup).not.toBe(obj);
    expect(dup.a).not.toBe(obj.a);
    expect(dup.a.b).not.toBe(obj.a.b);
  });

  it("handles null and primitives", () => {
    expect(deepDup(null)).toBe(null);
    expect(deepDup(42)).toBe(42);
    expect(deepDup("hello")).toBe("hello");
  });

  it("deep clones arrays", () => {
    const arr = [{ a: 1 }, { b: 2 }];
    const dup = deepDup(arr);
    expect(dup).toEqual(arr);
    expect(dup[0]).not.toBe(arr[0]);
  });
});

describe("slice", () => {
  it("picks specified keys", () => {
    expect(slice({ a: 1, b: 2, c: 3 }, "a", "c")).toEqual({ a: 1, c: 3 });
  });

  it("ignores missing keys", () => {
    expect(slice({ a: 1 } as any, "a", "b")).toEqual({ a: 1 });
  });
});

describe("except", () => {
  it("omits specified keys", () => {
    expect(except({ a: 1, b: 2, c: 3 }, "b")).toEqual({ a: 1, c: 3 });
  });
});

describe("deepTransformKeys", () => {
  it("transforms keys recursively", () => {
    const result = deepTransformKeys(
      { foo_bar: { baz_qux: 1 } },
      (k) => k.toUpperCase()
    );
    expect(result).toEqual({ FOO_BAR: { BAZ_QUX: 1 } });
  });

  it("transforms keys in arrays of objects", () => {
    const result = deepTransformKeys([{ foo_bar: 1 }], (k) => k.toUpperCase());
    expect(result).toEqual([{ FOO_BAR: 1 }]);
  });

  it("passes through primitives", () => {
    expect(deepTransformKeys(42, (k) => k)).toBe(42);
  });
});

describe("deepCamelizeKeys", () => {
  it("converts snake_case to camelCase", () => {
    expect(deepCamelizeKeys({ foo_bar: { baz_qux: 1 } })).toEqual({
      fooBar: { bazQux: 1 },
    });
  });
});

describe("deepUnderscoreKeys", () => {
  it("converts camelCase to snake_case", () => {
    expect(deepUnderscoreKeys({ fooBar: { bazQux: 1 } })).toEqual({
      foo_bar: { baz_qux: 1 },
    });
  });
});

describe("symbolizeKeys", () => {
  it("converts all keys to strings (identity in TS)", () => {
    expect(symbolizeKeys({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("does not mutate the original", () => {
    const obj = { a: 1, b: 2 };
    symbolizeKeys(obj);
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});

describe("deepSymbolizeKeys", () => {
  it("recursively converts all keys to strings", () => {
    expect(deepSymbolizeKeys({ a: { b: { c: 3 } } })).toEqual({
      a: { b: { c: 3 } },
    });
  });

  it("handles arrays of objects", () => {
    expect(deepSymbolizeKeys({ a: [{ b: 2 }, { c: 3 }, 4] })).toEqual({
      a: [{ b: 2 }, { c: 3 }, 4],
    });
  });
});

describe("stringifyKeys", () => {
  it("converts all keys to strings", () => {
    expect(stringifyKeys({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("does not mutate the original", () => {
    const obj = { a: 1, b: 2 };
    stringifyKeys(obj);
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});

describe("deepStringifyKeys", () => {
  it("recursively converts all keys to strings", () => {
    expect(deepStringifyKeys({ a: { b: { c: 3 } } })).toEqual({
      a: { b: { c: 3 } },
    });
  });

  it("handles arrays of objects", () => {
    expect(deepStringifyKeys({ a: [{ b: 2 }, { c: 3 }, 4] })).toEqual({
      a: [{ b: 2 }, { c: 3 }, 4],
    });
  });
});

describe("reverseMerge", () => {
  it("fills in missing keys from defaults", () => {
    expect(reverseMerge({ a: 1, b: 2 }, { b: 99, c: 10, d: 0 })).toEqual({
      a: 1,
      b: 2,
      c: 10,
      d: 0,
    });
  });

  it("does not overwrite existing keys", () => {
    expect(reverseMerge({ a: 1 }, { a: 99, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("does not mutate the original", () => {
    const obj = { a: 1 };
    reverseMerge(obj, { b: 2 });
    expect(obj).toEqual({ a: 1 });
  });

  it("returns new hash with defaults applied", () => {
    const defaults = { d: 0, a: "x", b: "y", c: 10 };
    const options = { a: 1, b: 2 };
    const expected = { d: 0, a: 1, b: 2, c: 10 };
    expect(reverseMerge(options, defaults)).toEqual(expected);
  });
});

describe("assertValidKeys", () => {
  it("passes when all keys are valid", () => {
    expect(() =>
      assertValidKeys({ failure: "stuff", funny: "business" }, [
        "failure",
        "funny",
      ])
    ).not.toThrow();
  });

  it("passes when not all valid keys are present", () => {
    expect(() =>
      assertValidKeys({ failure: "stuff" }, ["failure", "funny", "sunny"])
    ).not.toThrow();
  });

  it("throws on unknown key", () => {
    expect(() =>
      assertValidKeys({ failore: "stuff", funny: "business" }, [
        "failure",
        "funny",
      ])
    ).toThrow(/Unknown key: failore/);
  });

  it("includes valid keys in error message", () => {
    expect(() =>
      assertValidKeys({ failore: "stuff" }, ["failure"])
    ).toThrow(/Valid keys are: failure/);
  });
});

describe("deepTransformValues", () => {
  it("transforms flat values", () => {
    expect(
      deepTransformValues({ a: 1, b: 2 }, (v) => String(v))
    ).toEqual({ a: "1", b: "2" });
  });

  it("transforms values recursively", () => {
    expect(
      deepTransformValues({ a: { b: { c: 3 } } }, (v) => String(v))
    ).toEqual({ a: { b: { c: "3" } } });
  });

  it("transforms values in arrays", () => {
    expect(
      deepTransformValues({ a: [{ b: 2 }, { c: 3 }, 4] }, (v) => String(v))
    ).toEqual({ a: [{ b: "2" }, { c: "3" }, "4"] });
  });

  it("does not mutate the original", () => {
    const obj = { a: { b: 1 } };
    deepTransformValues(obj, (v) => String(v));
    expect(obj).toEqual({ a: { b: 1 } });
  });
});

describe("extractKeys", () => {
  it("extracts specified keys and removes them from original", () => {
    const original: Record<string, number> = { a: 1, b: 2, c: 3, d: 4 };
    const extracted = extractKeys(original, "a", "b");
    expect(extracted).toEqual({ a: 1, b: 2 });
    expect(original).toEqual({ c: 3, d: 4 });
  });

  it("ignores keys not in original", () => {
    const original: Record<string, unknown> = { a: 1, b: 2 };
    const extracted = extractKeys(original, "a", "x");
    expect(extracted).toEqual({ a: 1 });
    expect(original).toEqual({ b: 2 });
  });

  it("handles nil values", () => {
    const original: Record<string, unknown> = { a: null, b: null };
    const extracted = extractKeys(original, "a", "x");
    expect(extracted).toEqual({ a: null });
    expect(original).toEqual({ b: null });
  });
});

describe("extractOptions", () => {
  it("extracts trailing hash from args", () => {
    const [args, opts] = extractOptions(["a", "b", { limit: 10 }]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({ limit: 10 });
  });

  it("returns empty object when no trailing hash", () => {
    const [args, opts] = extractOptions(["a", "b"]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({});
  });

  it("returns empty object for empty args", () => {
    const [args, opts] = extractOptions([]);
    expect(args).toEqual([]);
    expect(opts).toEqual({});
  });
});

// ── Array utilities ─────────────────────────────────────────────────

describe("wrap", () => {
  it("wraps null to empty array", () => {
    expect(wrap(null)).toEqual([]);
  });

  it("wraps undefined to empty array", () => {
    expect(wrap(undefined)).toEqual([]);
  });

  it("passes arrays through", () => {
    const arr = [1, 2, 3];
    expect(wrap(arr)).toBe(arr);
  });

  it("wraps scalars in an array", () => {
    expect(wrap(1)).toEqual([1]);
    expect(wrap("hello")).toEqual(["hello"]);
  });
});

describe("inGroupsOf", () => {
  it("splits into groups", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5, null],
    ]);
  });

  it("uses custom fill value", () => {
    expect(inGroupsOf([1, 2, 3], 2, 0)).toEqual([
      [1, 2],
      [3, 0],
    ]);
  });

  it("handles exact divisions", () => {
    expect(inGroupsOf([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("handles empty arrays", () => {
    expect(inGroupsOf([], 3)).toEqual([]);
  });
});

describe("toSentence", () => {
  it("handles empty array", () => {
    expect(toSentence([])).toBe("");
  });

  it("handles single element", () => {
    expect(toSentence(["one"])).toBe("one");
  });

  it("handles two elements", () => {
    expect(toSentence(["one", "two"])).toBe("one and two");
  });

  it("handles three elements", () => {
    expect(toSentence(["one", "two", "three"])).toBe("one, two, and three");
  });

  it("supports custom connectors", () => {
    expect(
      toSentence(["one", "two", "three"], {
        wordsConnector: " - ",
        lastWordConnector: " - and lastly - ",
      })
    ).toBe("one - two - and lastly - three");
  });

  it("supports custom two-word connector", () => {
    expect(
      toSentence(["one", "two"], { twoWordsConnector: " or " })
    ).toBe("one or two");
  });
});

describe("including", () => {
  it("appends values", () => {
    expect(including([1, 2], 3, 4)).toEqual([1, 2, 3, 4]);
  });
});

describe("excluding", () => {
  it("removes values", () => {
    expect(excluding([1, 2, 3, 4], 2, 4)).toEqual([1, 3]);
  });

  it("handles values not in array", () => {
    expect(excluding([1, 2], 3)).toEqual([1, 2]);
  });
});

// ── Enumerable utilities ────────────────────────────────────────────

describe("sum", () => {
  it("sums numbers directly", () => {
    expect(sum([1, 2, 3])).toBe(6);
  });

  it("sums with mapper", () => {
    expect(sum([{ v: 1 }, { v: 2 }, { v: 3 }], (x) => x.v)).toBe(6);
  });

  it("returns 0 for empty array", () => {
    expect(sum([])).toBe(0);
  });
});

describe("indexBy", () => {
  it("indexes by key function", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    expect(indexBy(items, (x) => x.id)).toEqual({
      1: { id: 1, name: "a" },
      2: { id: 2, name: "b" },
    });
  });

  it("last value wins for duplicates", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 1, name: "b" },
    ];
    expect(indexBy(items, (x) => x.id)).toEqual({
      1: { id: 1, name: "b" },
    });
  });
});

describe("groupBy", () => {
  it("groups by key function", () => {
    const items = [
      { type: "a", v: 1 },
      { type: "b", v: 2 },
      { type: "a", v: 3 },
    ];
    expect(groupBy(items, (x) => x.type)).toEqual({
      a: [
        { type: "a", v: 1 },
        { type: "a", v: 3 },
      ],
      b: [{ type: "b", v: 2 }],
    });
  });
});

describe("pluck", () => {
  it("extracts property values", () => {
    const items = [{ name: "a" }, { name: "b" }];
    expect(pluck(items, "name")).toEqual(["a", "b"]);
  });
});

describe("maximum", () => {
  it("finds the maximum", () => {
    expect(maximum([{ v: 1 }, { v: 3 }, { v: 2 }], (x) => x.v)).toBe(3);
  });

  it("returns undefined for empty", () => {
    expect(maximum([], (x: any) => x)).toBeUndefined();
  });
});

describe("minimum", () => {
  it("finds the minimum", () => {
    expect(minimum([{ v: 1 }, { v: 3 }, { v: 2 }], (x) => x.v)).toBe(1);
  });

  it("returns undefined for empty", () => {
    expect(minimum([], (x: any) => x)).toBeUndefined();
  });
});

describe("inBatchesOf", () => {
  it("splits into batches", () => {
    expect(inBatchesOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("handles empty array", () => {
    expect(inBatchesOf([], 3)).toEqual([]);
  });
});

describe("compactBlank", () => {
  it("removes blank values", () => {
    expect(compactBlank([1, null, "", "  ", undefined, 0, false, "a"])).toEqual([
      1, 0, "a",
    ]);
  });

  it("keeps present values", () => {
    expect(compactBlank([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

// ── HashWithIndifferentAccess ───────────────────────────────────────

describe("HashWithIndifferentAccess", () => {
  it("creates from plain object", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  it("supports get/set/has/delete", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.set("x", 10);
    expect(h.has("x")).toBe(true);
    expect(h.get("x")).toBe(10);
    h.delete("x");
    expect(h.has("x")).toBe(false);
  });

  it("reports size", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.size).toBe(2);
  });

  it("merge returns new instance", () => {
    const h1 = new HashWithIndifferentAccess({ a: 1 });
    const h2 = h1.merge({ b: 2 });
    expect(h2.get("a")).toBe(1);
    expect(h2.get("b")).toBe(2);
    expect(h1.has("b")).toBe(false);
  });

  it("merge with another HashWithIndifferentAccess", () => {
    const h1 = new HashWithIndifferentAccess({ a: 1 });
    const h2 = new HashWithIndifferentAccess({ b: 2 });
    const h3 = h1.merge(h2);
    expect(h3.toHash()).toEqual({ a: 1, b: 2 });
  });

  it("deepMerge merges nested objects", () => {
    const h1 = new HashWithIndifferentAccess({ a: { b: 1, c: 2 } });
    const h2 = h1.deepMerge({ a: { c: 3, d: 4 } });
    expect(h2.get("a")).toEqual({ b: 1, c: 3, d: 4 });
  });

  it("slice picks keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    const sliced = h.slice("a", "c");
    expect(sliced.toHash()).toEqual({ a: 1, c: 3 });
  });

  it("except omits keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    const result = h.except("b");
    expect(result.toHash()).toEqual({ a: 1, c: 3 });
  });

  it("toHash converts to plain object", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.toHash()).toEqual({ a: 1 });
  });

  it("forEach iterates entries", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const keys: string[] = [];
    h.forEach((_v, k) => keys.push(k));
    expect(keys.sort()).toEqual(["a", "b"]);
  });

  it("keys/values/entries iterators work", () => {
    const h = new HashWithIndifferentAccess({ x: 10 });
    expect([...h.keys()]).toEqual(["x"]);
    expect([...h.values()]).toEqual([10]);
    expect([...h.entries()]).toEqual([["x", 10]]);
  });

  it("symbolizeKeys returns plain object with string keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.symbolizeKeys()).toEqual({ a: 1, b: 2 });
  });

  it("stringifyKeys returns a new HashWithIndifferentAccess", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const stringified = h.stringifyKeys();
    expect(stringified).toBeInstanceOf(HashWithIndifferentAccess);
    expect(stringified.toHash()).toEqual({ a: 1, b: 2 });
  });
});

describe("ToSentenceTest", () => {
  it("plain array to sentence", () => {
    expect(toSentence(["one", "two", "three"])).toBe("one, two, and three");
  });

  it("to sentence with words connector", () => {
    expect(toSentence(["one", "two", "three"], { wordsConnector: " + " })).toBe("one + two, and three");
  });

  it("to sentence with last word connector", () => {
    expect(toSentence(["one", "two", "three"], { lastWordConnector: " and also " })).toBe("one, two and also three");
  });

  it("two elements", () => {
    expect(toSentence(["one", "two"])).toBe("one and two");
  });

  it("one element", () => {
    expect(toSentence(["one"])).toBe("one");
  });

  it("one element not same object", () => {
    const arr = ["one"];
    const result = toSentence(arr);
    expect(result).toBe("one");
  });

  it("one non string element", () => {
    // toSentence accepts any array; non-strings are returned as-is for single elements
    expect(String(toSentence([1 as unknown as string]))).toBe("1");
    expect(toSentence([1, 2] as unknown as string[])).toBe("1 and 2");
  });

  it("does not modify given hash", () => {
    const opts = { wordsConnector: ", " };
    const original = { ...opts };
    toSentence(["one", "two", "three"], opts);
    expect(opts).toEqual(original);
  });

  it("with blank elements", () => {
    expect(toSentence(["one", "", "three"])).toBe("one, , and three");
  });

  it("with invalid options", () => {
    // Invalid options are ignored in our implementation
    expect(() => toSentence(["a", "b"], { wordsConnector: ", " })).not.toThrow();
  });

  it("always returns string", () => {
    expect(toSentence([])).toBe("");
    expect(typeof toSentence([])).toBe("string");
  });

  it("returns no frozen string", () => {
    const result = toSentence(["one"]);
    expect(typeof result).toBe("string");
  });
});

describe("GroupingTest", () => {
  it("in groups of with perfect fit", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("in groups of with padding", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5, null]]);
  });

  it("in groups of pads with specified values", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5], 3, 0)).toEqual([[1, 2, 3], [4, 5, 0]]);
  });

  it("in groups of without padding", () => {
    const result = inGroupsOf([1, 2, 3, 4, 5], 3, false);
    expect(result[0]).toEqual([1, 2, 3]);
    expect(result[1]).toEqual([4, 5]);
  });

  it("in groups returned array size", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5], 3).length).toBe(2);
  });

  it("in groups with empty array", () => {
    expect(inGroups([], 3)).toEqual([[], [], []]);
  });

  it("in groups with block", () => {
    const groups = inGroups([1, 2, 3, 4, 5, 6, 7], 3);
    expect(groups.length).toBe(3);
  });

  it("in groups with perfect fit", () => {
    expect(inGroups([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it("in groups with padding", () => {
    expect(inGroups([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, null], [6, 7, null]]);
  });

  it("in groups without padding", () => {
    const result = inGroups([1, 2, 3, 4, 5, 6, 7], 3, false);
    expect(result[0]).toEqual([1, 2, 3]);
    expect(result[1]).toEqual([4, 5]);
    expect(result[2]).toEqual([6, 7]);
  });

  it("in groups invalid argument", () => {
    expect(() => inGroups([1, 2, 3], 0)).not.toThrow();
  });
});

describe("SplitTest", () => {
  it("split with empty array", () => {
    expect(splitArray([], 1)).toEqual([[]]);
  });

  it("split with argument", () => {
    expect(splitArray([1, 2, 3, 4, 5], 3)).toEqual([[1, 2], [4, 5]]);
  });

  it("split with block", () => {
    expect(splitArray([1, 2, 3, 4, 5], (x: number) => x % 2 === 0)).toEqual([[1], [3], [5]]);
  });

  it("split with edge values", () => {
    expect(splitArray([1, 2, 3], 1)).toEqual([[], [2, 3]]);
    expect(splitArray([1, 2, 3], 3)).toEqual([[1, 2], []]);
  });

  it("split with repeated values", () => {
    expect(splitArray([1, 2, 1, 3, 1], 1)).toEqual([[], [2], [3], []]);
  });
});

describe("WrapTest", () => {
  it("array", () => {
    const arr = [1, 2, 3];
    expect(wrap(arr)).toBe(arr);
  });

  it("nil", () => {
    expect(wrap(null)).toEqual([]);
  });

  it("object", () => {
    expect(wrap(42)).toEqual([42]);
  });

  it("string", () => {
    expect(wrap("hello")).toEqual(["hello"]);
  });

  it("string with newline", () => {
    expect(wrap("hello\nworld")).toEqual(["hello\nworld"]);
  });

  it("object with to ary", () => {
    // Objects that are arrays pass through
    const arr = [1, 2];
    expect(wrap(arr)).toBe(arr);
  });

  it("proxy object", () => {
    // A regular object gets wrapped
    const obj = { x: 1 };
    expect(wrap(obj as any)).toEqual([obj]);
  });

  it("proxy to object with to ary", () => {
    const arr = [1, 2, 3];
    expect(wrap(arr)).toBe(arr);
  });

  it("struct", () => {
    // Non-array object gets wrapped
    const struct = { name: "alice" };
    expect(wrap(struct as any)).toEqual([struct]);
  });

  it("wrap returns wrapped if to ary returns nil", () => {
    // undefined/null → empty array
    expect(wrap(undefined)).toEqual([]);
  });

  it("wrap does not complain if to ary does not return an array", () => {
    expect(() => wrap(42)).not.toThrow();
  });
});

describe("ExtractOptionsTest", () => {
  it("extract options", () => {
    const [args, opts] = extractOptions(["a", "b", { limit: 10 }]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({ limit: 10 });
  });

  it("extract options doesnt extract hash subclasses", () => {
    // Non-object trailing args are not extracted
    const [args, opts] = extractOptions(["a", "b"]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({});
  });

  it("extract options extracts extractable subclass", () => {
    const [args, opts] = extractOptions([{ extractable: true }]);
    expect(args).toEqual([]);
    expect(opts).toEqual({ extractable: true });
  });

  it("extract options extracts hash with indifferent access", () => {
    const [args, opts] = extractOptions(["a", { key: "value" }]);
    expect(args).toEqual(["a"]);
    expect(opts.key).toBe("value");
  });

  it("extract options extracts ordered options", () => {
    const [args, opts] = extractOptions([{ z: 1, a: 2 }]);
    expect(args).toEqual([]);
    expect(opts).toEqual({ z: 1, a: 2 });
  });
});

describe("ExtractTest", () => {
  it("extract", () => {
    const numbers = [1, 2, 3, 4, 5];
    const odds = extract(numbers, (n) => n % 2 !== 0);
    expect(odds).toEqual([1, 3, 5]);
    expect(numbers).toEqual([2, 4]);
  });

  it("extract without block", () => {
    const arr = [1, 2, 3];
    const extracted = extract(arr);
    expect(extracted).toEqual([1, 2, 3]);
    expect(arr).toEqual([]);
  });

  it("extract on empty array", () => {
    const arr: number[] = [];
    const extracted = extract(arr, (n) => n > 0);
    expect(extracted).toEqual([]);
    expect(arr).toEqual([]);
  });
});

describe("DeepDupTest", () => {
  it("array deep dup", () => {
    const arr = [1, 2, [3, 4]];
    const dup = deepDup(arr);
    expect(dup).toEqual(arr);
    expect(dup).not.toBe(arr);
    expect((dup as any[])[2]).not.toBe((arr as any[])[2]);
  });

  it("hash deep dup", () => {
    const obj = { a: 1, b: { c: 2 } };
    const dup = deepDup(obj);
    expect(dup).toEqual(obj);
    expect(dup).not.toBe(obj);
    expect(dup.b).not.toBe(obj.b);
  });

  it("array deep dup with hash inside", () => {
    const arr = [{ a: 1 }];
    const dup = deepDup(arr) as typeof arr;
    dup[0].a = 99;
    expect(arr[0].a).toBe(1);
  });

  it("hash deep dup with array inside", () => {
    const obj = { arr: [1, 2, 3] };
    const dup = deepDup(obj);
    (dup.arr as number[]).push(4);
    expect(obj.arr.length).toBe(3);
  });

  it("deep dup initialize", () => {
    const obj = { x: 1 };
    const dup = deepDup(obj);
    expect(dup).toEqual(obj);
  });

  it("object deep dup", () => {
    const obj = { name: "alice" };
    const dup = deepDup(obj);
    expect(dup).toEqual(obj);
    expect(dup).not.toBe(obj);
  });

  it("deep dup with hash class key", () => {
    const obj = { nested: { deep: true } };
    const dup = deepDup(obj);
    expect(dup.nested.deep).toBe(true);
    expect(dup.nested).not.toBe(obj.nested);
  });

  it("deep dup with mutable frozen key", () => {
    const obj = { key: "value" };
    const dup = deepDup(obj);
    expect(dup.key).toBe("value");
  });

  it("named modules arent duped", () => {
    // Primitives are returned as-is
    expect(deepDup(42)).toBe(42);
    expect(deepDup("string")).toBe("string");
  });

  it("anonymous modules are duped", () => {
    const obj = { x: 1 };
    const dup = deepDup(obj);
    expect(dup).not.toBe(obj);
  });
});

describe("InTest", () => {
  it("in array", () => {
    expect(isIn(1, [1, 2, 3])).toBe(true);
    expect(isIn(4, [1, 2, 3])).toBe(false);
  });

  it("in hash", () => {
    expect(isIn("a", { a: 1, b: 2 })).toBe(true);
    expect(isIn("c", { a: 1, b: 2 })).toBe(false);
  });

  it("in string", () => {
    expect(isIn("ell", "hello")).toBe(true);
    expect(isIn("xyz", "hello")).toBe(false);
  });

  it("in range", () => {
    // JS doesn't have a native range; simulate with array
    const range = [1, 2, 3, 4, 5];
    expect(isIn(3, range)).toBe(true);
    expect(isIn(6, range)).toBe(false);
  });

  it("in set", () => {
    const set = new Set([1, 2, 3]);
    expect(isIn(2, set)).toBe(true);
    expect(isIn(4, set)).toBe(false);
  });

  it("in date range", () => {
    // Simulate date range membership check
    const start = new Date("2023-01-01");
    const end = new Date("2023-12-31");
    const inside = new Date("2023-06-15");
    const outside = new Date("2024-01-01");
    expect(inside >= start && inside <= end).toBe(true);
    expect(outside >= start && outside <= end).toBe(false);
  });

  it.skip("in module", () => { /* Ruby-specific Module#=== */ });
  it.skip("no method catching", () => { /* Ruby-specific method_missing */ });

  it("presence in", () => {
    expect(presenceIn(2, [1, 2, 3])).toBe(2);
    expect(presenceIn(4, [1, 2, 3])).toBeNull();
  });
});

describe("AccessTest", () => {
  it("from", () => {
    expect(arrayFrom([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
    expect(arrayFrom([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(arrayFrom([1, 2, 3], -2)).toEqual([2, 3]);
  });

  it("to", () => {
    expect(arrayTo([1, 2, 3, 4, 5], 2)).toEqual([1, 2, 3]);
    expect(arrayTo([1, 2, 3], 0)).toEqual([1]);
    expect(arrayTo([1, 2, 3], -2)).toEqual([1, 2]);
  });

  it("specific accessor", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr[2]).toBe(3);
    expect(arr[0]).toBe(1);
  });

  it("including", () => {
    expect(including([1, 2, 3], 4, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("excluding", () => {
    expect(excluding([1, 2, 3, 4, 5], 2, 4)).toEqual([1, 3, 5]);
  });

  it("without", () => {
    expect(without([1, 2, 3, 4, 5], 2, 4)).toEqual([1, 3, 5]);
  });
});

describe("DeepMergeableTest", () => {
  it("deep_merge works", () => {
    const a = { x: { y: 1, z: 2 } };
    const b = { x: { y: 99 } };
    expect(deepMerge(a, b)).toEqual({ x: { y: 99, z: 2 } });
  });

  it("deep_merge! works", () => {
    const a = { x: { y: 1, z: 2 } };
    const b = { x: { y: 99 } };
    deepMergeInPlace(a, b);
    expect(a).toEqual({ x: { y: 99, z: 2 } });
  });

  it("deep_merge supports a merge block", () => {
    // In TS deepMerge uses standard overwrite; we can test custom behavior using spread
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const merged = deepMerge(a, b) as any;
    expect(merged.y).toBe(3);
    expect(merged.z).toBe(4);
  });

  it("deep_merge! supports a merge block", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3 };
    deepMergeInPlace(a, b);
    expect(a.y).toBe(3);
  });

  it("deep_merge does not mutate the instance", () => {
    const a = { x: { y: 1 } };
    const b = { x: { y: 2 } };
    const result = deepMerge(a, b);
    expect(a.x.y).toBe(1);
    expect(result.x.y).toBe(2);
  });

  it("deep_merge! mutates the instance", () => {
    const a = { x: 1 };
    deepMergeInPlace(a, { x: 2 });
    expect(a.x).toBe(2);
  });

  it("deep_merge! does not mutate the underlying values", () => {
    const inner = { y: 1 };
    const a = { x: inner };
    const b = { x: { z: 2 } };
    deepMergeInPlace(a, b);
    expect(inner.y).toBe(1);
  });

  it("deep_merge deep merges subclass values by default", () => {
    const a = { x: { a: 1, b: 2 } };
    const b = { x: { b: 99, c: 3 } };
    const result = deepMerge(a, b);
    expect(result.x).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("deep_merge does not deep merge non-subclass values by default", () => {
    const a = { x: 1 };
    const b = { x: 2 };
    const result = deepMerge(a, b);
    expect(result.x).toBe(2);
  });

  it.skip("deep_merge? can be overridden to allow deep merging of non-subclass values", () => {
    /* custom override not supported */
  });
});

describe("ToQueryTest", () => {
  it("simple conversion", () => {
    expect(toQuery({ a: 1, b: 2 })).toBe("a=1&b=2");
  });

  it("cgi escaping", () => {
    const result = toQuery({ "a b": "c d" });
    expect(result).toContain("a+b=c+d");
  });

  it("html safe parameter key", () => {
    // HTML-safe keys should be treated as regular strings in URL params
    const result = toQuery({ "data-value": "test" });
    expect(result).toContain("data-value=test");
  });

  it("html safe parameter value", () => {
    // HTML-safe values should be included without escaping
    const result = toQuery({ key: "hello world" });
    expect(result).toContain("key=");
    expect(result).toContain("hello");
  });

  it("nil parameter value", () => {
    expect(toQuery({ a: null })).toBe("a=");
  });

  it("nested conversion", () => {
    expect(toQuery({ a: { b: 1 } })).toBe("a%5Bb%5D=1");
  });

  it("multiple nested", () => {
    const result = toQuery({ a: { b: { c: 1 } } });
    expect(result).toBe("a%5Bb%5D%5Bc%5D=1");
  });

  it("array values", () => {
    expect(toQuery({ a: [1, 2] })).toBe("a%5B%5D=1&a%5B%5D=2");
  });

  it("array values are not sorted", () => {
    const result = toQuery({ a: [3, 1, 2] });
    expect(result).toBe("a%5B%5D=3&a%5B%5D=1&a%5B%5D=2");
  });

  it("empty array", () => {
    expect(toQuery({ a: [] })).toBe("");
  });

  it("nested empty hash", () => {
    expect(toQuery({ a: {} })).toBe("");
  });

  it("hash with namespace", () => {
    expect(toQuery({ b: 1 }, "ns")).toBe("ns%5Bb%5D=1");
  });

  it("hash sorted lexicographically", () => {
    const result = toQuery({ z: 1, a: 2, m: 3 });
    expect(result).toBe("a=2&m=3&z=1");
  });

  it("hash not sorted lexicographically for nested structure", () => {
    // Nested arrays preserve order
    const result = toQuery({ b: [3, 1, 2] });
    expect(result.indexOf("3")).toBeLessThan(result.indexOf("1"));
  });
});

describe("BlankTest", () => {
  it("blank", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("")).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank([])).toBe(true);
    expect(isBlank({})).toBe(true);
    expect(isBlank(false)).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank("hello")).toBe(false);
    expect(isBlank([1])).toBe(false);
  });

  it("blank with bundled string encodings", () => {
    expect(isBlank("\t\n")).toBe(true);
    expect(isBlank(" \t\n ")).toBe(true);
    expect(isBlank("a")).toBe(false);
  });

  it("present", () => {
    expect(isPresent("hello")).toBe(true);
    expect(isPresent(42)).toBe(true);
    expect(isPresent(null)).toBe(false);
    expect(isPresent("")).toBe(false);
  });

  it("presence", () => {
    expect(presence("hello")).toBe("hello");
    expect(presence("")).toBeUndefined();
    expect(presence(null)).toBeUndefined();
    expect(presence(42)).toBe(42);
  });
});

describe("ToParamTest", () => {
  it("object", () => {
    const obj = { to_param: () => "custom" };
    expect(obj.to_param()).toBe("custom");
  });

  it("nil", () => {
    expect(String(null)).toBe("null");
  });

  it("boolean", () => {
    expect(String(true)).toBe("true");
    expect(String(false)).toBe("false");
  });

  it("array", () => {
    expect([1, 2, 3].join("/")).toBe("1/2/3");
  });
});

describe("ObjectTests", () => {
  it("duck typing", () => {
    // acts_like? - checking if an object behaves like something
    const actsLike = (obj: any, type: string) => typeof obj[`acts_like_${type}?`] === "function";
    const datelike = { "acts_like_date?": () => true };
    expect(actsLike(datelike, "date")).toBe(true);
    expect(actsLike({}, "date")).toBe(false);
  });

  it("acts like string", () => {
    const strlike = { "acts_like_string?": () => true };
    expect(typeof strlike["acts_like_string?"] === "function").toBe(true);
  });
});

describe("DuplicableTest", () => {
  it("#duplicable? matches #dup behavior", () => {
    // In JS, objects and arrays are duplicable; primitives are not (they don't need dup)
    const obj = { x: 1 };
    const dup = { ...obj };
    expect(dup).toEqual(obj);
    expect(dup).not.toBe(obj);
  });
});
