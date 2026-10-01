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
});
