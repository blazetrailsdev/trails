import { describe, expect, it } from "vitest";
import { isBlank } from "../../index.js";

describe("Object#blank? respond_to?(:empty?) probe", () => {
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

  it("never invokes an async isEmpty, bound or not, falling back to !self", () => {
    let called = false;
    class Relation {
      async isEmpty(): Promise<boolean> {
        called = true;
        return true;
      }
    }
    const relation = new Relation();
    expect(isBlank(relation)).toBe(false);
    expect(isBlank({ isEmpty: relation.isEmpty.bind(relation) })).toBe(false);
    expect(called).toBe(false);
  });

  it("takes Ruby truthiness from a value-returning empty?", () => {
    expect(isBlank({ isEmpty: () => 0 })).toBe(true);
    expect(isBlank({ isEmpty: () => null })).toBe(false);
    expect(isBlank({ isEmpty: true })).toBe(true);
    expect(isBlank({ empty: false })).toBe(false);
  });
});

describe("Object#blank? vs Hash#blank?", () => {
  it("counts own keys for a Hash, per blank.rb:111", () => {
    expect(isBlank({})).toBe(true);
    expect(isBlank({ a: 1 })).toBe(false);
    expect(isBlank(Object.create(null) as object)).toBe(true);
  });

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
