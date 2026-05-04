import { describe, it, expect } from "vitest";
import { Jsonb } from "./jsonb.js";

describe("PostgreSQL::OID::Jsonb", () => {
  it("type() and name both return jsonb", () => {
    const t = new Jsonb();
    expect(t.type()).toBe("jsonb");
    expect(t.name).toBe("jsonb");
  });

  it("cast parses JSON strings", () => {
    const t = new Jsonb();
    expect(t.cast('{"a":1}')).toEqual({ a: 1 });
    expect(t.cast({ a: 1 })).toEqual({ a: 1 });
    expect(t.cast(null)).toBeNull();
  });

  it("serialize encodes objects to JSON strings", () => {
    const t = new Jsonb();
    const serialized = t.serialize({ a: 1 });
    expect(JSON.parse(serialized as string)).toEqual({ a: 1 });
    expect(t.serialize(null)).toBeNull();
  });

  it("isMutable returns true", () => {
    expect(new Jsonb().isMutable()).toBe(true);
  });

  it("cast returns a detached copy for object inputs", () => {
    const t = new Jsonb();
    const input = { a: 1 };
    const result = t.cast(input);
    expect(result).toEqual({ a: 1 });
    expect(result).not.toBe(input);
  });

  it("isChangedInPlace returns false for serialize-equal values", () => {
    const t = new Jsonb();
    const raw = t.serialize({ a: 1 }) as string;
    expect(t.isChangedInPlace(raw, { a: 1 })).toBe(false);
  });

  it("isChangedInPlace returns true for serialize-different values", () => {
    const t = new Jsonb();
    const raw = t.serialize({ a: 1 }) as string;
    expect(t.isChangedInPlace(raw, { a: 2 })).toBe(true);
  });
});
