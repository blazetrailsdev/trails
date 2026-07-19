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
});
