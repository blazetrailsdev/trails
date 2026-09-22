import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Enumerable } from "./enumerable.js";

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
  it("map collects the block's result for each element", () => {
    expect(Enumerable.map.call(new Bag([1, 2, 3]), (i) => (i as number) * 2)).toEqual([2, 4, 6]);
  });

  it("first stops each after the first element and answers nil when empty", () => {
    const bag = new Bag([1, 2, 3]);
    expect(Enumerable.first.call(bag)).toBe(1);
    expect(bag.yielded).toBe(1);
    expect(Enumerable.first.call(new Bag([]))).toBeNull();
  });

  it("first(n) takes n elements and rejects a negative size", () => {
    const bag = new Bag([1, 2, 3]);
    expect(Enumerable.first.call(bag, 2)).toEqual([1, 2]);
    expect(bag.yielded).toBe(2);
    expect(Enumerable.first.call(bag, 0)).toEqual([]);
    expect(() => Enumerable.first.call(bag, -1)).toThrow(ArgumentError);
  });

  it("isAny? RTESTs the element, or the block's result", () => {
    expect(Enumerable.isAny.call(new Bag([null, false, 0]))).toBe(true);
    expect(Enumerable.isAny.call(new Bag([null, false]))).toBe(false);
    const bag = new Bag([1, 2, 3]);
    expect(Enumerable.isAny.call(bag, (i) => i === 1)).toBe(true);
    expect(bag.yielded).toBe(1);
  });
});
