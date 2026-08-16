import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Customer } from "../test-helpers/models/customer.js";
import { quoteTableName, quoteColumnName } from "../support/quote-regex.js";

/**
 * `arel_column_with_table` (query_methods.rb:1978-1987) has exactly two arms:
 * the Symbol/`\W` discriminant routing through
 * `predicate_builder.resolve_arel_attribute`, and the `quote_table_name`
 * fallback. trails carried a third arm ahead of them for a schema-qualified
 * `table_name`, which put `quoteTableName` ahead of `resolveArelAttribute` in
 * the call set. This locks the quoting that arm was protecting: it comes from
 * each adapter's `quote_table_name`, which splits on "." (sqlite3/quoting.rb:48,
 * postgresql/quoting.rb:58, mysql/quoting.rb) exactly as Rails' does.
 */
describe("arel_column_with_table schema-qualified quoting", () => {
  fixtures([]);

  it("quotes each segment of a schema-qualified table", () => {
    const sql = Customer.select("myschema.customers.name").toSql();
    expect(sql).toContain(`${quoteTableName("myschema.customers")}.${quoteColumnName("name")}`);
  });
});
