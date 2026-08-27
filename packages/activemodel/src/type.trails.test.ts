import { describe, it, expect } from "vitest";
import { Types } from "./index.js";

describe("Type#itselfIfSerializeCastValueCompatible", () => {
  it("base Type is compatible (both methods at the base class)", () => {
    class Base extends Types.Type<string> {
      readonly name = "base";
      cast(v: unknown) {
        return v as string;
      }
    }
    expect(new Base().itselfIfSerializeCastValueCompatible()).toBeInstanceOf(Base);
  });

  it("subclass that overrides only serialize is incompatible", () => {
    class SerializeOnly extends Types.Type<string> {
      readonly name = "serialize_only";
      cast(v: unknown) {
        return v as string;
      }
      override serialize(v: unknown) {
        return `s:${v}`;
      }
    }
    expect(new SerializeOnly().itselfIfSerializeCastValueCompatible()).toBeNull();
  });

  it("subclass that overrides both stays compatible", () => {
    class Both extends Types.Type<string> {
      readonly name = "both";
      cast(v: unknown) {
        return v as string;
      }
      override serialize(v: unknown) {
        return `s:${v}`;
      }
      override serializeCastValue(v: string | null) {
        return `c:${v}`;
      }
    }
    expect(new Both().itselfIfSerializeCastValueCompatible()).toBeInstanceOf(Both);
  });

  it("subclass overriding only serializeCastValue stays compatible", () => {
    class CastOnly extends Types.Type<string> {
      readonly name = "cast_only";
      cast(v: unknown) {
        return v as string;
      }
      override serializeCastValue(v: string | null) {
        return `c:${v}`;
      }
    }
    expect(new CastOnly().itselfIfSerializeCastValueCompatible()).toBeInstanceOf(CastOnly);
  });
});
