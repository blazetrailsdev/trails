import { describe, it, expect } from "vitest";
import { Types } from "./index.js";

describe("TypeTest", () => {
  it("registering a new type", () => {
    class CustomType extends Types.Type<string> {
      readonly name = "custom";
      cast(value: unknown) {
        return value === null ? null : `custom:${value}`;
      }
    }
    Types.typeRegistry.register("custom_test", () => new CustomType());
    const type = Types.typeRegistry.lookup("custom_test");
    expect(type.cast("hello")).toBe("custom:hello");
  });
});

describe("Type#itselfIfSerializeCastValueCompatible", () => {
  // Mirrors serialize_cast_value.rb:9-12 — compatible when
  // serialize_cast_value is defined at or above serialize in the
  // ancestor chain. Subclasses that override only `serialize` push it
  // below the inherited cast-value owner and become incompatible.
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
