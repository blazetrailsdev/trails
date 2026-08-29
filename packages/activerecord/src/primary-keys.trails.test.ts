import { describe, it, expect } from "vitest";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { fixtures } from "./test-fixtures.js";

describe("CompositePrimaryKey#id= — Enumerable acceptance (trails-only)", () => {
  fixtures({});

  it("zips a Set across the key columns like an array", () => {
    const book = new CpkBook();
    book.id = new Set([1, 2]) as unknown as number[];
    expect(book.id).toEqual([1, 2]);
  });

  it("raises TypeError for a String scalar (not Enumerable in Ruby)", () => {
    const book = new CpkBook();
    expect(() => {
      book.id = "1" as unknown as number[];
    }).toThrow(new TypeError('Expected value matching ["author_id", "id"], got "1".'));
  });

  it("pads a short value with null like Ruby's zip", () => {
    const book = new CpkBook();
    book.id = [1] as unknown as number[];
    expect(book.id).toEqual([1, null]);
  });
});
