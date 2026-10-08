import { describe, it, expect } from "vitest";
import { Result } from "../../result.js";
import { ExplainPrettyPrinter } from "./explain-pretty-printer.js";

describe("PostgreSQL::ExplainPrettyPrinter", () => {
  it("centers the header over the widest line and strips its trailing padding", () => {
    const result = new Result(
      ["QUERY PLAN"],
      [["Seq Scan on posts  (cost=0.00..28.88 rows=8 width=4)"], ["  Filter: (id = 1)"]],
    );

    expect(new ExplainPrettyPrinter().pp(result)).toBe(
      [
        `${" ".repeat(22)}QUERY PLAN`,
        "-".repeat(54),
        " Seq Scan on posts  (cost=0.00..28.88 rows=8 width=4)",
        "   Filter: (id = 1)",
        "(2 rows)",
        "",
      ].join("\n"),
    );
  });

  it("puts the odd padding character on the right, where rstrip drops it", () => {
    const result = new Result(["QUERY PLAN"], [["Result"]]);

    expect(new ExplainPrettyPrinter().pp(result)).toBe(
      [" QUERY PLAN", "------------", " Result", "(1 row)", ""].join("\n"),
    );
  });
});
