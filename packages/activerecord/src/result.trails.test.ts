import { describe, it, expect } from "vitest";
import { Result } from "./result.js";

describe("Result::IndexedRow", () => {
  const result = new Result(
    ["col_1", "col_2"],
    [
      ["row 1 col 1", "row 1 col 2"],
      ["row 2 col 1", null],
    ],
  );

  it("to_h maps each column to the row's value at its index", () => {
    const rows = result.indexedRows;
    expect(rows[0].toH()).toEqual({ col_1: "row 1 col 1", col_2: "row 1 col 2" });
    expect(rows[1].toH()).toEqual({ col_1: "row 2 col 1", col_2: null });
    expect(Object.keys(rows[1].toH())).toEqual(["col_1", "col_2"]);
  });

  it("to_hash is to_h", () => {
    const row = result.indexedRows[0];
    expect(row.toHash()).toEqual(row.toH());
    expect(row.equals({ col_1: "row 1 col 1", col_2: "row 1 col 2" })).toBe(true);
  });
});

describe("Result#freeze", () => {
  it("freezes hash_rows and indexed_rows along with the result", () => {
    const result = new Result(["col_1"], [["row 1 col 1"]]);

    expect(result.freeze()).toBe(result);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.toArray())).toBe(true);
    expect(Object.isFrozen(result.indexedRows)).toBe(true);
    expect(result.toArray()).toEqual([{ col_1: "row 1 col 1" }]);
  });

  it("Result.empty is frozen through Result#freeze", () => {
    const empty = Result.empty();

    expect(Object.isFrozen(empty)).toBe(true);
    expect(Object.isFrozen(empty.toArray())).toBe(true);
  });
});
