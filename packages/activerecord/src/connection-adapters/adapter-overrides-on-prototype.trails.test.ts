import { describe, it, expect } from "vitest";
import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

// Trails-specific guard (no Rails counterpart, because Ruby has no way to
// express the bug): Rails declares every adapter override with `def`, so it
// lands on the class and any receiver of that class resolves it. A TS class
// FIELD (`override quoteTableName = mysqlQuoteTableName;`) lands on the
// instance instead, so a receiver derived from the prototype alone silently
// resolves the abstract member — a plausible wrong result rather than a crash,
// and the abstract quoter emits ANSI double quotes where MySQL wants backticks
// (`mysql/quoting.rb:46-52`, `postgresql/referential_integrity.rb:5-36`).
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
