/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/collation_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { SchemaDumper } from "../../schema-dumper.js";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
  adapter.exec(`CREATE TABLE "collation_table_sqlite3" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "string_nocase" VARCHAR(255) COLLATE "NOCASE",
    "text_rtrim" TEXT COLLATE "RTRIM",
    "decimal_col" DECIMAL(6, 2),
    "string_after_decimal_nocase" VARCHAR(255) COLLATE "NOCASE"
  )`);
});

afterEach(() => {
  adapter.close();
});

describe("SQLite3CollationTest", () => {
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
    const output = await SchemaDumper.dump(adapter);
    expect(output).toMatch(/t\.string\("string_nocase",[^)]*collation: "NOCASE"/);
    expect(output).toMatch(/t\.text\("text_rtrim",[^)]*collation: "RTRIM"/);
  });
});
