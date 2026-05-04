import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/activesupport";
import { MutableModule } from "./mutable.js";
import { ValueType } from "../value.js";

class FakeJsonType extends ValueType<unknown> {
  readonly name = "fake_json";

  override serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    return JSON.stringify(value);
  }

  override deserialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return JSON.parse(value);
    return value;
  }
}

include(FakeJsonType, MutableModule);

describe("MutableModule", () => {
  it("included class instances satisfy instanceof the base class", () => {
    const instance = new FakeJsonType();
    expect(instance).toBeInstanceOf(FakeJsonType);
    expect(instance).toBeInstanceOf(ValueType);
  });

  it("isMutable returns true", () => {
    expect(new FakeJsonType().isMutable()).toBe(true);
  });

  it("cast round-trips through serialize/deserialize producing a detached copy", () => {
    const t = new FakeJsonType();
    const input = { a: 1 };
    const result = t.cast(input);
    expect(result).toEqual({ a: 1 });
    expect(result).not.toBe(input);
  });

  it("mutating input after cast does not affect the cast output", () => {
    const t = new FakeJsonType();
    const input: Record<string, number> = { a: 1 };
    const result = t.cast(input) as Record<string, number>;
    input.a = 99;
    expect(result.a).toBe(1);
  });

  it("isChangedInPlace returns false for serialize-equal values", () => {
    const t = new FakeJsonType();
    expect(t.isChangedInPlace('{"a":1}', { a: 1 })).toBe(false);
  });

  it("isChangedInPlace returns true for serialize-different values", () => {
    const t = new FakeJsonType();
    expect(t.isChangedInPlace('{"a":1}', { a: 2 })).toBe(true);
  });

  it("isChangedInPlace returns false when same object reassigned with deep-equal value", () => {
    const t = new FakeJsonType();
    const original = { x: 42 };
    const rawOld = t.serialize(original) as string;
    const newValue = { x: 42 };
    expect(t.isChangedInPlace(rawOld, newValue)).toBe(false);
  });
});
