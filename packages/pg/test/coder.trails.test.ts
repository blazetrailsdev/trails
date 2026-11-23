import { describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";

describe("PG::CompositeCoder#dup", () => {
  it("round-trips dimensions through to_h", () => {
    const array = new PG.TextEncoder.Array(undefined, { dimensions: 2, delimiter: ";" });
    const copy = array.dup();
    expect(copy).toBeInstanceOf(PG.TextEncoder.Array);
    expect(copy.dimensions).toBe(2);
    expect(copy.toH()).toEqual(array.toH());
  });
});
