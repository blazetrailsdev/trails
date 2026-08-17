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
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const arrayId = numbers;

    // Ruby returns `to_enum(:extract!) { size }` when no block is given
    // (extract.rb:11); there is no JS Enumerator to return, so the predicate is
    // required and the no-block call is a TypeError rather than an enumerator
    // whose `size` is the receiver's.
    let error: unknown;
    try {
      (extractBang as (array: number[]) => number[])(numbers);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(TypeError);
    expect(numbers.length).toBe(10);

    const oddNumbers = extractBang(numbers, (n) => n % 2 !== 0);

    expect(oddNumbers).toEqual([1, 3, 5, 7, 9]);
    expect(numbers).toEqual([0, 2, 4, 6, 8]);
    expect(numbers).toBe(arrayId);
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
