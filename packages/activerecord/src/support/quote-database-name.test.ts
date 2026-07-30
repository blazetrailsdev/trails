import { describe, it, expect } from "vitest";
import { quoteMysqlDatabaseName, quotePgDatabaseName } from "./quote-database-name.js";
import { runTokenOfDatabase, slotDatabaseName } from "./run-token.js";

const BASE = "activerecord_unittest";

describe("quoting a database name for harness DDL", () => {
  it("wraps an ordinary name in the adapter's identifier quotes", () => {
    expect(quotePgDatabaseName(slotDatabaseName(BASE, "rabc000001", 2))).toBe(
      '"activerecord_unittest_rabc000001_2"',
    );
    expect(quoteMysqlDatabaseName(slotDatabaseName(BASE, "rabc000001", 2))).toBe(
      "`activerecord_unittest_rabc000001_2`",
    );
  });

  it("doubles an embedded quote character rather than emitting it raw", () => {
    // `quote_column_name`'s rule — postgresql/quoting.rb:46-48,
    // mysql/quoting.rb:46-48.
    expect(quotePgDatabaseName('we"ird')).toBe('"we""ird"');
    expect(quoteMysqlDatabaseName("we`ird")).toBe("`we``ird`");
  });

  it("leaves a dot alone instead of splitting it into a qualified name", () => {
    // Rails' MySQL `quote_table_name` adds `.gsub(".", "`.`")`, which is right
    // for a table and wrong for a database — it would corrupt the very name the
    // sweep is trying to drop.
    expect(quoteMysqlDatabaseName("a.b")).toBe("`a.b`");
    expect(quotePgDatabaseName("a.b")).toBe('"a.b"');
  });

  it("keeps a sweepable leftover sweepable when its suffix carries a quote", () => {
    // The regression: `runTokenOfDatabase` matches on the run-token *prefix*,
    // so everything after it is unconstrained. Interpolating such a name raw
    // made `DROP DATABASE` a syntax error, and globalSetup then failed on every
    // subsequent run instead of reclaiming the leftover.
    const leftover = `${slotDatabaseName(BASE, "rabc000001", 1)}"; SELECT 1; --`;
    expect(runTokenOfDatabase(BASE, leftover)).toBe("rabc000001");

    const sql = `DROP DATABASE IF EXISTS ${quotePgDatabaseName(leftover)}`;
    expect(sql).toBe(
      `DROP DATABASE IF EXISTS "activerecord_unittest_rabc000001_1""; SELECT 1; --"`,
    );
    // One identifier, so nothing after it can be read as a second statement.
    expect(sql.split('"').length - 1).toBe(4);
  });
});
