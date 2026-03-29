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
    expect(attr.typeCast()).toBe(25);
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
    attr.valueForDatabase();
    attr.valueForDatabase();
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

  it("equals compares name, value, and type", () => {
    const a = new QueryAttribute("age", "25", intType);
    const b = new QueryAttribute("age", "25", intType);
    const c = new QueryAttribute("age", "25", stringType);
    const d = new QueryAttribute("name", "25", intType);
    // Same type instance → equal
    expect(a.equals(b)).toBe(true);
    // Different type instance, different class → not equal
    expect(a.equals(c)).toBe(false);
    // Different name → not equal
    expect(a.equals(d)).toBe(false);
    // Different instances of same Type class → equal (constructor-based)
    const intType2 = new IntType();
    const e = new QueryAttribute("age", "25", intType2);
    expect(a.equals(e)).toBe(true);
    // Plain objects with same shape → not equal (constructor is Object)
    const plainType1 = { cast: (v: unknown) => v, serialize: (v: unknown) => v };
    const plainType2 = { cast: (v: unknown) => v, serialize: (v: unknown) => v };
    const f = new QueryAttribute("age", "25", plainType1);
    const g = new QueryAttribute("age", "25", plainType2);
    expect(f.equals(g)).toBe(false);
  });

  it("valueBeforeTypeCast preserves original value", () => {
    const attr = new QueryAttribute("age", "25", intType);
    expect(attr.valueBeforeTypeCast).toBe("25");
    expect(attr.value).toBe(25);
  });
});
