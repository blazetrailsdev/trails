import { describe, it, expect } from "vitest";
import { quoteMysqlDatabaseName, quotePgDatabaseName } from "./quote-database-name.js";
import { runTokenOfDatabase, slotDatabaseName } from "./run-token.js";

const BASE = "activerecord_unittest";

describe("quoting a database name for harness DDL", () => {
  it("doubles an embedded quote character rather than emitting it raw", () => {
    // `quote_column_name`'s rule — postgresql/quoting.rb:46-48,
    // mysql/quoting.rb:46-48.
    expect(quotePgDatabaseName(slotDatabaseName(BASE, "rabc000001", 2))).toBe(
      '"activerecord_unittest_rabc000001_2"',
    );
    expect(quotePgDatabaseName('we"ird')).toBe('"we""ird"');
    expect(quoteMysqlDatabaseName("we`ird")).toBe("`we``ird`");
    // Rails' MySQL `quote_table_name` also splits on dots; that is right for a
    // table and wrong for a database, so a dot stays put.
    expect(quoteMysqlDatabaseName("a.b")).toBe("`a.b`");
  });

  it("keeps a sweepable leftover sweepable when its suffix carries a quote", () => {
    const leftover = `${slotDatabaseName(BASE, "rabc000001", 1)}"; SELECT 1; --`;
    expect(runTokenOfDatabase(BASE, leftover)).toBe("rabc000001");

    const sql = `DROP DATABASE IF EXISTS ${quotePgDatabaseName(leftover)}`;
    expect(sql).toBe(
      `DROP DATABASE IF EXISTS "activerecord_unittest_rabc000001_1""; SELECT 1; --"`,
    );
    expect(sql.split('"').length - 1).toBe(4);
  });
});
