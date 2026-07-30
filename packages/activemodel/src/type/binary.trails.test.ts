import { describe, it, expect } from "vitest";
import { Types, BinaryData } from "../index.js";

/**
 * Trails-only extras for ActiveModel::Type::Binary. Rails'
 * `test_serialize_binary_strings` (activemodel/test/cases/type/binary_test.rb:21)
 * has exactly two assertions and does not cover these; they live here rather
 * than widening a Rails-mapped test.
 */
describe("BinaryTypeTrails", () => {
  it("serialize returns null for nil rather than wrapping it", () => {
    // Rails: `return if value.nil?` guards before `Data.new(super)`
    // (binary.rb:31) — nil must not become a Data wrapping "".
    const type = new Types.BinaryType();
    expect(type.serialize(null)).toBe(null);
    expect(type.serialize(undefined)).toBe(null);
  });

  it("serialize wraps bytes without copying or decoding them", () => {
    // `super` is Value#serialize (identity), so the raw value reaches Data and
    // the bytes are preserved exactly — 0x80 is not valid UTF-8 on its own.
    const type = new Types.BinaryType();
    const bytes = new Uint8Array([0x80, 0xde, 0xad]);
    const result = type.serialize(bytes);
    expect(result).toBeInstanceOf(BinaryData);
    expect(result!.bytes).toEqual(bytes);
  });

  it("Data#equals compares bytes, not the decoded string", () => {
    // binary.rb:56 `other == to_s || super` compares against the raw binary
    // String, so it is a byte comparison. Routing through our `toString()`
    // instead would UTF-8-decode: both of these byte strings decode to a pair
    // of U+FFFD replacements and would wrongly compare equal.
    const a = new BinaryData(new Uint8Array([0x80, 0x81]));
    const b = new BinaryData(new Uint8Array([0x82, 0x83]));
    expect(a.equals(b)).toBe(false);
    expect(a.equals(new BinaryData(new Uint8Array([0x80, 0x81])))).toBe(true);
  });

  it("Data#equals accepts the byte sources that stand in for a Ruby String", () => {
    const data = new BinaryData("hello");
    expect(data.equals("hello")).toBe(true);
    expect(data.equals(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]))).toBe(true);
    expect(data.equals("hell")).toBe(false);
    expect(data.equals("hellO")).toBe(false);
  });

  it("Data#equals is false for values Ruby would fall through to identity on", () => {
    // The `|| super` arm is Object#== — identity — so a non-string, non-byte
    // `other` can never match.
    const data = new BinaryData("1");
    expect(data.equals(1)).toBe(false);
    expect(data.equals(null)).toBe(false);
    expect(data.equals(undefined)).toBe(false);
    expect(data.equals(data)).toBe(true);
  });
});
