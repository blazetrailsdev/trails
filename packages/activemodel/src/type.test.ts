import { describe, it, expect } from "vitest";
import { Types } from "./index.js";
import { register, lookup } from "./type.js";

describe("TypeTest", () => {
  it("registering a new type", () => {
    // Rails uses `Struct.new(:args)` and `Type.lookup(:foo, :arg)` — bare
    // positional arguments. trails' registry models Rails'
    // `proc { |_, *args| klass.new(*args) }` (registry.rb:16) as a single options
    // object, so they are spelled as option objects here; what the test pins
    // either way is that `lookup` forwards its argument at all. TS has rest args,
    // so this is trails debt rather than a language shortcoming — tracked as
    // 0105-ar-deps-test-parity-100/type-registry-variadic-lookup-forwarding.
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
