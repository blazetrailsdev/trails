import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import type { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

type Row = Record<string, unknown>;

interface TableRebuildInternals {
  tableInfo(tableName: string): Promise<Row[]>;
  tableStructureWithCollation(tableName: string, basicStructure: Row[]): Promise<Row[]>;
  tableStructure(tableName: string): Promise<Row[]>;
  copyTable(from: string, to: string): Promise<void>;
  moveTable(from: string, to: string): Promise<void>;
  alterTable(
    tableName: string,
    foreignKeys: undefined,
    checkConstraints: undefined,
    options: { rename?: Record<string, string> },
  ): Promise<void>;
}

fixtures([]);

describeIfSqlite("SQLite3Adapter table-rebuild cluster", () => {
  let db: AbstractSQLite3Adapter;
  let leased: AbstractSQLite3Adapter | undefined;
  const internals = (): TableRebuildInternals => db as unknown as TableRebuildInternals;

  const dropCopyTargets = async (): Promise<void> => {
    await leased?.exec(
      `DROP TABLE IF EXISTS customers2; DROP TABLE IF EXISTS customers3; DROP TABLE IF EXISTS books2; DROP TABLE IF EXISTS auto_id_tests2; DROP TABLE IF EXISTS "acustomers2"`,
    );
  };

  beforeEach(async () => {
    db = leased = Base.connection as AbstractSQLite3Adapter;
    await dropCopyTargets();
  });

  afterEach(dropCopyTargets);

  it("tableStructureWithCollation extracts auto_increment flag", async () => {
    const basic = await internals().tableInfo("customers");
    const enriched = await internals().tableStructureWithCollation("customers", basic);
    const idCol = enriched.find((c) => c["name"] === "id");
    expect(idCol?.["auto_increment"]).toBe(true);
  });

  it("tableStructure throws StatementInvalid for non-existent table", async () => {
    await expect(internals().tableStructure("no_such")).rejects.toThrow(/Could not find table/);
  });

  const copiedIndexSql = async (table: string, matching: string): Promise<string | undefined> => {
    const rows = (await db.execute(
      `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`,
    )) as Array<{ sql: string | null }>;
    return rows.find((row) => row.sql?.includes(matching))?.sql ?? undefined;
  };

  it("copyTableIndexes preserves partial index WHERE clause", async () => {
    await internals().copyTable("books", "books2");
    expect(await copiedIndexSql("books2", "isbn")).toMatch(
      /WHERE\s+published_on\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("copyTableIndexes copies an expression index verbatim", async () => {
    await internals().copyTable("books", "books2");
    expect(await copiedIndexSql("books2", "lower")).toMatch(/lower\(external_id\)/i);
  });

  it("copyTableIndexes carries the index column orders across", async () => {
    await db.addIndex("customers", ["name"], { order: { name: "desc" } });
    await internals().copyTable("customers", "customers2");
    expect(await copiedIndexSql("customers2", "name")).toMatch(/"name"\s+DESC/i);
  });

  it("copyTable keeps a column's SQL function default", async () => {
    await internals().copyTable("auto_id_tests", "auto_id_tests2");
    const copied = (await db.columns("auto_id_tests2")).find((c) => c.name === "published_at");
    expect(copied?.defaultFunction).toBe("CURRENT_TIMESTAMP");
  });

  it("moveTable copies data to destination and drops source", async () => {
    await internals().copyTable("customers", "customers2");
    await db.executeMutation("INSERT INTO customers2 (name) VALUES ('Alice')");
    const sourceRows = await db.execute("SELECT * FROM customers2");
    await internals().moveTable("customers2", "customers3");
    const rows = (await db.execute("SELECT * FROM customers3")) as Row[];
    expect(rows).toHaveLength(sourceRows.length);
    expect(rows.map((r) => r["name"])).toContain("Alice");
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table'")) as Row[];
    expect(tables.map((t) => t["name"])).not.toContain("customers2");
  });

  it("alterTable re-points a foreign key across a column rename", async () => {
    await internals().alterTable("fk_test_has_fk", undefined, undefined, {
      rename: { fk_id: "renamed_fk_id" },
    });
    const fks = await db.foreignKeys("fk_test_has_fk");
    expect(fks).toHaveLength(1);
    expect(fks[0].column).toBe("renamed_fk_id");
    expect(fks[0].toTable).toBe("fk_test_has_pk");
  });

  it("removeColumn keeps a multi-column index on the surviving columns", async () => {
    await db.addIndex("customers", ["name", "gps_location"], { unique: true });
    await db.removeColumn("customers", "gps_location");
    const indexes = (await db.indexes("customers")) as Array<{ name: string; columns: string[] }>;
    expect(indexes.map((i) => i.name)).toEqual(["index_customers_on_name_and_gps_location"]);
    expect(indexes[0].columns).toEqual(["name"]);
  });

  it("renameColumn renames the index whose name embeds the column", async () => {
    await db.addIndex("customers", ["name"]);
    await db.renameColumn("customers", "name", "nickname");
    const names = ((await db.indexes("customers")) as Array<{ name: string }>).map((i) => i.name);
    expect(names).toContain("index_customers_on_nickname");
    expect(names).not.toContain("index_customers_on_name");
  });

  it("addColumn through the rebuild creates an index registered on the definition", async () => {
    await db.addIndex("customers", ["name"]);
    await db.addColumn("customers", "nickname", "string", { null: false, index: true });
    const names = ((await db.indexes("customers")) as Array<{ name: string }>).map((i) => i.name);
    expect(names.filter((n) => n === "index_customers_on_name")).toHaveLength(1);
    expect(names).toContain("index_customers_on_nickname");
  });

  it("addColumn of a primary_key through the rebuild creates the definition's index", async () => {
    await db.exec('CREATE TABLE "customers2" ("name" TEXT)');
    await db.addColumn("customers2", "id", "primary_key", { index: true });
    const names = ((await db.indexes("customers2")) as Array<{ name: string }>).map((i) => i.name);
    expect(names).toContain("index_customers2_on_id");
  });

  it("alterTable keeps the primary key of a lowercase integer-like declared type", async () => {
    await db.exec('CREATE TABLE "customers2" ("id" bigint PRIMARY KEY, "name" TEXT)');
    await db.removeColumn("customers2", "name");
    const pk = (await internals().tableInfo("customers2")).filter((c) => Number(c["pk"]) > 0);
    expect(pk.map((c) => c["name"])).toEqual(["id"]);
  });
});
