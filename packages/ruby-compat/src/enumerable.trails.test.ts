import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { AsyncEnumerable, Enumerable } from "./enumerable.js";
import { include } from "./include.js";
import { Rational } from "./rational.js";

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class LazyBag {
  constructor(private readonly items: unknown[]) {}

  each(block: (i: unknown) => void): Promise<void> {
    return Promise.resolve().then(() => this.items.forEach((i) => block(i)));
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface LazyBag {
  [Symbol.iterator](): IterableIterator<unknown>;
  map<R>(block: (i: unknown) => R): Promise<R[]>;
  findAll(block: (i: unknown) => unknown): Promise<unknown[]>;
  drop(n: number): Promise<unknown[]>;
  sum(): Promise<unknown>;
  first(n?: number): Promise<unknown>;
  isAny(): Promise<boolean>;
  isInclude(val: unknown): Promise<boolean>;
}

include(LazyBag, Enumerable);

describe("Enumerable over an each that answers a promise", () => {
  it("each member answers a promise of what it answers over a synchronous each", async () => {
    const bag = new LazyBag([1, null, 2, 3]);
    expect(await bag.map((i) => i)).toEqual([1, null, 2, 3]);
    expect(await bag.findAll((i) => i)).toEqual([1, 2, 3]);
    expect(await bag.drop(2)).toEqual([2, 3]);
    expect(await new LazyBag([1, 2, 3]).sum()).toBe(6);
  });

  it("a member that breaks out of each still answers", async () => {
    const bag = new LazyBag([1, 2, 3]);
    expect(await bag.first()).toBe(1);
    expect(await bag.first(2)).toEqual([1, 2]);
    expect(await bag.isAny()).toBe(true);
    expect(await bag.isInclude(2)).toBe(true);
  });

  it("an error raised by the block rejects", async () => {
    const boom = new Error("boom");
    await expect(
      new LazyBag([1]).map(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it("Symbol.iterator raises, since each has yielded nothing yet", () => {
    expect(() => [...new LazyBag([1])]).toThrow(TypeError);
  });

  it("Symbol.iterator raises over an each that rejects, and leaves no unhandled rejection", async () => {
    const bag = new LazyBag([1]);
    const boom = new Error("boom");
    bag.each = () => Promise.reject(boom);
    expect(() => [...bag]).toThrow(TypeError);
    await expect(bag.map((i) => i)).rejects.toBe(boom);
  });
});

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

  it("any? / one? / none? test pattern === element for an argument", () => {
    class Klass {}
    const bag = new Bag([new Klass(), 1, new Klass()]);
    expect(Enumerable.isAny.call(bag, Klass)).toBe(true);
    expect(Enumerable.isAny.call(bag, String)).toBe(false);
    expect(Enumerable.isOne.call(bag, Klass)).toBe(false);
    expect(Enumerable.isOne.call(bag, (i: unknown) => i === 1)).toBe(true);
    expect(Enumerable.isOne.call(new Bag([null, 1]))).toBe(true);
    expect(Enumerable.isNone.call(bag, String)).toBe(true);
    expect(Enumerable.isNone.call(bag, Klass)).toBe(false);
    expect(Enumerable.isNone.call(new Bag([null, false]))).toBe(true);
    expect(() => Enumerable.isOne.call(bag, Klass, Klass)).toThrow(ArgumentError);
  });

  it("isAny? RTESTs the element, or the block's result", () => {
    expect(Enumerable.isAny.call(new Bag([null, false, 0]))).toBe(true);
    expect(Enumerable.isAny.call(new Bag([null, false]))).toBe(false);
    const bag = new Bag([1, 2, 3]);
    expect(Enumerable.isAny.call(bag, (i: unknown) => i === 1)).toBe(true);
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

class AsyncBag {
  constructor(private readonly items: unknown[]) {}

  each(): AsyncIterable<unknown>;
  each(block: (i: unknown) => unknown): Promise<void>;
  each(block?: (i: unknown) => unknown): AsyncIterable<unknown> | Promise<void> {
    const items = this.items;
    const enumerator = (async function* () {
      yield* items;
    })();
    if (!block) return enumerator;
    return (async () => {
      for await (const i of enumerator) await block(i);
    })();
  }
}

describe("AsyncEnumerable", () => {
  it("toA collects what each yields", async () => {
    expect(await AsyncEnumerable.toA.call(new AsyncBag([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it("sum adds the elements to the initial value, as enum_sum does", async () => {
    expect(await AsyncEnumerable.sum.call(new AsyncBag([1, 2, 3]))).toBe(6);
    expect(await AsyncEnumerable.sum.call(new AsyncBag([]))).toBe(0);
    expect(await AsyncEnumerable.sum.call(new AsyncBag([1, 2]), 10)).toBe(13);
    expect(await AsyncEnumerable.sum.call(new AsyncBag([0.1, 0.2, 0.3]))).toBe(0.6);
    expect(await AsyncEnumerable.sum.call(new AsyncBag(["a", "b"]), "x")).toBe("xab");
    const half = new Rational(1, 2);
    expect(await AsyncEnumerable.sum.call(new AsyncBag([half, half, half]))).toEqual(
      new Rational(3, 2),
    );
  });

  it("sum rejects a second initial value", async () => {
    await expect(AsyncEnumerable.sum.call(new AsyncBag([1]), 1, 2)).rejects.toThrow(
      "wrong number of arguments (given 2, expected 0..1)",
    );
    expect(() => Enumerable.sum.call(new Bag([1]), 1, 2)).toThrow(ArgumentError);
    expect(Enumerable.sum.call(new Bag([1, 2]), (i: unknown) => (i as number) * 2)).toBe(6);
  });

  it("sum awaits the block before each yields the next element", async () => {
    const events: string[] = [];
    const total = await AsyncEnumerable.sum.call(new AsyncBag([1, 2]), async (i: unknown) => {
      events.push(`enter ${i}`);
      await Promise.resolve();
      events.push(`leave ${i}`);
      return (i as number) * 2;
    });
    expect(total).toBe(6);
    expect(events).toEqual(["enter 1", "leave 1", "enter 2", "leave 2"]);
  });

  it("the async iterator reads the blockless each", async () => {
    class Included extends AsyncBag {}
    include(Included, AsyncEnumerable);
    const seen: unknown[] = [];
    for await (const i of new Included([1, 2]) as unknown as AsyncIterable<unknown>) seen.push(i);
    expect(seen).toEqual([1, 2]);
  });
});
