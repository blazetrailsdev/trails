import { describe, it, expect, vi } from "vitest";
import { BigIntegerType, IntegerType } from "@blazetrails/activemodel";
import { QueryAttribute } from "./query-attribute.js";

class StringType {
  cast(v: unknown) {
    return v == null ? null : String(v);
  }
  serialize(v: unknown) {
    return v;
  }
}

class IntType {
  cast(v: unknown) {
    return v == null ? null : Number(v);
  }
  serialize(v: unknown) {
    return v;
  }
}

const stringType = new StringType();
const intType = new IntType();

describe("QueryAttribute", () => {
  it("casts value via type", () => {
    const attr = new QueryAttribute("age", "25", intType);
    expect(attr.value).toBe(25);
    expect(attr.typeCast("25")).toBe(25);
  });

  it("memoizes cast value", () => {
    let callCount = 0;
    const countingType = {
      cast: (v: unknown) => {
        callCount++;
        return Number(v);
      },
      serialize: (v: unknown) => v,
    };
    const attr = new QueryAttribute("n", "42", countingType);
    void attr.value;
    void attr.value;
    void attr.value;
    expect(callCount).toBe(1);
  });

  it("memoizes serialized value", () => {
    let callCount = 0;
    const countingType = {
      cast: (v: unknown) => Number(v),
      serialize: (v: unknown) => {
        callCount++;
        return v;
      },
    };
    const attr = new QueryAttribute("n", "42", countingType);
    void attr.valueForDatabase;
    void attr.valueForDatabase;
    expect(callCount).toBe(1);
  });

  it("withCastValue skips re-casting", () => {
    let castCalled = false;
    const trackingType = {
      cast: (v: unknown) => {
        castCalled = true;
        return v;
      },
      serialize: (v: unknown) => v,
    };
    const attr = QueryAttribute.withCastValue("name", "already-cast", trackingType);
    expect(attr.value).toBe("already-cast");
    expect(castCalled).toBe(false);
  });

  it("isNil returns true for null/undefined", () => {
    expect(new QueryAttribute("x", null, stringType).isNil()).toBe(true);
    expect(new QueryAttribute("x", undefined, stringType).isNil()).toBe(true);
    expect(new QueryAttribute("x", "", stringType).isNil()).toBe(false);
    expect(new QueryAttribute("x", 0, stringType).isNil()).toBe(false);
  });

  it("isInfinite returns the sign for Infinity/-Infinity", () => {
    // Mirrors query_attribute.rb:42-44, whose `infinity?` yields `Float#infinite?`
    // — 1 / -1 / nil, not a boolean. Arel's between reads the sign to pick which
    // side of the range collapses; a boolean would make -Infinity look positive.
    expect(new QueryAttribute("x", Infinity, intType).isInfinite()).toBe(1);
    expect(new QueryAttribute("x", -Infinity, intType).isInfinite()).toBe(-1);
    expect(new QueryAttribute("x", 999, intType).isInfinite()).toBe(false);
  });

  it("isInfinite checks valueForDatabase for serializable types", () => {
    const expandingType = {
      cast: (v: unknown) => v,
      serialize: (_v: unknown) => Infinity,
    };
    const attr = new QueryAttribute("x", "anything", expandingType);
    expect(attr.isInfinite()).toBe(1);
  });

  it("isInfinite handles Ruby-style duck-typed `infinite()` (nil for finite, 1/-1 for infinite)", () => {
    // Rails has ONE `respond_to?(:infinite?)` protocol (query_attribute.rb:53-55),
    // which ports to `isInfinite()` — the spelling Quoted / BindParam /
    // UnboundableBound / arel's infinitySign all use. Reading a second name here
    // forked the protocol.
    const finite = { isInfinite: () => false };
    const positiveInf = { isInfinite: () => 1 };
    const negativeInf = { isInfinite: () => -1 };
    const passthrough = { cast: (v: unknown) => v, serialize: (v: unknown) => v };
    expect(new QueryAttribute("x", finite, passthrough).isInfinite()).toBe(false);
    expect(new QueryAttribute("x", positiveInf, passthrough).isInfinite()).toBe(1);
    expect(new QueryAttribute("x", negativeInf, passthrough).isInfinite()).toBe(-1);
  });

  it("equals compares name, value, and type", () => {
    const a = new QueryAttribute("age", "25", intType);
    const b = new QueryAttribute("age", "25", intType);
    const d = new QueryAttribute("name", "25", intType);
    // Same type instance → equal
    expect(a.equals(b)).toBe(true);
    // Different name → not equal
    expect(a.equals(d)).toBe(false);
    // Different instances of same Type class → equal (constructor-based)
    const intType2 = new IntType();
    const e = new QueryAttribute("age", "25", intType2);
    expect(a.equals(e)).toBe(true);
  });

  it("valueBeforeTypeCast preserves original value", () => {
    const attr = new QueryAttribute("age", "25", intType);
    expect(attr.valueBeforeTypeCast).toBe("25");
    expect(attr.value).toBe(25);
  });

  it("isUnboundable reports the sign of `value <=> 0` for an out-of-range bound", () => {
    // query_attribute.rb:45-51 — serializable? yields the cast value when it is
    // out of range for the column type; the sign tells Arel which side collapses.
    const int4 = new IntegerType({ limit: 4 });
    expect(new QueryAttribute("id", 2 ** 40, int4).isUnboundable()).toBe(1);
    expect(new QueryAttribute("id", -(2 ** 40), int4).isUnboundable()).toBe(-1);
    expect(new QueryAttribute("id", 5, int4).isUnboundable()).toBe(false);

    // The #4433 bignum path: a bigint column is Integer(limit: 8).
    const int8 = new IntegerType({ limit: 8 });
    expect(new QueryAttribute("id", 2n ** 63n, int8).isUnboundable()).toBe(1);
    expect(new QueryAttribute("id", -(2n ** 63n) - 1n, int8).isUnboundable()).toBe(-1);
    expect(new QueryAttribute("id", 2n ** 63n - 1n, int8).isUnboundable()).toBe(false);
  });

  it("isUnboundable is never true for :big_integer, whose max_value is INFINITY", () => {
    // big_integer.rb:33 — in_range? is always true, so serializable? never
    // yields and unboundable? stays nil however large the value.
    const big = new BigIntegerType();
    expect(new QueryAttribute("id", 2n ** 63n, big).isUnboundable()).toBe(false);
    expect(new QueryAttribute("id", -(2n ** 100n), big).isUnboundable()).toBe(false);
  });

  it("isUnboundable memoizes so the value is inspected exactly once", () => {
    // query_attribute.rb:45-51 guards with `unless defined?(@_unboundable)`, so
    // the check happens once however often the predicate is read — and both
    // `between` and the visitor read it.
    const int4 = new IntegerType({ limit: 4 });
    const spy = vi.spyOn(int4, "isSerializable");

    // The `false` result caches too — Rails assigns on both paths, so `defined?`
    // is true either way.
    const inRange = new QueryAttribute("id", 5, int4);
    expect(inRange.isUnboundable()).toBe(false);
    expect(inRange.isUnboundable()).toBe(false);
    expect(inRange.isUnboundable()).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    const outOfRange = new QueryAttribute("id", 2 ** 40, int4);
    expect(outOfRange.isUnboundable()).toBe(1);
    expect(outOfRange.isUnboundable()).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
