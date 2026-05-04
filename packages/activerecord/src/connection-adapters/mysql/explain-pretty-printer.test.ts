import { describe, it, expect } from "vitest";
import { ExplainPrettyPrinter } from "./explain-pretty-printer.js";

describe("MySQL::ExplainPrettyPrinter", () => {
  const printer = new ExplainPrettyPrinter();
  const result = {
    columns: ["id", "select_type", "rows"],
    rows: [
      [1, "SIMPLE", 42],
      [2, "SIMPLE", 7],
    ],
  };

  it("computeColumnWidths returns max width per column", () => {
    const widths = (printer as any).computeColumnWidths(result);
    expect(widths[0]).toBe(2); // "id" (2) >= "1","2"
    expect(widths[1]).toBe(11); // "select_type"
  });

  it("computeColumnWidths counts NULL as 4 chars", () => {
    const r = { columns: ["col"], rows: [[null]] };
    expect((printer as any).computeColumnWidths(r)[0]).toBe(4);
  });

  it("buildSeparator returns + delimited line", () => {
    expect((printer as any).buildSeparator([2, 4])).toBe("+----+------+");
  });

  it("buildCells returns pipe delimited row", () => {
    expect((printer as any).buildCells(["id", "name"], [2, 5])).toBe("| id | name  |");
  });

  it("buildCells right-justifies numbers", () => {
    expect((printer as any).buildCells([1], [4])).toBe("|    1 |");
  });

  it("buildCells replaces null with NULL", () => {
    expect((printer as any).buildCells([null], [4])).toBe("| NULL |");
  });

  it("buildFooter uses singular row for 1", () => {
    expect((printer as any).buildFooter(1, 0.05)).toBe("1 row in set (0.05 sec)");
  });

  it("buildFooter uses plural rows", () => {
    expect((printer as any).buildFooter(3, 0.12)).toBe("3 rows in set (0.12 sec)");
  });

  it("pp produces full EXPLAIN table ending with newline", () => {
    const output = printer.pp(result, 0.01);
    expect(output).toContain("| id |");
    expect(output).toContain("2 rows in set (0.01 sec)");
    expect(output.endsWith("\n")).toBe(true);
  });
});
