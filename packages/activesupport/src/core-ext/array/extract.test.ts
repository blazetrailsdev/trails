import { describe, expect, it } from "vitest";
import { extractBang } from "../../index.js";

describe("ExtractTest", () => {
  it("extract", () => {
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    // Ruby's `object_id`, held to assert `extract!` mutated the receiver in
    // place rather than returning a new array.
    const arrayId = numbers;

    const oddNumbers = extractBang(numbers, (n) => n % 2 !== 0);

    expect(oddNumbers).toEqual([1, 3, 5, 7, 9]);
    expect(numbers).toEqual([0, 2, 4, 6, 8]);
    expect(numbers).toBe(arrayId);
  });

  it("extract without block", () => {
    const arr = [1, 2, 3];
    const extracted = extractBang(arr);
    expect(extracted).toEqual([1, 2, 3]);
    expect(arr).toEqual([]);
  });

  it("extract on empty array", () => {
    const emptyArray: number[] = [];
    const arrayId = emptyArray;

    const newEmptyArray = extractBang(emptyArray, () => false);

    expect(newEmptyArray).toEqual([]);
    expect(emptyArray).toEqual([]);
    expect(emptyArray).toBe(arrayId);
  });
});
