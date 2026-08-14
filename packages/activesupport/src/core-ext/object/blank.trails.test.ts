import { describe, expect, it } from "vitest";
import { isBlank } from "../../index.js";

// `Object#blank?` is `respond_to?(:empty?) ? !!empty? : false`
// (core_ext/object/blank.rb:18-20). Its probe is for receivers that answer
// `empty?` themselves; in trails those spell it `isEmpty`, and a Ruby predicate
// ports as a METHOD, so the method shape is the one the probe exists for.
describe("Object#blank? respond_to?(:empty?) probe", () => {
  // Without the probe, `Object.keys` answers instead — and it reports an object
  // whose emptiness lives in a private field as blank whatever it holds.
  it("invokes a method-shaped isEmpty, as blank.rb:19 invokes empty?", () => {
    class Buffer {
      constructor(private readonly items: string[]) {}
      isEmpty(): boolean {
        return this.items.length === 0;
      }
    }
    expect(isBlank(new Buffer(["a"]))).toBe(false);
    expect(isBlank(new Buffer([]))).toBe(true);
  });

  // Invoking to find out is not an option — the query would already have been
  // issued — so the AsyncFunction is recognised before the call, bound or not
  // (`Function.prototype.bind` copies the target's prototype).
  it("never invokes an async isEmpty, bound or not, falling back to !self", () => {
    let called = false;
    class Relation {
      async isEmpty(): Promise<boolean> {
        called = true;
        return true;
      }
    }
    const relation = new Relation();
    // Both fall through past the probe: the instance reaches `!self`
    // (blank.rb:18-20), the literal is a Hash and carries one key.
    expect(isBlank(relation)).toBe(false);
    expect(isBlank({ isEmpty: relation.isEmpty.bind(relation) })).toBe(false);
    expect(called).toBe(false);
  });

  // Ruby's `!!` is false only for nil/false, so a predicate returning a value
  // rather than a boolean still answers; a boolean READER answers unchanged.
  it("takes Ruby truthiness from a value-returning empty?", () => {
    expect(isBlank({ isEmpty: () => 0 })).toBe(true);
    expect(isBlank({ isEmpty: () => null })).toBe(false);
    expect(isBlank({ isEmpty: true })).toBe(true);
    expect(isBlank({ empty: false })).toBe(false);
  });
});

// blank.rb has two arms behind one TS switch: `Hash#blank?` is
// `alias_method :blank?, :empty?` (blank.rb:111), and `Object#blank?` is
// `!self` (blank.rb:18-20) — always `false`, since only nil/false are falsy.
// A JS object literal is the Ruby Hash; every other object is the Ruby Object.
describe("Object#blank? vs Hash#blank?", () => {
  it("counts own keys for a Hash, per blank.rb:111", () => {
    expect(isBlank({})).toBe(true);
    expect(isBlank({ a: 1 })).toBe(false);
    expect(isBlank(Object.create(null) as object)).toBe(true);
  });

  // Ruby keeps no own keys for a getter, so `Object.keys` reporting `0` says
  // nothing about the receiver — Ruby's answer is `false` either way.
  it("answers false for a class instance with no own keys, per blank.rb:18-20", () => {
    class Config {
      get name(): string {
        return "trails";
      }
    }
    expect(isBlank(new Config())).toBe(false);

    class Slots {
      readonly #value = 1;
      value(): number {
        return this.#value;
      }
    }
    expect(isBlank(new Slots())).toBe(false);
  });
});
