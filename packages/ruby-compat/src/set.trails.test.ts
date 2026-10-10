import { describe, it, expect } from "vitest";
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
});
