import { describe, expect, it } from "vitest";
import { isBlank, presence } from "../../index.js";

describe("Object#blank? respond_to?(:empty?) probe", () => {
  it("reads a String held as its bytes as String#blank? does", () => {
    expect([[], [0x20, 0x0a], [0x7b]].map((b) => isBlank(Uint8Array.from(b)))).toEqual([
      true,
      true,
      false,
    ]);
  });

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

describe("Object#presence on a thenable with an async blank?", () => {
  class Lazy {
    evaluated = 0;
    constructor(private readonly blank: boolean) {}
    async isBlank(): Promise<boolean> {
      return this.blank;
    }
    then(onfulfilled: (value: string[]) => unknown): unknown {
      this.evaluated++;
      return Promise.resolve(["record"]).then(onfulfilled);
    }
  }

  it("answers self unevaluated, per blank.rb:45-47", async () => {
    const lazy = new Lazy(false);
    const present = await presence(lazy);
    expect(present).toBeInstanceOf(Lazy);
    expect(lazy.evaluated).toBe(0);
    expect("then" in present!).toBe(false);
  });

  it("answers nil when blank", async () => {
    expect(await presence(new Lazy(true))).toBeNull();
  });
});
