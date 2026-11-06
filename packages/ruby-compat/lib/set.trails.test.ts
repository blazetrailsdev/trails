import { describe, it, expect } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Set } from "./set.js";

describe("Set", () => {
  it("compares members by eql?, so an equal Array is the same member", () => {
    const set = new Set<unknown>([[1, 2], 3]);
    set.add([1, 2]);

    expect(set.size).toBe(2);
    expect(set.has([1, 2])).toBe(true);
    expect([...set]).toEqual([[1, 2], 3]);
  });

  it("subtract deletes every member eql? to one the enumerable yields", () => {
    const set = new Set<unknown>([[1, 2], [3, 4], 5]);

    expect(set.subtract([[1, 2], 5, 6])).toBe(set);
    expect([...set]).toEqual([[3, 4]]);
    expect(set.delete([9, 9])).toBe(false);
    set.clear();
    expect(set.has([3, 4])).toBe(false);
  });

  it("union, difference, intersection and symmetricDifference compare by eql? and answer a Set", () => {
    const set = new Set<unknown>([[1, 2], 3]);

    const union = set.union(new Set<unknown>([[1, 2], 4]));
    expect(union).toBeInstanceOf(Set);
    expect([...union]).toEqual([[1, 2], 3, 4]);
    expect([...set]).toEqual([[1, 2], 3]);
    expect([...set.union([[1, 2], 5])]).toEqual([[1, 2], 3, 5]);
    expect([...set.difference([[1, 2]])]).toEqual([3]);
    expect([...set.intersection(new Set<unknown>([[1, 2], 4]))]).toEqual([[1, 2]]);
    expect([...set.intersection([3, 4])]).toEqual([3]);
    expect([...set.symmetricDifference([[1, 2], 4])]).toEqual([4, 3]);
    expect(set.compareByIdentity().union([]).isCompareByIdentity()).toBe(true);
  });

  it("isSupersetOf, isSubsetOf and isDisjointFrom compare by eql?", () => {
    const set = new Set<unknown>([[1, 2], 3]);

    expect(set.isSupersetOf(new Set<unknown>([[1, 2], 3]))).toBe(true);
    expect(set.isSupersetOf(new Set<unknown>([[1, 2]]))).toBe(true);
    expect(set.isSubsetOf(new Set<unknown>([[1, 2]]))).toBe(false);
    expect(set.isSubsetOf(new Set<unknown>([3, [1, 2], 4]))).toBe(true);
    expect(set.isDisjointFrom(new Set<unknown>([[1, 2]]))).toBe(false);
    expect(set.isDisjointFrom([4])).toBe(true);
    expect(() => set.isSupersetOf(new globalThis.Set([3]) as never)).toThrow(
      new ArgumentError("value must be a set"),
    );
  });

  it("intersect? stops at the first member it finds, and merge refuses a value that is not enumerable", () => {
    const set = new Set<unknown>([3]);
    function* enumerable(): Generator<number> {
      yield 3;
      throw new Error("walked past the match");
    }

    expect(set.isIntersect(enumerable())).toBe(true);
    expect(set.isDisjointFrom(enumerable())).toBe(false);
    expect(() => set.merge(1 as never)).toThrow(new ArgumentError("value must be enumerable"));
    expect(() => set.subtract(1 as never)).toThrow(new ArgumentError("value must be enumerable"));
  });

  it("new applies its block to each member, and walks eachEntry before each", () => {
    expect([...new Set([2], (x: number) => x * 2)]).toEqual([4]);

    const calls: string[] = [];
    const enumerable = {
      eachEntry: (block: (o: number) => void) => (calls.push("eachEntry"), block(1)),
      each: (block: (o: number) => void) => (calls.push("each"), block(2)),
    };
    expect([...new Set<number>().merge(enumerable as never)]).toEqual([1]);
    expect([...new Set<number>().merge({ each: enumerable.each } as never)]).toEqual([2]);
    expect(calls).toEqual(["eachEntry", "each"]);
  });

  it("compare_by_identity makes an equal Array a second member", () => {
    const member = [1, 2];
    const set = new Set<unknown>().compareByIdentity().add(member);

    expect(set.isCompareByIdentity()).toBe(true);
    expect(set.has(member)).toBe(true);
    expect(set.has([1, 2])).toBe(false);
    expect(set.add([1, 2]).size).toBe(2);
  });
});
