import { describe, it, expect } from "vitest";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { fixtures } from "./test-fixtures.js";

// Rails' `CompositePrimaryKey#id=` guards on `value.is_a?(Enumerable)` and then
// `@primary_key.zip(value)`. A JS Set is the codebase's Enumerable analogue
// (see sanitization.ts `isEnumerable`), so it must zip like an array rather
// than raise. Strings and true scalars still raise (see the mirrored Rails
// test in primary-keys.test.ts).
describe("CompositePrimaryKey#id= — Enumerable acceptance (trails-only)", () => {
  // Strict _writeAttribute needs CpkBook's reflected schema warm before the
  // synchronous `id =` writes below.
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
    // `@primary_key.zip([1])` yields `[[author_id, 1], [id, nil]]`, so the
    // trailing key part is written nil, not left untouched.
    const book = new CpkBook();
    book.id = [1] as unknown as number[];
    expect(book.id).toEqual([1, null]);
  });
});
