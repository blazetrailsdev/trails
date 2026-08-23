/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/virtual_table_test.rb
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import type { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { SchemaDumper } from "../../schema-dumper.js";

let adapter: SQLite3Adapter;

describeIfSqlite("SQLite3VirtualTableTest", () => {
  fixtures([]);

  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as unknown as SQLite3Adapter;
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
    const output = (await SchemaDumper.dump(adapter)).join("\n");

    expect(output).not.toContain("searchables_docsize");
    expect(output).toContain(
      `createVirtualTable("searchables", "fts5", ${JSON.stringify(["content", "meta UNINDEXED", "tokenize='porter ascii'"])})`,
    );
  });

  it("schema load", async () => {
    expect(await adapter.virtualTableExists("searchables")).toBe(true);

    await adapter.createVirtualTable("emails", "fts5", ["content", "meta UNINDEXED"]);
    expect(await adapter.virtualTableExists("emails")).toBe(true);
  });
});
