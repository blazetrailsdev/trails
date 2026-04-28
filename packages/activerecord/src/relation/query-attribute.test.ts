import { describe, it, expect } from "vitest";
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

  it("isInfinite returns true for Infinity/-Infinity", () => {
    expect(new QueryAttribute("x", Infinity, intType).isInfinite()).toBe(true);
    expect(new QueryAttribute("x", -Infinity, intType).isInfinite()).toBe(true);
    expect(new QueryAttribute("x", 999, intType).isInfinite()).toBe(false);
  });

  it("isInfinite checks valueForDatabase for serializable types", () => {
    const expandingType = {
      cast: (v: unknown) => v,
      serialize: (_v: unknown) => Infinity,
    };
    const attr = new QueryAttribute("x", "anything", expandingType);
    expect(attr.isInfinite()).toBe(true);
  });

  it("isInfinite handles Ruby-style duck-typed `infinite()` (nil for finite, 1/-1 for infinite)", () => {
    const finite = { infinite: () => null };
    const positiveInf = { infinite: () => 1 };
    const negativeInf = { infinite: () => -1 };
    const passthrough = { cast: (v: unknown) => v, serialize: (v: unknown) => v };
    expect(new QueryAttribute("x", finite, passthrough).isInfinite()).toBe(false);
    expect(new QueryAttribute("x", positiveInf, passthrough).isInfinite()).toBe(true);
    expect(new QueryAttribute("x", negativeInf, passthrough).isInfinite()).toBe(true);
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
});
