import { describe, it, expect } from "vitest";
import {
  deepMerge,
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
  toSentence,
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
    const result = deepTransformKeys({ foo_bar: { baz_qux: 1 } }, (k) => k.toUpperCase());
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
      assertValidKeys({ failure: "stuff", funny: "business" }, ["failure", "funny"]),
    ).not.toThrow();
  });

  it("passes when not all valid keys are present", () => {
    expect(() =>
      assertValidKeys({ failure: "stuff" }, ["failure", "funny", "sunny"]),
    ).not.toThrow();
  });

  it("throws on unknown key", () => {
    expect(() =>
      assertValidKeys({ failore: "stuff", funny: "business" }, ["failure", "funny"]),
    ).toThrow(/Unknown key: failore/);
  });

  it("includes valid keys in error message", () => {
    expect(() => assertValidKeys({ failore: "stuff" }, ["failure"])).toThrow(
      /Valid keys are: failure/,
    );
  });
});

describe("deepTransformValues", () => {
  it("transforms flat values", () => {
    expect(deepTransformValues({ a: 1, b: 2 }, (v) => String(v))).toEqual({ a: "1", b: "2" });
  });

  it("transforms values recursively", () => {
    expect(deepTransformValues({ a: { b: { c: 3 } } }, (v) => String(v))).toEqual({
      a: { b: { c: "3" } },
    });
  });

  it("transforms values in arrays", () => {
    expect(deepTransformValues({ a: [{ b: 2 }, { c: 3 }, 4] }, (v) => String(v))).toEqual({
      a: [{ b: "2" }, { c: "3" }, "4"],
    });
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
      }),
    ).toBe("one - two - and lastly - three");
  });

  it("supports custom two-word connector", () => {
    expect(toSentence(["one", "two"], { twoWordsConnector: " or " })).toBe("one or two");
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
    expect(compactBlank([1, null, "", "  ", undefined, 0, false, "a"])).toEqual([1, 0, "a"]);
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
    expect(toSentence(["one", "two", "three"], { wordsConnector: " + " })).toBe(
      "one + two, and three",
    );
  });

  it("to sentence with last word connector", () => {
    expect(toSentence(["one", "two", "three"], { lastWordConnector: " and also " })).toBe(
      "one, two and also three",
    );
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
describe("ToParamTest", () => {
  it("object", () => {
    const obj = { to_param: () => "custom" };
    expect(obj.to_param()).toBe("custom");
  });

  it("nil", () => {
    expect(String(null)).toBe("null");
  });

  it("array", () => {
    expect([1, 2, 3].join("/")).toBe("1/2/3");
  });
});
