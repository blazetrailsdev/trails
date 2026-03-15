import { describe, expect, it } from "vitest";
import { extract } from "../../index.js";

describe("ExtractTest", () => {
  it("extract", () => {
    const numbers = [1, 2, 3, 4, 5];
    const odds = extract(numbers, (n) => n % 2 !== 0);
    expect(odds).toEqual([1, 3, 5]);
    expect(numbers).toEqual([2, 4]);
  });

  it("extract without block", () => {
    const arr = [1, 2, 3];
    const extracted = extract(arr);
    expect(extracted).toEqual([1, 2, 3]);
    expect(arr).toEqual([]);
  });

  it("extract on empty array", () => {
    const arr: number[] = [];
    const extracted = extract(arr, (n) => n > 0);
    expect(extracted).toEqual([]);
    expect(arr).toEqual([]);
  });
});
