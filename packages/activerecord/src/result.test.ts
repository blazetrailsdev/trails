import { describe, it, expect } from "vitest";
import { Result, type ColumnTypes } from "./result.js";

function buildResult(): Result {
  return new Result(
    ["col_1", "col_2"],
    [
      ["row 1 col 1", "row 1 col 2"],
      ["row 2 col 1", "row 2 col 2"],
      ["row 3 col 1", "row 3 col 2"],
    ],
  );
}

const integerType = {
  deserialize(value: unknown): number {
    return parseInt(String(value), 10);
  },
};

const floatType = {
  deserialize(value: unknown): number {
    return parseFloat(String(value));
  },
};

describe("ResultTest", () => {
  it("includes_column?", () => {
    const result = buildResult();
    expect(result.includesColumn("col_1")).toBe(true);
    expect(result.includesColumn("foo")).toBe(false);
  });

  it("length", () => {
    expect(buildResult().length).toBe(3);
  });

  it("to_a returns row_hashes", () => {
    expect(buildResult().toArray()).toEqual([
      { col_1: "row 1 col 1", col_2: "row 1 col 2" },
      { col_1: "row 2 col 1", col_2: "row 2 col 2" },
      { col_1: "row 3 col 1", col_2: "row 3 col 2" },
    ]);
  });

  it("first returns first row as a hash", () => {
    const result = buildResult();
    expect(result.first()).toEqual({ col_1: "row 1 col 1", col_2: "row 1 col 2" });
    expect(result.first(1)).toEqual([{ col_1: "row 1 col 1", col_2: "row 1 col 2" }]);
    expect(result.first(2)).toEqual([
      { col_1: "row 1 col 1", col_2: "row 1 col 2" },
      { col_1: "row 2 col 1", col_2: "row 2 col 2" },
    ]);
    expect(result.first(3)).toEqual([
      { col_1: "row 1 col 1", col_2: "row 1 col 2" },
      { col_1: "row 2 col 1", col_2: "row 2 col 2" },
      { col_1: "row 3 col 1", col_2: "row 3 col 2" },
    ]);
  });

  it("last returns last row as a hash", () => {
    const result = buildResult();
    expect(result.last()).toEqual({ col_1: "row 3 col 1", col_2: "row 3 col 2" });
    expect(result.last(1)).toEqual([{ col_1: "row 3 col 1", col_2: "row 3 col 2" }]);
    expect(result.last(2)).toEqual([
      { col_1: "row 2 col 1", col_2: "row 2 col 2" },
      { col_1: "row 3 col 1", col_2: "row 3 col 2" },
    ]);
    expect(result.last(3)).toEqual([
      { col_1: "row 1 col 1", col_2: "row 1 col 2" },
      { col_1: "row 2 col 1", col_2: "row 2 col 2" },
      { col_1: "row 3 col 1", col_2: "row 3 col 2" },
    ]);
  });

  it("each with block returns row hashes", () => {
    buildResult().each((row) => {
      expect(Object.keys(row)).toEqual(["col_1", "col_2"]);
    });
  });

  it("each without block returns an enumerator", () => {
    const iter = buildResult().each();
    let index = 0;
    for (const row of iter) {
      expect(Object.keys(row)).toEqual(["col_1", "col_2"]);
      expect(Number.isInteger(index)).toBe(true);
      index++;
    }
    expect(index).toBe(3);
  });

  it("each without block returns a sized enumerator", () => {
    expect(buildResult().each().size).toBe(3);
  });

  it("cast_values returns rows after type casting", () => {
    const values = [
      ["1.1", "2.2"],
      ["3.3", "4.4"],
    ];
    const columns = ["col1", "col2"];
    const types: ColumnTypes = { col1: integerType, col2: floatType };
    const result = new Result(columns, values, types);

    expect(result.castValues()).toEqual([
      [1, 2.2],
      [3, 4.4],
    ]);
  });

  it("cast_values uses identity type for unknown types", () => {
    const values = [
      ["1.1", "2.2"],
      ["3.3", "4.4"],
    ];
    const columns = ["col1", "col2"];
    const types: ColumnTypes = { col1: integerType };
    const result = new Result(columns, values, types);

    expect(result.castValues()).toEqual([
      [1, "2.2"],
      [3, "4.4"],
    ]);
  });

  it("cast_values returns single dimensional array if single column", () => {
    const values = [["1.1"], ["3.3"]];
    const columns = ["col1"];
    const types: ColumnTypes = { col1: integerType };
    const result = new Result(columns, values, types);

    expect(result.castValues()).toEqual([1, 3]);
  });

  it("cast_values can receive types to use instead", () => {
    const values = [
      ["1.1", "2.2"],
      ["3.3", "4.4"],
    ];
    const columns = ["col1", "col2"];
    const types: ColumnTypes = { col1: integerType, col2: floatType };
    const result = new Result(columns, values, types);

    expect(result.castValues({ col1: floatType })).toEqual([
      [1.1, 2.2],
      [3.3, 4.4],
    ]);
  });

  it("each when two columns have the same name", () => {
    const result = new Result(
      ["foo", "foo"],
      [
        ["col 1", "col 2"],
        ["col 1", "col 2"],
        ["col 1", "col 2"],
      ],
    );

    expect(result.columns.length).toBe(2);
    result.each((row) => {
      expect(Object.keys(row).length).toBe(1);
      expect(row["foo"]).toBe("col 2");
    });
  });
});
