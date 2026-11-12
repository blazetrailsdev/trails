import { it, expect, beforeEach, afterEach } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";
import "../../../../lib/index.js";
import { describeIfSqlite } from "../../../support/describe-if-sqlite.js";
import { Base } from "../../../../lib/base.js";
import { fixtures } from "../../../support/use-fixtures.js";
import type { SQLite3Adapter } from "../../../../lib/connection-adapters/sqlite3-adapter.js";
import { SchemaDumper } from "../../../../lib/schema-dumper.js";
import { Schema } from "../../../../lib/schema.js";

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
    await adapter.dropTable("searchables", "emails", { ifExists: true });
  });

  it("schema dump", async () => {
    const output = (await SchemaDumper.dump(Base.connectionPool(), new StringIO())).string();

    expect(output).not.toContain("searchables_docsize");
    expect(output).toContain(
      `createVirtualTable("searchables", "fts5", ${JSON.stringify(["content", "meta UNINDEXED", "tokenize='porter ascii'"])})`,
    );
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
});
