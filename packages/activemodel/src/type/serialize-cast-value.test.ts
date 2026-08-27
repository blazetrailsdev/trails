import { describe, it, expect } from "vitest";
import { Type } from "./value.js";
import { SerializeCastValue } from "./serialize-cast-value.js";

function includeSerializeCastValue(klass: { prototype: object }): void {
  const proto = klass.prototype as Record<string, unknown>;
  if (!("serializeCastValue" in proto)) {
    proto.serializeCastValue = SerializeCastValue.serializeCastValue;
  }
  proto.itselfIfSerializeCastValueCompatible = Type.prototype.itselfIfSerializeCastValueCompatible;
  (klass as unknown as Record<string, unknown>).serializeCastValueCompatible =
    Type.serializeCastValueCompatible;
}

function DelegateClass(protoToForward: object): {
  new (delegated: object): { __getobj__: object };
  prototype: object;
} {
  class Delegator {
    constructor(readonly __getobj__: object) {}
  }
  const names = new Set<string>();
  for (let proto: object | null = protoToForward; proto && proto !== Object.prototype; ) {
    for (const name of Object.getOwnPropertyNames(proto)) names.add(name);
    proto = Object.getPrototypeOf(proto);
  }
  for (const name of names) {
    if (name === "constructor") continue;
    (Delegator.prototype as unknown as Record<string, unknown>)[name] = function (
      this: { __getobj__: Record<string, (...a: unknown[]) => unknown> },
      ...args: unknown[]
    ) {
      return this.__getobj__[name](...args);
    };
  }
  return Delegator;
}

describe("SerializeCastValueTest", () => {
  class DoesNotIncludeModule {
    serialize(value: unknown): string {
      return `serialize(${value})`;
    }
  }

  class IncludesModule extends DoesNotIncludeModule {
    serializeCastValue(value: unknown): string {
      return `serialize_cast_value(${SerializeCastValue.serializeCastValue(value)})`;
    }

    static {
      includeSerializeCastValue(this);
    }
  }

  it("provides a default #serialize_cast_value implementation", () => {
    class type extends DoesNotIncludeModule {
      static {
        includeSerializeCastValue(this);
      }
    }
    const serializeCastValue = (new type() as unknown as Record<string, (v: unknown) => unknown>)
      .serializeCastValue;
    expect(serializeCastValue("foo")).toBe("foo");
  });

  it("uses #serialize when a class does not include SerializeCastValue", () => {
    assertSerializesUsing("serialize", new DoesNotIncludeModule());
  });

  it("uses #serialize_cast_value when a class includes SerializeCastValue", () => {
    assertSerializesUsing("serialize_cast_value", new IncludesModule());
  });

  it("uses #serialize_cast_value when a subclass inherits both #serialize and #serialize_cast_value", () => {
    class subclass extends IncludesModule {}
    assertSerializesUsing("serialize_cast_value", new subclass());
  });

  it("uses #serialize when a subclass defines a newer #serialize implementation", () => {
    class subclass extends IncludesModule {
      override serialize(value: unknown): string {
        return super.serialize(value);
      }
    }
    assertSerializesUsing("serialize", new subclass());
  });

  it("uses #serialize_cast_value when a subclass defines a newer #serialize_cast_value implementation", () => {
    class subclass extends IncludesModule {
      override serializeCastValue(value: unknown): string {
        return super.serializeCastValue(value);
      }
    }
    assertSerializesUsing("serialize_cast_value", new subclass());
  });

  it("uses #serialize when a subclass defines a newer #serialize implementation via a module", () => {
    const mod = { serialize: DoesNotIncludeModule.prototype.serialize };
    class subclass extends IncludesModule {
      static {
        Object.assign(this.prototype, mod);
      }
    }
    assertSerializesUsing("serialize", new subclass());
  });

  it("uses #serialize_cast_value when a subclass defines a newer #serialize_cast_value implementation via a module", () => {
    const mod = { serializeCastValue: IncludesModule.prototype.serializeCastValue };
    class subclass extends IncludesModule {
      static {
        Object.assign(this.prototype, mod);
      }
    }
    assertSerializesUsing("serialize_cast_value", new subclass());
  });

  it("uses #serialize when a delegate class does not include SerializeCastValue", () => {
    const delegateClass = DelegateClass(IncludesModule.prototype);
    assertSerializesUsing("serialize", new delegateClass(new IncludesModule()));
  });

  it("uses #serialize_cast_value when a delegate class prepends SerializeCastValue", () => {
    const delegateClass = DelegateClass(IncludesModule.prototype);
    includeSerializeCastValue(delegateClass);
    assertSerializesUsing("serialize_cast_value", new delegateClass(new IncludesModule()));
  });

  it("uses #serialize_cast_value when a delegate class subclass includes SerializeCastValue", () => {
    class delegateSubclass extends DelegateClass(IncludesModule.prototype) {
      static {
        includeSerializeCastValue(this);
      }
    }
    assertSerializesUsing("serialize_cast_value", new delegateSubclass(new IncludesModule()));
  });

  function assertSerializesUsing(methodName: string, type: object): void {
    expect(
      SerializeCastValue.serialize(
        type as Parameters<typeof SerializeCastValue.serialize>[0],
        "foo",
      ),
    ).toBe(`${methodName}(foo)`);
  }
});
