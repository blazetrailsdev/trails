/**
 * Trails-specific ToSql tests: no like-named Rails test exists in
 * arel/test/visitors/test_to_sql.rb.
 */
import { describe, it, expect } from "vitest";
import * as Nodes from "../nodes/index.js";
import * as Visitors from "./index.js";
import { Table } from "../table.js";

describe("ToSql Array-named identifiers", () => {
  type ToSqlInternals = { quoteColumnName(name: string | Nodes.SqlLiteral): string };
  const make = (): ToSqlInternals => new Visitors.ToSql() as unknown as ToSqlInternals;

  // Rails' adapters stringify with `name.to_s`, and Ruby's `Array#to_s` is
  // inspect-style rather than JS's comma-join. An Array-named Attribute shows
  // up on the composite-primary-key default order path; the reference is
  // invalid SQL in Rails too, so the point is byte-identical output.
  it("quoteColumnName stringifies an Array name like Ruby's Array#to_s", () => {
    const v = make();
    const name = ["shop_id", "id"] as unknown as string;
    expect(v.quoteColumnName(name)).toBe('"[""shop_id"", ""id""]"');
  });

  it("an Array-named attribute compiles to Rails' Array#to_s column reference", () => {
    const orders = new Table("cpk_orders");
    const attr = orders.get(["shop_id", "id"] as unknown as string);
    expect(new Visitors.ToSql().compile(new Nodes.Descending(attr))).toBe(
      '"cpk_orders"."[""shop_id"", ""id""]" DESC',
    );
  });

  // Ruby's Array#to_s inspects each element, so String#inspect escaping applies:
  // named escapes for the usual control characters, \uXXXX (uppercase, four
  // digits) for other non-printables, `\#` only where a `#` would begin an
  // interpolation, and printable non-ASCII passed through. The expectation is
  // the verbatim output of running these same inputs through
  // `ruby -e 'puts cases.to_s'`.
  it("quoteColumnName applies Ruby String#inspect escaping to Array elements", () => {
    const names = [
      "a\n",
      "t\tb",
      "esc\u001b",
      "nul\u0000",
      "del\u007f",
      "u\u00e9",
      "bs\\",
      'q"',
      "cr\r",
      "ff\f",
      "vt\u000b",
      "bel\u0007",
      "bsp\b",
      "h#{x}",
      "d#$g",
      "a#@i",
      "plain#hash",
      "shop_id",
      "id",
      "\u0001\u001f",
      "\u65e5\u672c",
    ] as unknown as string;

    const quoted = make().quoteColumnName(names);
    // Undo the adapter's identifier quoting to compare the bare Array#to_s text.
    expect(quoted.slice(1, -1).replaceAll('""', '"')).toBe(
      String.raw`["a\n", "t\tb", "esc\e", "nul\u0000", "del\u007F", "ué", "bs\\", "q\"", "cr\r", "ff\f", "vt\v", "bel\a", "bsp\b", "h\#{x}", "d\#$g", "a\#@i", "plain#hash", "shop_id", "id", "\u0001\u001F", "日本"]`,
    );
  });

  // Rails' MySQL visitor renders a CTE name with the visitor's own
  // `quote_table_name` (arel/visitors/mysql.rb:73 → to_sql.rb:872), not the
  // connection's, so the name goes through the same Array#to_s stand-in.
  it("the MySQL CTE visitor routes its name through the ToSql quoteTableName helper", () => {
    const cte = new Nodes.Cte(
      ["a", "b"] as unknown as string,
      new Table("t").from().project(new Nodes.SqlLiteral("1")).ast,
    );
    expect(new Visitors.MySQL().compile(cte)).toContain('`["a", "b"]` AS ');
  });
});
