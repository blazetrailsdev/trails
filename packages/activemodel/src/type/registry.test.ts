import { describe, it, expect } from "vitest";
import { Types } from "../index.js";
import { ArgumentError } from "../attribute-assignment.js";
import { TypeRegistry } from "./registry.js";

describe("RegistryTest", () => {
  it("a class can be registered for a symbol", () => {
    const registry = new TypeRegistry();
    // Rails registers a bare class — `registry.register(:foo, ::String)` — and
    // `register` wraps it in `proc { |_, *args| klass.new(*args) }`
    // (registry.rb:16). That default block is what a trails registration spells
    // out, since our `register` takes only the block form. Rails' remaining two
    // assertions (`lookup(:bar, 2, :a) == [:a, :a]`) are `Array.new(2, :a)` —
    // splatting positional args into a Ruby core class' constructor, which has
    // no counterpart here: a trails factory takes one options object.
    registry.register("foo", (_name, options) => new Types.StringType(options));
    registry.register("bar", (_name, options) => new Types.IntegerType(options));

    expect(registry.lookup("foo")).toEqual(new Types.StringType());
    expect(registry.lookup("bar")).toEqual(new Types.IntegerType());
  });

  it("a block can be registered", () => {
    const registry = new TypeRegistry();
    const calls: unknown[] = [];
    const fooType = new Types.StringType(),
      barType = new Types.IntegerType();
    registry.register("foo", (type, ...args) => {
      calls.push([type, args, "block for foo"]);
      return fooType;
    });
    registry.register("bar", (type, ...args) => {
      calls.push([type, args, "block for bar"]);
      return barType;
    });
    // Rails' third registration takes `|type, **kwargs|`; a trails factory
    // receives its options as a single object either way, so the kwargs arm is
    // the same shape as the args one and is not a separate case.

    expect(registry.lookup("foo", { limit: 1 })).toBe(fooType);
    expect(registry.lookup("foo", { limit: 2 })).toBe(fooType);
    expect(registry.lookup("bar", { limit: 3 })).toBe(barType);
    expect(calls).toEqual([
      ["foo", [{ limit: 1 }], "block for foo"],
      ["foo", [{ limit: 2 }], "block for foo"],
      ["bar", [{ limit: 3 }], "block for bar"],
    ]);
  });

  it("a reasonable error is given when no type is found", () => {
    const registry = new TypeRegistry();

    let e: unknown;
    expect(() => {
      try {
        registry.lookup("foo");
      } catch (error) {
        e = error;
        throw error;
      }
    }).toThrow(ArgumentError);

    expect((e as ArgumentError).message).toBe("Unknown type :foo");
  });
});
