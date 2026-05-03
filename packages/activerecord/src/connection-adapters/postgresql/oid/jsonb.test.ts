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
});
