/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/virtual_table_test.rb
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import type { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { SchemaDumper } from "../../schema-dumper.js";

let adapter: AbstractSQLite3Adapter;

describeIfSqlite("SQLite3VirtualTableTest", () => {
  fixtures([]);

  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as unknown as AbstractSQLite3Adapter;
    await adapter.createVirtualTable("searchables", "fts5", [
      "content",
      "meta UNINDEXED",
      "tokenize='porter ascii'",
    ]);
  });

  afterEach(async () => {
    await adapter.dropTable("searchables", { ifExists: true });
  });

  it("schema dump", async () => {
    const output = await SchemaDumper.dump(adapter);

    // Internal FTS5 shadow tables (e.g. searchables_docsize) must not appear
    expect(output).not.toMatch(/searchables_docsize/);
    // The virtual table definition must appear
    expect(output).toContain('createVirtualTable("searchables", "fts5"');
    expect(output).toContain('"content"');
    expect(output).toContain('"meta UNINDEXED"');
    expect(output).toContain("\"tokenize='porter ascii'\"");
  });

  it("schema load", async () => {
    // Verify the virtual table was created and is recognized
    expect(await adapter.virtualTableExists("searchables")).toBe(true);

    // Re-create via createVirtualTable (mirrors Schema.define creating the table)
    await adapter.createVirtualTable("emails", "fts5", ["content", "meta UNINDEXED"]);
    expect(await adapter.virtualTableExists("emails")).toBe(true);
  });
});
