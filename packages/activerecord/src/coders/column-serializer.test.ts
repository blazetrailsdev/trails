import { describe, it, expect } from "vitest";
import { ColumnSerializer } from "./column-serializer.js";
import { JSON as JsonCoder } from "./json.js";
import { SerializationTypeMismatch } from "../errors.js";

describe("ColumnSerializerTest", () => {
  it("dump returns nil for nil", () => {
    const cs = new ColumnSerializer("attr", JsonCoder);
    expect(cs.dump(null)).toBeNull();
  });

  it("dump serializes valid object", () => {
    const cs = new ColumnSerializer("attr", JsonCoder);
    const result = cs.dump({ a: 1 });
    expect(typeof result).toBe("string");
  });

  it("load returns null for nil payload with Object class", () => {
    const cs = new ColumnSerializer("attr", JsonCoder);
    expect(cs.load(null)).toBeNull();
  });

  it("dump and assert_valid_value accept primitives when no objectClass given", () => {
    const cs = new ColumnSerializer("attr", JsonCoder);
    // Default objectClass is Object — mirrors Ruby `Object === anything` (no restriction).
    expect(() => cs.dump(1)).not.toThrow();
    expect(() => cs.dump("hello")).not.toThrow();
    expect(() => cs.assertValidValue(42, "dump")).not.toThrow();
    expect(() => cs.assertValidValue(true, "dump")).not.toThrow();
  });

  it("load returns new instance for nil payload with custom class", () => {
    class MyList {
      items: unknown[] = [];
    }
    const cs = new ColumnSerializer("attr", JsonCoder, MyList);
    const result = cs.load(null);
    expect(result).toBeInstanceOf(MyList);
  });

  it("assert_valid_value raises SerializationTypeMismatch on wrong class", () => {
    class MyList {
      items: unknown[] = [];
    }
    const cs = new ColumnSerializer("attr", JsonCoder, MyList);
    expect(() => cs.assertValidValue("not a list", "dump")).toThrow(SerializationTypeMismatch);
  });

  it("check_arity_of_constructor raises for classes that throw during construction", () => {
    // Rails catches ArgumentError from `ObjectClass.new` with no args.
    // In JS, we detect constructors that throw when called with no arguments.
    class ThrowsOnConstruct {
      constructor() {
        throw new Error("cannot construct without args");
      }
    }
    expect(() => new ColumnSerializer("attr", JsonCoder, ThrowsOnConstruct)).toThrow(TypeError);
  });
});
