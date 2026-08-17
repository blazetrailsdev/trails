import { describe, it, expect } from "vitest";
import { Types } from "./index.js";
import { register, lookup } from "./type.js";

describe("TypeTest", () => {
  it("registering a new type", () => {
    // Rails uses `Struct.new(:args)` and `Type.lookup(:foo, :arg)` — a bare
    // positional argument. trails' registry models Rails'
    // `proc { |_, *args| klass.new(*args) }` (registry.rb:16) as a single
    // options object, so the forwarded argument is spelled as one here; what
    // the test pins either way is that `lookup` forwards it at all.
    class type extends Types.ValueType {
      constructor(readonly args: unknown) {
        super();
      }
    }
    register("foo", (_name, args) => new type(args));

    expect(lookup("foo", { precision: 1 })).toEqual(new type({ precision: 1 }));
    expect(lookup("foo", {})).toEqual(new type({}));
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
