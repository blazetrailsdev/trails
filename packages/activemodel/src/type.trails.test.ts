import { describe, it, expect } from "vitest";
import * as Types from "./index.js";
import { TypeRegistry } from "./type/registry.js";

describe("Type#itselfIfSerializeCastValueCompatible", () => {
  it("a subclass inheriting both from Type::Value is incompatible", () => {
    class Base extends Types.ValueType<string> {
      readonly name = "base";
      cast(v: unknown) {
        return v as string;
      }
    }
    expect(new Base().itselfIfSerializeCastValueCompatible()).toBeNull();
  });

  it("subclass that overrides only serialize is incompatible", () => {
    class SerializeOnly extends Types.ValueType<string> {
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
    class Both extends Types.ValueType<string> {
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
    class CastOnly extends Types.ValueType<string> {
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

describe("Type.registry= (type.rb:25)", () => {
  it("register and lookup go through the assigned registry", () => {
    const original = Types.Type.registry();
    const registry = new TypeRegistry();
    try {
      Types.Type.setRegistry(registry);
      expect(Types.Type.registry()).toBe(registry);
      expect(() => Types.Type.lookup("string")).toThrow("Unknown type :string");
      Types.Type.register("string", Types.StringType);
      expect(Types.Type.lookup("string")).toBeInstanceOf(Types.StringType);
    } finally {
      Types.Type.setRegistry(original);
    }
    expect(Types.Type.registry()).toBe(original);
  });
});
