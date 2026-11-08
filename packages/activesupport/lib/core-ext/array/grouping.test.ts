import { describe, expect, it } from "vitest";
import { inGroups, inGroupsOf, split } from "../../index.js";

function toA(first: string, last: string): string[];
function toA(first: number, last: number): number[];
function toA(first: string | number, last: string | number): (string | number)[] {
  if (typeof first === "string" && typeof last === "string") {
    const result: string[] = [];
    for (let c = first.charCodeAt(0); c <= last.charCodeAt(0); c++) {
      result.push(String.fromCharCode(c));
    }
    return result;
  }
  const result: number[] = [];
  for (let i = first as number; i <= (last as number); i++) result.push(i);
  return result;
}

describe("GroupingTest", () => {
  it("in groups of with perfect fit", () => {
    const groups: unknown[] = [];
    inGroupsOf(toA("a", "i"), 3, null, (group) => {
      groups.push(group);
    });

    expect(groups).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "i"],
    ]);
    expect(inGroupsOf(toA("a", "i"), 3)).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "i"],
    ]);
  });

  it("in groups of with padding", () => {
    const groups: unknown[] = [];
    inGroupsOf(toA("a", "g"), 3, null, (group) => {
      groups.push(group);
    });

    expect(groups).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", null, null],
    ]);
  });

  it("in groups of pads with specified values", () => {
    const groups: unknown[] = [];

    inGroupsOf(toA("a", "g"), 3, "foo", (group) => {
      groups.push(group);
    });

    expect(groups).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "foo", "foo"],
    ]);
  });

  it("in groups of without padding", () => {
    const groups: unknown[] = [];

    inGroupsOf(toA("a", "g"), 3, false, (group) => {
      groups.push(group);
    });

    expect(groups).toEqual([["a", "b", "c"], ["d", "e", "f"], ["g"]]);
  });

  it("in groups returned array size", () => {
    const array = toA(1, 7);

    for (let number = 1; number <= array.length + 1; number++) {
      expect(inGroups(array, number).length).toBe(number);
    }
  });

  it("in groups with empty array", () => {
    expect(inGroups([], 3)).toEqual([[], [], []]);
  });

  it("in groups with block", () => {
    const array = toA(1, 9);
    const groups: unknown[] = [];

    inGroups(array, 3, null, (group) => {
      groups.push(group);
    });

    expect(inGroups(array, 3)).toEqual(groups);
  });

  it("in groups with perfect fit", () => {
    expect(inGroups(toA(1, 9), 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
  });

  it("in groups with padding", () => {
    const array = toA(1, 7);

    expect(inGroups(array, 3)).toEqual([
      [1, 2, 3],
      [4, 5, null],
      [6, 7, null],
    ]);
    expect(inGroups(array, 3, "foo" as unknown as number)).toEqual([
      [1, 2, 3],
      [4, 5, "foo"],
      [6, 7, "foo"],
    ]);
  });

  it("in groups without padding", () => {
    expect(inGroups(toA(1, 7), 3, false)).toEqual([
      [1, 2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it("in groups invalid argument", () => {
    expect(() => inGroupsOf([], 0)).toThrow(/Group size must be a positive integer/);
    expect(() => inGroupsOf([], -1)).toThrow(/Group size must be a positive integer/);
    expect(() => inGroupsOf([], null as unknown as number)).toThrow(
      /Group size must be a positive integer/,
    );
  });
});

describe("SplitTest", () => {
  it("split with empty array", () => {
    expect(split([], 0)).toEqual([[]]);
  });

  it("split with argument", () => {
    const a = [1, 2, 3, 4, 5];
    expect(split(a, 3)).toEqual([
      [1, 2],
      [4, 5],
    ]);
    expect(split(a, 0)).toEqual([[1, 2, 3, 4, 5]]);
    expect(a).toEqual([1, 2, 3, 4, 5]);
  });

  it("split with block", () => {
    const a = toA(1, 10);
    expect(split(a, (i: number) => i % 3 === 0)).toEqual([[1, 2], [4, 5], [7, 8], [10]]);
    expect(a).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("split with edge values", () => {
    const a = [1, 2, 3, 4, 5];
    expect(split(a, 1)).toEqual([[], [2, 3, 4, 5]]);
    expect(split(a, 5)).toEqual([[1, 2, 3, 4], []]);
    expect(split(a, (i: number) => i === 1 || i === 5)).toEqual([[], [2, 3, 4], []]);
    expect(a).toEqual([1, 2, 3, 4, 5]);
  });

  it("split with repeated values", () => {
    const a = [1, 2, 3, 5, 5, 3, 4, 6, 2, 1, 3];
    expect(split(a, 3)).toEqual([[1, 2], [5, 5], [4, 6, 2, 1], []]);
    expect(split(a, 5)).toEqual([[1, 2, 3], [], [3, 4, 6, 2, 1, 3]]);
    expect(split(a, (i: number) => i === 3 || i === 5)).toEqual([
      [1, 2],
      [],
      [],
      [],
      [4, 6, 2, 1],
      [],
    ]);
    expect(a).toEqual([1, 2, 3, 5, 5, 3, 4, 6, 2, 1, 3]);
  });
});
