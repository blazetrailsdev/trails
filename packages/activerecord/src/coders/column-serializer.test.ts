import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
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
    expect(() => cs.assertValidValue(42, { action: "dump" })).not.toThrow();
    expect(() => cs.assertValidValue(true, { action: "dump" })).not.toThrow();
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
    expect(() => cs.assertValidValue("not a list", { action: "dump" })).toThrow(
      SerializationTypeMismatch,
    );
  });

  it("check_arity_of_constructor raises for classes that throw during construction", () => {
    // Rails rescues ArgumentError alone (column_serializer.rb:56) and re-raises
    // it as the "0 argument constructor" ArgumentError; anything else the
    // constructor raises propagates unchanged.
    class ThrowsOnConstruct {
      constructor() {
        throw new Error("cannot construct without args");
      }
    }
    expect(() => new ColumnSerializer("attr", JsonCoder, ThrowsOnConstruct)).toThrow(
      "cannot construct without args",
    );

    class ThrowsArgumentErrorOnConstruct {
      constructor() {
        throw new ArgumentError("wrong number of arguments");
      }
    }
    expect(() => new ColumnSerializer("attr", JsonCoder, ThrowsArgumentErrorOnConstruct)).toThrow(
      "Cannot serialize ThrowsArgumentErrorOnConstruct. Classes passed to `serialize` must have" +
        " a 0 argument constructor.",
    );
  });
});
