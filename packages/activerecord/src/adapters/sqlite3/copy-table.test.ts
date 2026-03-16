/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/copy_table_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteAdapter } from "../sqlite-adapter.js";

let adapter: SqliteAdapter;

beforeEach(() => {
  adapter = new SqliteAdapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

// -- Rails test class: copy_table_test.rb --
describe("CopyTableTest", () => {
  it("copy table", async () => {
    adapter.exec(`CREATE TABLE "source" ("id" INTEGER PRIMARY KEY, "name" TEXT, "age" INTEGER)`);
    await adapter.executeMutation(`INSERT INTO "source" ("name", "age") VALUES ('Alice', 30)`);
    adapter.exec(`CREATE TABLE "dest" AS SELECT * FROM "source"`);
    const rows = await adapter.execute(`SELECT * FROM "dest"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
  });

  it("copy table with column with default", async () => {
    adapter.exec(
      `CREATE TABLE "src_def" ("id" INTEGER PRIMARY KEY, "name" TEXT DEFAULT 'unnamed')`,
    );
    await adapter.executeMutation(`INSERT INTO "src_def" ("id") VALUES (1)`);
    const rows = await adapter.execute(`SELECT * FROM "src_def"`);
    expect(rows[0].name).toBe("unnamed");
  });

  it("copy table renaming column", async () => {
    adapter.exec(`CREATE TABLE "rename_src" ("id" INTEGER PRIMARY KEY, "old_name" TEXT)`);
    await adapter.executeMutation(`INSERT INTO "rename_src" ("old_name") VALUES ('Alice')`);
    // SQLite 3.25+ supports ALTER TABLE RENAME COLUMN
    adapter.exec(`ALTER TABLE "rename_src" RENAME COLUMN "old_name" TO "new_name"`);
    const rows = await adapter.execute(`SELECT "new_name" FROM "rename_src"`);
    expect(rows[0].new_name).toBe("Alice");
  });

  it("copy table allows to pass options to create table", async () => {
    // Create table with STRICT mode (SQLite 3.37+)
    adapter.exec(`CREATE TABLE "opts_src" ("id" INTEGER PRIMARY KEY, "name" TEXT) STRICT`);
    await adapter.executeMutation(`INSERT INTO "opts_src" ("name") VALUES ('test')`);
    const rows = await adapter.execute(`SELECT * FROM "opts_src"`);
    expect(rows).toHaveLength(1);
  });

  it("copy table with index", async () => {
    adapter.exec(`CREATE TABLE "src_idx" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    adapter.exec(`CREATE INDEX "idx_src_name" ON "src_idx" ("name")`);
    const rows = await adapter.execute(`PRAGMA index_list("src_idx")`);
    expect(rows.some((r: any) => r.name === "idx_src_name")).toBe(true);
  });

  it("copy table without primary key", async () => {
    adapter.exec(`CREATE TABLE "no_pk_src" ("name" TEXT, "value" TEXT)`);
    await adapter.executeMutation(`INSERT INTO "no_pk_src" ("name", "value") VALUES ('a', 'b')`);
    adapter.exec(`CREATE TABLE "no_pk_dest" AS SELECT * FROM "no_pk_src"`);
    const rows = await adapter.execute(`SELECT * FROM "no_pk_dest"`);
    expect(rows).toHaveLength(1);
  });

  it("copy table with id col that is not primary key", async () => {
    adapter.exec(
      `CREATE TABLE "id_not_pk" ("id" INTEGER, "real_pk" INTEGER PRIMARY KEY, "name" TEXT)`,
    );
    await adapter.executeMutation(`INSERT INTO "id_not_pk" ("id", "name") VALUES (99, 'test')`);
    adapter.exec(`CREATE TABLE "id_not_pk_copy" AS SELECT * FROM "id_not_pk"`);
    const rows = await adapter.execute(`SELECT * FROM "id_not_pk_copy"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(99);
  });

  it("copy table with unconventional primary key", async () => {
    adapter.exec(`CREATE TABLE "unconv_pk" ("guid" TEXT PRIMARY KEY, "name" TEXT)`);
    await adapter.executeMutation(
      `INSERT INTO "unconv_pk" ("guid", "name") VALUES ('abc-123', 'test')`,
    );
    adapter.exec(`CREATE TABLE "unconv_pk_copy" AS SELECT * FROM "unconv_pk"`);
    const rows = await adapter.execute(`SELECT * FROM "unconv_pk_copy"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].guid).toBe("abc-123");
  });

  it("copy table with binary column", async () => {
    adapter.exec(`CREATE TABLE "bin_src" ("id" INTEGER PRIMARY KEY, "data" BLOB)`);
    await adapter.executeMutation(`INSERT INTO "bin_src" ("data") VALUES (X'DEADBEEF')`);
    adapter.exec(`CREATE TABLE "bin_dest" AS SELECT * FROM "bin_src"`);
    const rows = await adapter.execute(`SELECT * FROM "bin_dest"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toBeDefined();
  });

  it("copy table with virtual column", async () => {
    adapter.exec(
      `CREATE TABLE "virt_src" ("id" INTEGER PRIMARY KEY, "a" INTEGER, "b" INTEGER, "sum" INTEGER GENERATED ALWAYS AS ("a" + "b") VIRTUAL)`,
    );
    await adapter.executeMutation(`INSERT INTO "virt_src" ("a", "b") VALUES (1, 2)`);
    // CREATE TABLE AS SELECT copies data but not generated columns
    adapter.exec(`CREATE TABLE "virt_copy" AS SELECT "id", "a", "b", "sum" FROM "virt_src"`);
    const rows = await adapter.execute(`SELECT * FROM "virt_copy"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].sum).toBe(3);
  });
});
