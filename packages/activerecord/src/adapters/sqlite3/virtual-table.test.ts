/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/virtual_table_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { SchemaDumper } from "../../schema-dumper.js";

let adapter: SQLite3Adapter;

beforeEach(async () => {
  adapter = new SQLite3Adapter(":memory:");
  await adapter.createVirtualTable("searchables", "fts5", [
    "content",
    "meta UNINDEXED",
    "tokenize='porter ascii'",
  ]);
});

afterEach(() => {
  adapter.close();
});

describe("SQLite3VirtualTableTest", () => {
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
    const adapter2 = new SQLite3Adapter(":memory:");
    await adapter2.createVirtualTable("emails", "fts5", ["content", "meta UNINDEXED"]);
    expect(await adapter2.virtualTableExists("emails")).toBe(true);
    adapter2.close();
  });
});
