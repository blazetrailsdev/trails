import { describe, expect, it } from "vitest";
import { Enumerator } from "@blazetrails/ruby-compat/enumerator";
import { extractBang } from "../../../lib/index.js";

describe("ExtractTest", () => {
  it("extract", () => {
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const arrayId = numbers;

    const oddNumbers = extractBang(numbers, (n) => n % 2 !== 0);

    expect(oddNumbers).toEqual([1, 3, 5, 7, 9]);
    expect(numbers).toEqual([0, 2, 4, 6, 8]);
    expect(numbers).toBe(arrayId);
  });

  it("extract without block", () => {
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const arrayId = numbers;

    const extractEnumerator = extractBang(numbers);

    expect(extractEnumerator).toBeInstanceOf(Enumerator);
    expect(extractEnumerator.size()).toBe(numbers.length);

    const oddNumbers = extractEnumerator.each((n: number) => n % 2 !== 0);

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
    expect(newEmptyArray).not.toBe(emptyArray);
  });
});
