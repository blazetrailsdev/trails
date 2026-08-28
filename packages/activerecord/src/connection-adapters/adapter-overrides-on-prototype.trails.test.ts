import { describe, it, expect } from "vitest";
import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

describe("adapter overrides live on the prototype, as Rails' `def` does", () => {
  it("resolves the MySQL identifier quoters through the adapter override", () => {
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as AbstractMysqlAdapter;

    expect(adapter.quoteColumnName("email")).toBe("`email`");
    expect(adapter.quoteTableName("foo.bar")).toBe("`foo`.`bar`");
    expect(adapter.quoteTableNameForAssignment("foo", "bar")).toBe("`foo`.`bar`");
  });

  it("resolves PostgreSQL's disable_referential_integrity through the adapter override", () => {
    expect(Object.hasOwn(PostgreSQLAdapter.prototype, "disableReferentialIntegrity")).toBe(true);
  });
});
