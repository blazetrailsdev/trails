import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat/string-io";
import "../../../../lib/index.js";
import { Base } from "../../../../lib/base.js";
import { fixtures } from "../../../support/use-fixtures.js";
import { currentAdapter } from "../../../support/adapter-helper.js";
import { SQLite3Adapter } from "../../../../lib/connection-adapters/sqlite3-adapter.js";
import { SchemaDumper } from "../../../../lib/schema-dumper.js";
import { Schema } from "../../../../lib/schema.js";
import { dumpAllTableSchema } from "../../../support/schema-dumping-helper.js";

let adapter: SQLite3Adapter;

describe.runIf(currentAdapter("SQLite3Adapter"))("SQLite3VirtualTableTest", () => {
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
    await adapter.dropTable("searchables", "emails", { ifExists: true });
  });

  it("schema dump", async () => {
    const output = (await SchemaDumper.dump(Base.connectionPool(), new StringIO())).string();

    expect(output).not.toContain("searchables_docsize");
    expect(output).toContain(
      `createVirtualTable("searchables", "fts5", ${JSON.stringify(["content", "meta UNINDEXED", "tokenize='porter ascii'"])})`,
    );
  });

  it("schema dump ignores virtual tables in ignore tables", async () => {
    const output = await dumpAllTableSchema(["searchables"]);

    expect(output).not.toContain(`createVirtualTable(${JSON.stringify("searchables")}`);
  });

  it("schema load", async () => {
    await Schema.define<SQLite3Adapter>(async (schema) => {
      await schema.methodMissing("createVirtualTable", "emails", "fts5", [
        "content",
        "meta UNINDEXED",
      ]);
    });

    expect(await adapter.virtualTableExists("emails")).toBeTruthy();
  });

  it("virtual table regex matches empty parentheses", () => {
    const regex = SQLite3Adapter.VIRTUAL_TABLE_REGEX;

    const match = "CREATE VIRTUAL TABLE foo USING bar()".match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("bar");
    expect(match![2]).toBe("");
  });
});
