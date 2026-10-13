import { describe, it, expect } from "vitest";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Customer } from "../test-helpers/models/customer.js";
import { quoteColumnName } from "../support/quote-regex.js";

describe("arel_column_with_table schema-qualified quoting", () => {
  const { self } = fixtures([]);

  it("quotes each segment of a schema-qualified table", () => {
    const sql = Customer.select("myschema.customers.name").toSql();
    expect(sql).toContain(
      `${self().quoteTableName("myschema.customers")}.${quoteColumnName("name")}`,
    );
  });
});
