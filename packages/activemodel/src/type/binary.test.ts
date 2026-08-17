import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("BinaryTest", () => {
  it("type cast binary", () => {
    const type = new Types.BinaryType();

    expect(type.cast(null)).toBeNull();
    expect(type.cast(1)).toBe(1);

    expect(type.cast("1")).toEqual(new TextEncoder().encode("1"));
    // A JS string carries no encoding, so Rails' `.encoding == Encoding::BINARY`
    // is the claim that the cast value is a `Uint8Array` — trails' BINARY-encoded
    // String — rather than a String.
    expect((type.cast("1") as object).constructor).toBe(Uint8Array);

    expect(type.cast("ƒée")).toEqual(new TextEncoder().encode("ƒée"));
    expect(type.cast("ƒée")).not.toEqual("ƒée");
  });

  it("serialize binary strings", () => {
    const type = new Types.BinaryType();
    // `serialize` returns a `Type::Binary::Data` (binary.rb:31) that `==`-compares
    // to the BINARY-encoded byte string; `Uint8Array` stands in for that string.
    // The `assert_not_equal` arm turns on `Data#==` (binary.rb:55-57), which JS has
    // no operator overloading for, so it holds for any `Data`.
    expect(type.serialize("ƒée")!.bytes).toEqual(new TextEncoder().encode("ƒée"));
    expect(type.serialize("ƒée")).not.toEqual("ƒée");
  });
});
