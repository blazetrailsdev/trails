/**
 * Trails-specific ToSql tests: no like-named Rails test exists in
 * arel/test/visitors/test_to_sql.rb.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { setDefaultTimezone } from "@blazetrails/activemodel";
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

describe("ToSql raw scalars in quoting slots", () => {
  const users = new Table("users");

  // Regression guard for the `NodeOrValue` union. Rails' Assignment visitor
  // `case`s on the value and sends anything that is not a Node/Attribute to
  // `quote(o.right)` rather than `visit` (to_sql.rb:637-639). That is why a
  // bare boolean renders here even though `visit_TrueClass`/`visit_FalseClass`
  // are aliased to `unsupported` (to_sql.rb:845, :838) — the alias governs
  // direct dispatch, which this slot never reaches. Dropping `boolean` from the
  // union on the strength of that alias alone would contradict this behaviour.
  it("quotes a bare boolean in an Assignment right instead of raising", () => {
    const node = new Nodes.Assignment(users.get("admin"), true);
    expect(new Visitors.ToSql().compile(node)).toBe('"users"."admin" = TRUE');
  });

  it("quotes a bare string in an Assignment right instead of raising", () => {
    const node = new Nodes.Assignment(users.get("name"), "x");
    expect(new Visitors.ToSql().compile(node)).toBe('"users"."name" = \'x\'');
  });
});

// Rails' `quoted_date` (abstract/quoting.rb:184-192) converts an instant with
// `value.getutc` or `value.getlocal` depending on `ActiveRecord.default_timezone`.
// The connection-less debug quoter reaches the same setting through activemodel's
// `configuredTimezone()`, so it agrees with the adapter twin's
// `defaultSqlTimezone()` instead of hardcoding UTC.
describe("ToSql quoted_date timezone", () => {
  const instant = Temporal.Instant.from("2020-01-02T12:00:00Z");
  const compile = () => new Visitors.ToSql().compile(new Nodes.Quoted(instant));

  afterEach(() => setDefaultTimezone("utc"));

  it("renders an instant in UTC when default_timezone is :utc", () => {
    setDefaultTimezone("utc");
    expect(compile()).toBe("'2020-01-02 12:00:00'");
  });

  it("renders an instant in the local zone when default_timezone is :local", () => {
    setDefaultTimezone("local");
    const expected = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
    expect(compile()).toBe(
      `'${expected.toPlainDateTime().toString({ smallestUnit: "second" }).replace("T", " ")}'`,
    );
  });
});
