import { describe, it, expect } from "vitest";
import { Types, BinaryData } from "../index.js";

describe("BinaryTest", () => {
  it("type cast binary", () => {
    const type = new Types.BinaryType();
    expect(type.cast(null)).toBe(null);
    const result = type.cast("hello");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result!)).toBe("hello");
  });

  it("serialize binary strings", () => {
    const type = new Types.BinaryType();
    // Rails: `assert_equal "ƒée".b, type.serialize("ƒée")` — serialize returns a
    // `Type::Binary::Data` (binary.rb:31) that `==`-compares to the BINARY-encoded
    // byte string. Our `Uint8Array` stands in for that byte string.
    const result = type.serialize("ƒée");
    expect(result).toBeInstanceOf(BinaryData);
    expect(result!.bytes).toEqual(new TextEncoder().encode("ƒée"));
    // Rails: `assert_not_equal "ƒée", type.serialize("ƒée")` — the serialized value
    // is not the UTF-8 string itself.
    expect(result).not.toBe("ƒée");
    expect(type.serialize(null)).toBe(null);
  });
});
