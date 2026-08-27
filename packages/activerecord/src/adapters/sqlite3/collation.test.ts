import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import type { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { SchemaDumper } from "../../schema-dumper.js";

let adapter: SQLite3Adapter;

describeIfSqlite("SQLite3CollationTest", () => {
  fixtures([]);

  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as unknown as SQLite3Adapter;
    await adapter.createTable("collation_table_sqlite3", { force: true }, (t) => {
      t.string("string_nocase", { collation: "NOCASE" });
      t.text("text_rtrim", { collation: "RTRIM" });
      t.decimal("decimal_col", { precision: 6, scale: 2 });
      t.string("string_after_decimal_nocase", { collation: "NOCASE" });
    });
  });

  afterEach(async () => {
    await adapter.dropTable("collation_table_sqlite3", { ifExists: true });
  });

  it("string column with collation", async () => {
    const columns = await adapter.columns("collation_table_sqlite3");

    const stringNocase = columns.find((c) => c.name === "string_nocase")!;
    expect(stringNocase.sqlType?.toLowerCase()).toMatch(/varchar|char/);
    expect(stringNocase.collation).toBe("NOCASE");

    const stringAfterDecimal = columns.find((c) => c.name === "string_after_decimal_nocase")!;
    expect(stringAfterDecimal.sqlType?.toLowerCase()).toMatch(/varchar|char/);
    expect(stringAfterDecimal.collation).toBe("NOCASE");
  });

  it("text column with collation", async () => {
    const columns = await adapter.columns("collation_table_sqlite3");
    const textRtrim = columns.find((c) => c.name === "text_rtrim")!;
    expect(textRtrim.sqlType?.toLowerCase()).toBe("text");
    expect(textRtrim.collation).toBe("RTRIM");
  });

  it("add column with collation", async () => {
    await adapter.addColumn("collation_table_sqlite3", "title", "string", { collation: "RTRIM" });

    const columns = await adapter.columns("collation_table_sqlite3");
    const title = columns.find((c) => c.name === "title")!;
    expect(title.sqlType?.toLowerCase()).toMatch(/varchar|char/);
    expect(title.collation).toBe("RTRIM");
  });

  it("change column with collation", async () => {
    await adapter.addColumn("collation_table_sqlite3", "description", "string");
    await adapter.changeColumn("collation_table_sqlite3", "description", "text", {
      collation: "RTRIM",
    });

    const columns = await adapter.columns("collation_table_sqlite3");
    const desc = columns.find((c) => c.name === "description")!;
    expect(desc.sqlType?.toLowerCase()).toBe("text");
    expect(desc.collation).toBe("RTRIM");
  });

  it("schema dump includes collation", async () => {
    const output = (await SchemaDumper.dump(adapter)).join("\n");
    expect(output).toMatch(/t\.string\("string_nocase",[^)]*collation: "NOCASE"/);
    expect(output).toMatch(/t\.text\("text_rtrim",[^)]*collation: "RTRIM"/);
  });
});
