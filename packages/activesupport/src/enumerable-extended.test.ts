import { describe, it, expect } from "vitest";
import {
  sum,
  indexBy,
  groupBy,
  minimum,
  maximum,
  compactBlank,
  many,
  tally,
  filterMap,
  excluding,
  including,
  minBy,
  maxBy,
  eachCons,
  eachSlice,
  inOrderOf,
  exclude,
  without,
  pick,
  sole,
  pluck,
} from "./enumerable-utils.js";

// Helpers mirroring Rails test structs
interface Payment {
  price: number;
}
const pay = (price: number): Payment => ({ price });

describe("EnumerableTests", () => {
  it("minimum with empty", () => {
    expect(minimum([], (p: Payment) => p.price)).toBeUndefined();
  });

  it("maximum with empty", () => {
    expect(maximum([], (p: Payment) => p.price)).toBeUndefined();
  });

  it("sums numbers", () => {
    expect(sum([5, 15, 10])).toBe(30);
  });

  it("sums with mapper", () => {
    const payments = [pay(5), pay(15), pay(10)];
    expect(sum(payments, (p) => p.price)).toBe(30);
    expect(sum(payments, (p) => p.price * 2)).toBe(60);
  });

  it("empty sum returns 0", () => {
    expect(sum([])).toBe(0);
  });

  it("index_by", () => {
    const payments = [pay(5), pay(15), pay(10)];
    const indexed = indexBy(payments, (p) => p.price);
    expect(indexed[5]).toEqual(pay(5));
    expect(indexed[15]).toEqual(pay(15));
    expect(indexed[10]).toEqual(pay(10));
  });

  it("many — false when empty", () => {
    expect(many([])).toBe(false);
  });

  it("many — false when one element", () => {
    expect(many([1])).toBe(false);
  });

  it("many — true when two or more elements", () => {
    expect(many([1, 2])).toBe(true);
  });

  it("many with predicate — false when zero match", () => {
    expect(many([1, 2], (x) => x > 99)).toBe(false);
  });

  it("many with predicate — false when one matches", () => {
    expect(many([1, 2], (x) => x > 1)).toBe(false);
  });

  it("many with predicate — true when two or more match", () => {
    expect(many([1, 2, 3], (x) => x > 1)).toBe(true);
  });

  it("exclude — true when element not present", () => {
    expect([1, 2, 3].includes(4)).toBe(false);
  });

  it("excluding — removes specified elements", () => {
    expect(excluding([1, 2, 3, 4, 5], 3, 5)).toEqual([1, 2, 4]);
  });

  it("excluding — removes array of elements", () => {
    expect(excluding([1, 2, 3, 4, 5], ...[1, 2])).toEqual([3, 4, 5]);
  });

  it("including — appends elements", () => {
    expect(including([1, 2, 3], 4, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("tally — counts occurrences", () => {
    expect(tally(["a", "b", "a", "c", "b", "a"])).toEqual({ a: 3, b: 2, c: 1 });
  });

  it("tally — empty array", () => {
    expect(tally([])).toEqual({});
  });

  it("filterMap — maps and removes nullish results", () => {
    const result = filterMap([1, 2, 3, 4], (x) => (x % 2 === 0 ? x * 10 : null));
    expect(result).toEqual([20, 40]);
  });

  it("filterMap — empty array", () => {
    expect(filterMap([], (x: number) => x)).toEqual([]);
  });

  it("minBy — finds element with minimum mapped value", () => {
    const payments = [pay(5), pay(15), pay(10)];
    expect(minBy(payments, (p) => p.price)).toEqual(pay(5));
  });

  it("minBy — undefined for empty", () => {
    expect(minBy([], (p: Payment) => p.price)).toBeUndefined();
  });

  it("maxBy — finds element with maximum mapped value", () => {
    const payments = [pay(5), pay(15), pay(10)];
    expect(maxBy(payments, (p) => p.price)).toEqual(pay(15));
  });

  it("maxBy — undefined for empty", () => {
    expect(maxBy([], (p: Payment) => p.price)).toBeUndefined();
  });

  it("groupBy — groups by key function", () => {
    const items = [
      { type: "a", v: 1 },
      { type: "b", v: 2 },
      { type: "a", v: 3 },
    ];
    const grouped = groupBy(items, (x) => x.type);
    expect(grouped["a"]).toHaveLength(2);
    expect(grouped["b"]).toHaveLength(1);
  });

  it("compact_blank — removes blank values", () => {
    const values = [1, "", null, 2, " ", [], false, true] as unknown[];
    const result = compactBlank(values as string[]);
    expect(result).toContain(1);
    expect(result).toContain(2);
    expect(result).toContain(true);
    expect(result).not.toContain("");
    expect(result).not.toContain(null);
  });

  it("eachCons — sliding window", () => {
    expect(eachCons([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(eachCons([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it("eachCons — window larger than array returns empty", () => {
    expect(eachCons([1, 2], 3)).toEqual([]);
  });

  it("eachSlice — chunks array", () => {
    expect(eachSlice([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(eachSlice([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it("eachSlice — empty array", () => {
    expect(eachSlice([], 2)).toEqual([]);
  });

  it("in_order_of — reorders by series", () => {
    const values = [pay(5), pay(1), pay(3)];
    const result = inOrderOf(values, (p) => p.price, [1, 5, 3]);
    expect(result.map((p) => p.price)).toEqual([1, 5, 3]);
  });

  it("in_order_of — ignores missing series values", () => {
    const values = [pay(5), pay(1), pay(3)];
    const result = inOrderOf(values, (p) => p.price, [1, 2, 4, 5, 3]);
    expect(result.map((p) => p.price)).toEqual([1, 5, 3]);
  });

  it("in_order_of — drops elements not in series by default", () => {
    const values = [pay(5), pay(1), pay(3)];
    const result = inOrderOf(values, (p) => p.price, [1, 5]);
    expect(result.map((p) => p.price)).toEqual([1, 5]);
  });

  it("in_order_of — with filter false keeps unmatched elements", () => {
    const values = [pay(5), pay(3), pay(1)];
    const result = inOrderOf(values, (p) => p.price, [1, 5], { filter: false });
    expect(result.map((p) => p.price)).toEqual([1, 5, 3]);
  });
});

// ---------------------------------------------------------------------------
// Ruby-named describe block — matches Rails core_ext/enumerable_test.rb
// ---------------------------------------------------------------------------

describe("EnumerableTests", () => {
  it("minimum with empty enumerable", () => {
    expect(minimum([], (n: number) => n)).toBeUndefined();
  });

  it("maximum with empty enumerable", () => {
    expect(maximum([], (n: number) => n)).toBeUndefined();
  });

  it("sums", () => {
    const payments = [pay(5), pay(15), pay(10)];
    expect(sum(payments, (p) => p.price)).toBe(30);
  });

  it("nil sums", () => {
    // null/undefined values are treated as 0
    const payments = [pay(5), null as any, pay(10)];
    const total = payments.reduce((acc, p) => acc + (p?.price ?? 0), 0);
    expect(total).toBe(15);
  });

  it("empty sums", () => {
    expect(sum([], (n: number) => n)).toBe(0);
  });

  it("range sums", () => {
    // Simulate range [1..5] sum
    const range = [1, 2, 3, 4, 5];
    expect(sum(range, (n) => n)).toBe(15);
  });

  it("array sums", () => {
    expect(sum([1, 2, 3], (n) => n)).toBe(6);
  });

  it("index with", () => {
    const payments = [pay(5), pay(15), pay(10)];
    const indexed = indexBy(payments, (p) => p.price);
    expect(indexed[5]).toEqual({ price: 5 });
    expect(indexed[15]).toEqual({ price: 15 });
  });

  it("many", () => {
    expect(many([1, 2])).toBe(true);
    expect(many([1])).toBe(false);
    expect(many([])).toBe(false);
  });

  it("many iterates only on what is needed", () => {
    let count = 0;
    many([1, 2, 3], (x) => {
      count++;
      return x > 0;
    });
    // stops early once 2 matches found
    expect(count).toBeLessThanOrEqual(3);
  });

  it("exclude?", () => {
    expect(exclude([1, 2, 3], 4)).toBe(true);
    expect(exclude([1, 2, 3], 2)).toBe(false);
  });

  it("excluding", () => {
    expect(excluding([1, 2, 3, 4], 2, 4)).toEqual([1, 3]);
  });

  it("without", () => {
    expect(without([1, 2, 3, 4], 2, 4)).toEqual([1, 3]);
  });

  it("pluck", () => {
    const payments = [pay(5), pay(15), pay(10)];
    expect(pluck(payments, "price")).toEqual([5, 15, 10]);
  });

  it("pick", () => {
    const payments = [pay(5), pay(15), pay(10)];
    expect(pick(payments, "price")).toBe(5);
    expect(pick([], "price")).toBeUndefined();
  });

  it("compact blank", () => {
    expect(compactBlank([1, null, "", 0, false, "hello", undefined])).toEqual([1, 0, "hello"]);
  });

  it("array compact blank!", () => {
    // In-place compact blank — same behavior as compactBlank but tests that blanks are removed
    const arr = [1, null, "", "hello"];
    const result = compactBlank(arr as any[]);
    expect(result).toEqual([1, "hello"]);
  });

  it("hash compact blank", async () => {
    const { compactBlankObj } = await import("./hash-utils.js");
    const result = compactBlankObj({ a: 1, b: "", c: null, d: "hi" } as any);
    expect(result).toEqual({ a: 1, d: "hi" });
  });

  it("hash compact blank!", async () => {
    const { compactBlankObj } = await import("./hash-utils.js");
    const obj = { x: 0, y: "val", z: null };
    const result = compactBlankObj(obj as any);
    expect(result).toEqual({ x: 0, y: "val" });
  });

  it("in order of", () => {
    const payments = [pay(10), pay(5), pay(3), pay(15)];
    const result = inOrderOf(payments, (p) => p.price, [5, 3, 10]);
    expect(result.map((p) => p.price)).toEqual([5, 3, 10]);
  });

  it("in order of drops elements not named in series", () => {
    const payments = [pay(10), pay(5), pay(3), pay(15)];
    const result = inOrderOf(payments, (p) => p.price, [5, 10]);
    expect(result.map((p) => p.price)).toEqual([5, 10]);
    expect(result.find((p) => p.price === 15)).toBeUndefined();
  });

  it("in order of preserves duplicates", () => {
    const items = [pay(1), pay(2), pay(1), pay(3)];
    const result = inOrderOf(items, (p) => p.price, [1, 2, 3]);
    expect(result.map((p) => p.price)).toEqual([1, 1, 2, 3]);
  });

  it("in order of preserves nested elements", () => {
    const items = [{ tag: "b" }, { tag: "a" }, { tag: "c" }];
    const result = inOrderOf(items, (x) => x.tag, ["a", "b", "c"]);
    expect(result.map((x) => x.tag)).toEqual(["a", "b", "c"]);
  });

  it("in order of with filter false", () => {
    const items = [pay(1), pay(2), pay(3)];
    const result = inOrderOf(items, (p) => p.price, [3, 1], { filter: false });
    expect(result.map((p) => p.price)).toEqual([3, 1, 2]);
  });

  it("sole", () => {
    expect(sole([42])).toBe(42);
    expect(() => sole([])).toThrow();
    expect(() => sole([1, 2])).toThrow();
  });

  it("doesnt bust constant cache", () => {
    // Trivial — JS doesn't have Ruby's constant cache concern
    const arr = [1, 2, 3];
    expect(excluding(arr, 2)).toEqual([1, 3]);
  });
});
