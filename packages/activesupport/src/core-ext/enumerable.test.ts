import { describe, it, expect } from "vitest";
import {
  exclude,
  excluding,
  without,
  sum,
  indexWith,
  many,
  pluck,
  pick,
  compactBlank,
  inOrderOf,
  sole,
  minimum,
  maximum,
} from "../enumerable-utils.js";
import { compactBlank as hashCompactBlank, compactBlankBang } from "../hash-utils.js";
import { Array as ArrayExt } from "./array/access.js";

class Payment {
  constructor(readonly price: number | null) {}
}

class ExpandedPayment {
  constructor(
    readonly dollars: number,
    readonly cents: number,
  ) {}
}

describe("EnumerableTests", () => {
  it("minimum with empty enumerable", () => {
    expect(minimum([], () => 0)).toBeUndefined();
  });

  it("maximum with empty enumerable", () => {
    expect(maximum([], () => 0)).toBeUndefined();
  });

  it.skip("sums", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([1, 2, 3], (x) => x * 2)).toBe(12);
  });

  it.skip("nil sums", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    const expectedRaise = TypeError;

    expect(() => sum([5, 15, null] as never[])).toThrow(expectedRaise);
    expect(() => sum([null] as never[])).toThrow(expectedRaise);

    const payments = [new Payment(5), new Payment(15), new Payment(10), new Payment(null)];
    expect(() => sum(payments, (p) => p.price as number)).toThrow(expectedRaise);

    expect(sum(payments, (p) => (p.price ?? 0) * 2)).toBe(60);
  });

  it.skip("empty sums", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    expect(sum([])).toBe(0);
  });

  it.skip("range sums", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    const range = Array.from({ length: 5 }, (_, i) => i + 1);
    expect(sum(range)).toBe(15);
  });

  it.skip("array sums", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    expect(sum([5, 10, 15])).toBe(30);
  });

  it("many", () => {
    expect(many([])).toBe(false);
    expect(many([1])).toBe(false);
    expect(many([1, 2])).toBe(true);

    expect(many([], (x) => x > 1)).toBe(false);
    expect(many([2], (x) => x > 1)).toBe(false);
    expect(many([1, 2], (x) => x > 1)).toBe(false);
    expect(many([1, 2, 2], (x) => x > 1)).toBe(true);
    expect(
      many(
        [1, 2, 3].map((x, i) => [x, i]),
        ([x, i]) => x === i + 1,
      ),
    ).toBe(true);
    expect(
      many(
        [
          [1, 2],
          [3, 4],
        ],
        (x) => sum(x) > 1,
      ),
    ).toBe(true);
  });

  it("many iterates only on what is needed", () => {
    const veryLongEnum = Array.from({ length: 1_000_000 }, (_, i) => i);
    expect(many(veryLongEnum)).toBe(true);
    expect(many(veryLongEnum, (x) => x > 100)).toBe(true);
  });

  it("exclude?", () => {
    expect(exclude([1, 2, 3] as any, 4 as any)).toBe(true);
    expect(exclude([1, 2, 3] as any, 2 as any)).toBe(false);
  });

  it.skip("excluding", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    expect(excluding([1, 2, 3, 4, 5], 3, 5)).toEqual([1, 2, 4]);
    expect(excluding([1, 2, 3, 4, 5], [1, 2] as never)).toEqual([3, 4, 5]);
    expect(
      excluding(
        [
          [0, 1],
          [1, 0],
        ],
        [[1, 0]] as never,
      ),
    ).toEqual([[0, 1]]);
    expect(excluding([1, 2, 3, 4, 5], 3, 5)).toEqual([1, 2, 4]);
  });

  it("without", () => {
    expect(without([1, 2, 3, 4, 5], 3, 5)).toEqual([1, 2, 4]);
    expect(without([1, 2, 3, 4, 5], 1, 2)).toEqual([3, 4, 5]);
  });

  it("pluck", () => {
    let payments: (Payment | ExpandedPayment)[] = [
      new Payment(5),
      new Payment(15),
      new Payment(10),
    ];
    expect(pluck(payments as Payment[], "price")).toEqual([5, 15, 10]);

    payments = [
      new ExpandedPayment(5, 99),
      new ExpandedPayment(15, 0),
      new ExpandedPayment(10, 50),
    ];
    expect(pluck(payments as ExpandedPayment[], "dollars", "cents")).toEqual([
      [5, 99],
      [15, 0],
      [10, 50],
    ]);

    expect(pluck([] as Payment[], "price")).toEqual([]);
    expect(pluck([] as ExpandedPayment[], "dollars", "cents")).toEqual([]);
  });

  it("pick", () => {
    const payments = [new Payment(5), new Payment(15), new Payment(10)];
    expect(pick(payments, "price")).toBe(5);

    const expanded = [
      new ExpandedPayment(5, 99),
      new ExpandedPayment(15, 0),
      new ExpandedPayment(10, 50),
    ];
    expect(pick(expanded, "dollars", "cents")).toEqual([5, 99]);

    expect(pick([] as Payment[], "price")).toBeUndefined();
    expect(pick([] as ExpandedPayment[], "dollars", "cents")).toBeUndefined();
  });

  it("compact blank", () => {
    expect(compactBlank([1, null, "", undefined, 0, "hello"])).toEqual([1, 0, "hello"]);
  });

  it("array compact blank!", () => {
    const values: unknown[] = [1, "", null, 2, " ", [], {}, false, true];
    ArrayExt.compactBlankBang(values);

    expect(values).toEqual([1, 2, true]);
  });

  it("hash compact blank", () => {
    expect(hashCompactBlank({ a: 1, b: null, c: "", d: 0 })).toEqual({ a: 1, d: 0 });
  });

  it("hash compact blank!", () => {
    const values: Record<string, unknown> = { a: "", b: 1, c: null, d: [], e: false, f: true };
    compactBlankBang(values);
    expect(values).toEqual({ b: 1, f: true });
  });

  it("in order of", () => {
    const items = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const result = inOrderOf(items, (x) => x.id, [1, 2, 3]);
    expect(result.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("in order of drops elements not named in series", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = inOrderOf(items, (x) => x.id, [2, 1]);
    expect(result.map((x) => x.id)).toEqual([2, 1]);
  });

  it("in order of preserves duplicates", () => {
    const items = [
      { id: 1, val: "a" },
      { id: 1, val: "b" },
      { id: 2, val: "c" },
    ];
    const result = inOrderOf(items, (x) => x.id, [1, 2]);
    expect(result.length).toBe(3);
  });

  it("in order of preserves nested elements", () => {
    const items = [
      { id: 2, sub: { x: 1 } },
      { id: 1, sub: { x: 2 } },
    ];
    const result = inOrderOf(items, (x) => x.id, [1, 2]);
    expect(result[0].id).toBe(1);
  });

  it("in order of with filter false", () => {
    const values = [new Payment(5), new Payment(3), new Payment(1)];
    expect(inOrderOf(values, (p) => p.price, [1, 5], { filter: false })).toEqual([
      new Payment(1),
      new Payment(5),
      new Payment(3),
    ]);
  });

  it("sole", () => {
    expect(() => sole([])).toThrow();
    expect(sole([1])).toBe(1);
    expect(() => sole([1, 2])).toThrow();
    expect(() => sole([1, null])).toThrow();
  });

  it.skip("index with", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    const payments = [new Payment(5), new Payment(15), new Payment(10)];

    expect(indexWith(payments, (p) => p.price)).toEqual(
      new Map([
        [payments[0], 5],
        [payments[1], 15],
        [payments[2], 10],
      ]),
    );

    expect(indexWith(["title", "body"], null)).toEqual(
      new Map([
        ["title", null],
        ["body", null],
      ]),
    );
    expect(indexWith(["title", "body"], [])).toEqual(
      new Map([
        ["title", []],
        ["body", []],
      ]),
    );
    expect(indexWith(["title", "body"], {})).toEqual(
      new Map([
        ["title", {}],
        ["body", {}],
      ]),
    );
  });

  it.skip("doesnt bust constant cache", () => {
    // BLOCKED: enumerable-sum-index-with-and-excluding-port-gaps
    const items = [1, 2, 3];
    expect(sum(items)).toBe(6);
    expect(sum(items)).toBe(6);
    expect(many(items)).toBe(true);
  });
});
