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
import {
  Complex,
  TypeError,
  complex,
  rational,
  rbEqual,
  rbObjClass,
  toI,
} from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { assertEqual, assertRaise, assertRaises } from "../testing/assertions.js";
import "./enumerable.js";
import { Array as ArrayExt } from "./array/access.js";

class Payment {
  constructor(readonly price: number | null) {}

  equals(other: unknown): boolean {
    return (
      other instanceof Payment &&
      other.constructor === this.constructor &&
      rbEqual(this.price, other.price)
    );
  }
}

class SummablePayment extends Payment {
  plus(p: SummablePayment): SummablePayment {
    return new SummablePayment(this.price! + p.price!);
  }
}

class Money {
  constructor(readonly value: number) {}

  plus(other: Money): Money {
    return new Money(this.value + other.value);
  }

  coerce(other: number): [Money, Money] {
    return [new Money(other), this];
  }

  equals(other: Money): boolean {
    return other.value === this.value;
  }
}

class GenericEnumerable<T> implements Iterable<T> {
  constructor(private values: T[] = [1, 2, 3] as T[]) {}

  *[Symbol.iterator](): Iterator<T> {
    yield* this.values;
  }
}

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

function assertTypedEqual(e: unknown, v: unknown, cls: string, msg?: string): void {
  expect(rbObjClass(v), msg).toBe(cls);
  assertEqual(e, v, msg);
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

  it("sums", async () => {
    let enum_: GenericEnumerable<any> = new GenericEnumerable([5, 15, 10]);
    expect(sum(enum_)).toEqual(30);
    expect(sum(enum_, (i: number) => i * 2)).toEqual(60);

    enum_ = new GenericEnumerable(["a", "b", "c"]);
    expect(sum(enum_, "")).toEqual("abc");
    expect(sum(enum_, "", (i: string) => i.repeat(2))).toEqual("aabbcc");
    await assertRaises([TypeError], {}, () => {
      sum(enum_);
    });
    await assertRaises([TypeError], {}, () => {
      sum(enum_, (i: string) => i.repeat(2));
    });

    let payments: GenericEnumerable<any> = new GenericEnumerable([
      new Payment(5),
      new Payment(15),
      new Payment(10),
    ]);
    expect(sum(payments, (p: Payment) => p.price!)).toEqual(30);
    expect(sum(payments, (p: Payment) => p.price! * 2)).toEqual(60);

    payments = new GenericEnumerable([new SummablePayment(5), new SummablePayment(15)]);
    await assertRaises([TypeError], {}, () => {
      sum(payments);
    });
    expect(sum(payments, new SummablePayment(0))).toEqual(new SummablePayment(20));
    expect(sum(payments, new SummablePayment(0), (p: Payment) => p)).toEqual(
      new SummablePayment(20),
    );
    await assertRaises([TypeError], {}, () => {
      sum(payments, (p: Payment) => p);
    });

    let sum_: any = sum(new GenericEnumerable<unknown>([3, rational(5, 1)]));
    assertTypedEqual(8, sum_, "Rational");

    sum_ = sum(new GenericEnumerable<unknown>([3, rational(5, 1)]), new Number(0.0));
    assertTypedEqual(8.0, sum_, "Float");

    sum_ = sum(new GenericEnumerable<unknown>([3, rational(5, 1), new Number(7.0)]));
    assertTypedEqual(15.0, sum_, "Float");

    sum_ = sum(new GenericEnumerable<unknown>([3, rational(5, 1), complex(7)]));
    assertTypedEqual(complex(15), sum_, "Complex");
    assertTypedEqual(15, sum_.real, "Rational");
    assertTypedEqual(0, sum_.imag, "Integer");

    sum_ = sum(new GenericEnumerable<unknown>([3.5, 5]));
    assertTypedEqual(8.5, sum_, "Float");

    sum_ = sum(new GenericEnumerable<unknown>([2, 8.5]));
    assertTypedEqual(10.5, sum_, "Float");

    sum_ = sum(new GenericEnumerable<unknown>([rational(1, 2), 1]));
    assertTypedEqual(rational(3, 2), sum_, "Rational");

    sum_ = sum(new GenericEnumerable<unknown>([rational(1, 2), rational(1, 3)]));
    assertTypedEqual(rational(5, 6), sum_, "Rational");

    sum_ = sum(
      new GenericEnumerable<unknown>([new Number(2.0), Complex.I.multiply(new Number(3.0))]),
    );
    assertTypedEqual(complex(2.0, 3.0), sum_, "Complex");
    assertTypedEqual(2.0, sum_.real, "Float");
    assertTypedEqual(3.0, sum_.imag, "Float");

    sum_ = sum(new GenericEnumerable([1, 2]), 10, (v: number) => v * 2);
    assertTypedEqual(16, sum_, "Integer");
  });

  it("nil sums", async () => {
    const expectedRaise = TypeError;

    await assertRaise([expectedRaise], {}, () => sum(new GenericEnumerable([5, 15, null])));
    await assertRaises([expectedRaise], {}, () => {
      sum([null]);
    });

    const payments = new GenericEnumerable([
      new Payment(5),
      new Payment(15),
      new Payment(10),
      new Payment(null),
    ]);
    await assertRaise([expectedRaise], {}, () => sum(payments, (p) => p.price));

    expect(sum(payments, (p) => (toI(p.price) as number) * 2)).toEqual(60);
  });

  it("empty sums", () => {
    expect(sum(new GenericEnumerable([]))).toEqual(0);
    expect(sum(new GenericEnumerable([]), [])).toEqual([]);
    expect(sum(new GenericEnumerable<number>([]), (i: number) => i + 10)).toEqual(0);
    expect(sum(new GenericEnumerable<number>([]), [], (i: number) => i + 10)).toEqual([]);
    expect(sum(new GenericEnumerable([]), new Payment(0))).toEqual(new Payment(0));
    assertTypedEqual(0.0, sum(new GenericEnumerable([]), new Number(0.0)), "Float");
  });

  it("range sums", async () => {
    expect(new Range(1, 4).sum((i: number) => i * 2)).toEqual(20);
    expect(new Range(1, 4).sum()).toEqual(10);
    expect(new Range(1, 4.5).sum()).toEqual(10);
    expect(new Range(1, 4, true).sum()).toEqual(6);
    await assertRaises([TypeError], {}, () => {
      new Range("a", "c").sum();
    });
    expect(new Range("a", "c").sum("")).toEqual("abc");
    expect(new Range(0, 10_000_000).sum()).toEqual(50_000_005_000_000);
    expect(new Range(10, 0).sum()).toEqual(0);
    expect(new Range(10, 0).sum(5)).toEqual(5);
    expect(new Range(10, 10).sum()).toEqual(10);
    expect(new Range(10, 10, true).sum(42)).toEqual(42);
    assertTypedEqual(
      20.0,
      new Range(1, 4).sum(new Number(0.0), (i: number) => i * 2),
      "Float",
    );
    assertTypedEqual(10.0, new Range(1, 4).sum(new Number(0.0)), "Float");
    assertTypedEqual(20.0, new Range(1, 4).sum(new Number(10.0)), "Float");
    assertTypedEqual(5.0, new Range(10, 0).sum(new Number(5.0)), "Float");
  });

  it("array sums", async () => {
    let enum_: any[] = [5, 15, 10];
    expect(sum(enum_)).toEqual(30);
    expect(sum(enum_, (i: number) => i * 2)).toEqual(60);

    enum_ = ["a", "b", "c"];
    await assertRaises([TypeError], {}, () => {
      sum(enum_);
    });
    expect(sum(enum_, "")).toEqual("abc");
    await assertRaises([TypeError], {}, () => {
      sum(enum_, (i: string) => i.repeat(2));
    });
    expect(sum(enum_, "", (i: string) => i.repeat(2))).toEqual("aabbcc");

    let payments: Payment[] = [new Payment(5), new Payment(15), new Payment(10)];
    expect(sum(payments, (p) => p.price!)).toEqual(30);
    expect(sum(payments, (p) => p.price! * 2)).toEqual(60);

    payments = [new SummablePayment(5), new SummablePayment(15)];
    await assertRaises([TypeError], {}, () => {
      sum(payments);
    });
    expect(sum(payments, new SummablePayment(0))).toEqual(new SummablePayment(20));
    await assertRaises([TypeError], {}, () => {
      sum(payments, (p: Payment) => p);
    });
    expect(sum(payments, new SummablePayment(0), (p: Payment) => p)).toEqual(
      new SummablePayment(20),
    );

    expect(sum([new Money(1), new Money(2)])).toEqual(new Money(3));

    let sum_: any = sum([3, rational(5, 1)]);
    assertTypedEqual(8, sum_, "Rational");

    sum_ = sum([3, rational(5, 1)], new Number(0.0));
    assertTypedEqual(8.0, sum_, "Float");

    sum_ = sum([3, rational(5, 1), new Number(7.0)]);
    assertTypedEqual(15.0, sum_, "Float");

    sum_ = sum([3, rational(5, 1), complex(7)]);
    assertTypedEqual(complex(15), sum_, "Complex");
    assertTypedEqual(15, sum_.real, "Rational");
    assertTypedEqual(0, sum_.imag, "Integer");

    sum_ = sum([3.5, 5]);
    assertTypedEqual(8.5, sum_, "Float");

    sum_ = sum([2, 8.5]);
    assertTypedEqual(10.5, sum_, "Float");

    sum_ = sum([rational(1, 2), 1]);
    assertTypedEqual(rational(3, 2), sum_, "Rational");

    sum_ = sum([rational(1, 2), rational(1, 3)]);
    assertTypedEqual(rational(5, 6), sum_, "Rational");

    sum_ = sum([new Number(2.0), Complex.I.multiply(new Number(3.0))]);
    assertTypedEqual(complex(2.0, 3.0), sum_, "Complex");
    assertTypedEqual(2.0, sum_.real, "Float");
    assertTypedEqual(3.0, sum_.imag, "Float");

    sum_ = sum([1, 2], 10, (v: number) => v * 2);
    assertTypedEqual(16, sum_, "Integer");
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

  it("excluding", () => {
    expect(excluding(new GenericEnumerable(range(1, 5)), 3, 5)).toEqual([1, 2, 4]);
    expect(excluding(new GenericEnumerable(range(1, 5)), [1, 2])).toEqual([3, 4, 5]);
    expect(
      excluding(
        new GenericEnumerable([
          [0, 1],
          [1, 0],
        ]),
        [[1, 0]],
      ),
    ).toEqual([[0, 1]]);
    expect(excluding(range(1, 5), 3, 5)).toEqual([1, 2, 4]);
    expect(excluding(new Set(range(1, 5)), 3, 5)).toEqual([1, 2, 4]);
    expect(excluding({ foo: 1, bar: 2, baz: 3 }, "bar")).toEqual({ foo: 1, baz: 3 });
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
    // BLOCKED: port-a-minimal-enumerator-for-to-enum-arms
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
    // PERMANENT-SKIP: MRI-only — `skip "Only applies to MRI" unless defined?(RubyVM.stat)` (enumerable_test.rb:404)
  });
});
