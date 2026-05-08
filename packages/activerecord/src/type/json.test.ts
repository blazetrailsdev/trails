/**
 * Unit tests for ActiveRecord::Type::Json (cast behavior).
 * Integration tests (changes_in_place, etc.) live in json_shared_test_cases.rb
 * and are ported to adapters/postgresql/json.test.ts etc.
 */
import { describe, it, expect } from "vitest";
import { Json } from "./json.js";

describe("Json", () => {
  const type = new Json();

  it("cast detaches non-string input from the original reference", () => {
    const input = { a: 1 };
    const result = type.cast(input);
    expect(result).toEqual({ a: 1 });
    expect(result).not.toBe(input);
  });

  it("cast parses string input", () => {
    expect(type.cast('{"a":1}')).toEqual({ a: 1 });
  });

  it("cast returns null for null or undefined", () => {
    expect(type.cast(null)).toBeNull();
    expect(type.cast(undefined)).toBeNull();
  });

  it("cast round-trips arrays without aliasing", () => {
    const input = [1, 2, 3];
    const result = type.cast(input);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(input);
  });
});
