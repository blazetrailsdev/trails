import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Customer } from "../test-helpers/models/customer.js";
import { quoteTableName, quoteColumnName } from "../support/quote-regex.js";

describe("arel_column_with_table schema-qualified quoting", () => {
  fixtures([]);

  it("quotes each segment of a schema-qualified table", () => {
    const sql = Customer.select("myschema.customers.name").toSql();
    expect(sql).toContain(`${quoteTableName("myschema.customers")}.${quoteColumnName("name")}`);
  });
});
