import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("BinaryTest", () => {
  it("type cast binary", () => {
    const type = new Types.BinaryType();

    expect(type.cast(null)).toBeNull();
    expect(type.cast(1)).toBe(1);

    // Rails: `assert_equal "1", type.cast("1")` — `cast` answers `"1".b`, and a
    // BINARY-encoded Ruby String is a `Uint8Array` in trails.
    expect(type.cast("1")).toEqual(new TextEncoder().encode("1"));
    // Rails: `assert_equal Encoding::BINARY, type.cast("1").encoding`. A JS string
    // carries no encoding, so the equivalent claim is that the cast value is a
    // `Uint8Array` — trails' BINARY-encoded String — and not a String.
    expect((type.cast("1") as object).constructor).toBe(Uint8Array);

    expect(type.cast("ƒée")).toEqual(new TextEncoder().encode("ƒée"));
    expect(type.cast("ƒée")).not.toEqual("ƒée");
  });

  it("serialize binary strings", () => {
    const type = new Types.BinaryType();
    // Rails: `assert_equal "ƒée".b, type.serialize("ƒée")` — serialize returns a
    // `Type::Binary::Data` (binary.rb:31) that `==`-compares to the BINARY-encoded
    // byte string. Our `Uint8Array` stands in for that byte string.
    expect(type.serialize("ƒée")!.bytes).toEqual(new TextEncoder().encode("ƒée"));
    // Rails' second assertion is meaningful only because `Data#==` (binary.rb:55-57)
    // compares against a String and the UTF-8/BINARY encoding difference makes them
    // unequal. JS has no operator overloading, so this holds for any `Data` — the
    // byte assertion above carries the real content.
    expect(type.serialize("ƒée")).not.toEqual("ƒée");
  });
});
