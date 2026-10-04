import { describe, expect, it } from "vitest";
import { Enumerator, toEnum } from "./enumerator.js";

describe("Enumerator", () => {
  const source = {
    eachPair(prefix: string, block: (value: string) => void): void {
      for (const value of ["a", "b"]) block(prefix + value);
    },
  };

  it("iterates the method it was built from with its recorded arguments", () => {
    const enumerator = toEnum<string>(source, "eachPair", "x");

    expect(enumerator).toBeInstanceOf(Enumerator);
    expect([...enumerator]).toEqual(["xa", "xb"]);
  });

  it("restarts from the receiver on every iteration", () => {
    const enumerator = toEnum<string>(source, "eachPair", "y");

    expect([...enumerator]).toEqual(["ya", "yb"]);
    expect([...enumerator]).toEqual(["ya", "yb"]);
  });

  it("isAll stops at the first element the block rejects", () => {
    const enumerator = toEnum<string>(source, "eachPair", "y");
    const seen: string[] = [];

    expect(enumerator.isAll((value) => seen.push(value) && value !== "ya")).toBe(false);
    expect(seen).toEqual(["ya"]);
    expect(enumerator.isAll((value) => value.startsWith("y"))).toBe(true);
    expect(enumerator.isAll(() => 0)).toBe(true);
    expect(enumerator.isAll(() => "")).toBe(true);
    expect(enumerator.isAll(() => null)).toBe(false);
  });

  it("isAll propagates what the block raises", () => {
    const enumerator = toEnum<string>(source, "eachPair", "y");

    expect(() =>
      enumerator.isAll(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
  });
});
