import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Enumerable } from "./enumerable.js";
import { include } from "./include.js";

class Bag {
  yielded = 0;
  constructor(private readonly items: unknown[]) {}

  each(block: (i: unknown) => void): void {
    for (const i of this.items) {
      this.yielded += 1;
      block(i);
    }
  }
}

describe("Enumerable", () => {
  it("findAll keeps each element whose block result RTESTs", () => {
    expect(Enumerable.findAll.call(new Bag([1, null, 0, false, ""]), (i) => i)).toEqual([1, 0, ""]);
  });

  it("map collects the block's result for each element", () => {
    expect(Enumerable.map.call(new Bag([1, 2, 3]), (i) => (i as number) * 2)).toEqual([2, 4, 6]);
  });

  it("first stops each after the first element and answers nil when empty", () => {
    const bag = new Bag([1, 2, 3]);
    expect(Reflect.apply(Enumerable.first, bag, [])).toBe(1);
    expect(bag.yielded).toBe(1);
    expect(Reflect.apply(Enumerable.first, new Bag([]), [])).toBeNull();
  });

  it("first(n) takes n elements and rejects a negative size", () => {
    const bag = new Bag([1, 2, 3]);
    expect(Enumerable.first.call(bag, 2)).toEqual([1, 2]);
    expect(bag.yielded).toBe(2);
    expect(Enumerable.first.call(bag, 0)).toEqual([]);
    expect(() => Enumerable.first.call(bag, -1)).toThrow(ArgumentError);
  });

  it("drop skips n elements and rejects a negative size", () => {
    const bag = new Bag([1, 2, 3]);
    expect(Enumerable.drop.call(bag, 1)).toEqual([2, 3]);
    expect(Enumerable.drop.call(bag, 0)).toEqual([1, 2, 3]);
    expect(Enumerable.drop.call(bag, 50)).toEqual([]);
    expect(() => Enumerable.drop.call(bag, -1)).toThrow(ArgumentError);
  });

  it("isAny? RTESTs the element, or the block's result", () => {
    expect(Enumerable.isAny.call(new Bag([null, false, 0]))).toBe(true);
    expect(Enumerable.isAny.call(new Bag([null, false]))).toBe(false);
    const bag = new Bag([1, 2, 3]);
    expect(Enumerable.isAny.call(bag, (i) => i === 1)).toBe(true);
    expect(bag.yielded).toBe(1);
  });

  it("select is findAll", () => {
    expect(Enumerable.select).toBe(Enumerable.findAll);
  });

  it("isInclude asks rb_equal of each element and stops at the first hit", () => {
    const eq = { equals: (other: unknown) => other === "x" };
    const bag = new Bag([1, eq, 3]);
    expect(Enumerable.isInclude.call(bag, "x")).toBe(true);
    expect(bag.yielded).toBe(2);
    expect(Enumerable.isInclude.call(new Bag([1, 2]), "1")).toBe(false);
  });

  it("Symbol.iterator iterates what each yields, on an includer", () => {
    class Included extends Bag {}
    include(Included, Enumerable);
    const bag = new Included([1, 2, 3]) as Included & Iterable<unknown>;
    expect([...bag]).toEqual([1, 2, 3]);
    expect(Array.from(bag)).toEqual([1, 2, 3]);
    const seen: unknown[] = [];
    for (const i of bag) seen.push(i);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("an includer's own Symbol.iterator is not replaced", () => {
    class Own extends Bag {
      *[Symbol.iterator](): IterableIterator<unknown> {
        yield "own";
      }
    }
    include(Own, Enumerable);
    expect([...new Own([1])]).toEqual(["own"]);
  });

  it("Symbol.iterator sits beneath the includer and above its superclass", () => {
    class Parent extends Bag {
      *[Symbol.iterator](): IterableIterator<unknown> {
        yield "parent";
      }
    }
    class Child extends Parent {}
    include(Child, Enumerable);
    expect([...new Child([1, 2])]).toEqual([1, 2]);
    expect([...new Parent([1, 2])]).toEqual(["parent"]);
  });
});
