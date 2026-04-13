/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/copy_table_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
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

  it("alter table preserves foreign keys", async () => {
    adapter.exec(`CREATE TABLE "authors" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    adapter.exec(
      `CREATE TABLE "posts" ("id" INTEGER PRIMARY KEY, "title" TEXT, "body" TEXT, "author_id" INTEGER,
       FOREIGN KEY("author_id") REFERENCES "authors"("id") ON DELETE CASCADE)`,
    );
    await adapter.executeMutation(`INSERT INTO "authors" ("name") VALUES ('Dean')`);
    await adapter.executeMutation(
      `INSERT INTO "posts" ("title", "body", "author_id") VALUES ('Hi', 'content', 1)`,
    );

    // removeColumn triggers the copy-table strategy (unlike ADD COLUMN
    // which is a native SQLite op that doesn't rebuild the table)
    await adapter.removeColumn("posts", "body");

    const fks = await adapter.foreignKeys("posts");
    expect(fks).toHaveLength(1);
    expect(fks[0].toTable).toBe("authors");
    expect(fks[0].onDelete).toBe("CASCADE");

    const rows = await adapter.execute(`SELECT * FROM "posts"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Hi");
  });

  it("add foreign key via alter table rebuild", async () => {
    adapter.exec(`CREATE TABLE "tags" ("id" INTEGER PRIMARY KEY, "label" TEXT)`);
    adapter.exec(
      `CREATE TABLE "taggings" ("id" INTEGER PRIMARY KEY, "tag_id" INTEGER, "post_id" INTEGER)`,
    );

    await adapter.addForeignKey("taggings", "tags", { column: "tag_id" });

    const fks = await adapter.foreignKeys("taggings");
    expect(fks).toHaveLength(1);
    expect(fks[0].toTable).toBe("tags");
    expect(fks[0].column).toBe("tag_id");
  });

  it("remove foreign key via alter table rebuild", async () => {
    adapter.exec(`CREATE TABLE "categories" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    adapter.exec(
      `CREATE TABLE "items" ("id" INTEGER PRIMARY KEY, "category_id" INTEGER,
       FOREIGN KEY("category_id") REFERENCES "categories"("id"))`,
    );

    let fks = await adapter.foreignKeys("items");
    expect(fks).toHaveLength(1);

    await adapter.removeForeignKey("items", "categories");

    fks = await adapter.foreignKeys("items");
    expect(fks).toHaveLength(0);

    // Data should survive the rebuild
    await adapter.executeMutation(`INSERT INTO "items" ("category_id") VALUES (99)`);
    const rows = await adapter.execute(`SELECT * FROM "items"`);
    expect(rows).toHaveLength(1);
  });

  it("add check constraint via alter table rebuild", async () => {
    adapter.exec(`CREATE TABLE "products" ("id" INTEGER PRIMARY KEY, "price" REAL)`);
    await adapter.executeMutation(`INSERT INTO "products" ("price") VALUES (10.0)`);

    await adapter.addCheckConstraint("products", "price > 0", { name: "price_positive" });

    const checks = await adapter.checkConstraints("products");
    expect(checks).toHaveLength(1);
    expect(checks[0].name).toBe("price_positive");
    expect(checks[0].expression).toBe("price > 0");

    // Data should survive
    const rows = await adapter.execute(`SELECT * FROM "products"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(10.0);
  });

  it("remove check constraint via alter table rebuild", async () => {
    adapter.exec(
      `CREATE TABLE "accounts" ("id" INTEGER PRIMARY KEY, "balance" REAL,
       CONSTRAINT balance_non_negative CHECK (balance >= 0))`,
    );

    let checks = await adapter.checkConstraints("accounts");
    expect(checks).toHaveLength(1);

    await adapter.removeCheckConstraint("accounts", { name: "balance_non_negative" });

    checks = await adapter.checkConstraints("accounts");
    expect(checks).toHaveLength(0);
  });

  it("check constraints round-trip through alter table", async () => {
    adapter.exec(
      `CREATE TABLE "orders" ("id" INTEGER PRIMARY KEY, "qty" INTEGER, "status" TEXT, "note" TEXT,
       CONSTRAINT qty_positive CHECK (qty > 0),
       CONSTRAINT valid_status CHECK (status IN ('pending','shipped','delivered')))`,
    );
    await adapter.executeMutation(`INSERT INTO "orders" ("qty", "status") VALUES (1, 'pending')`);

    // removeColumn forces a table rebuild via alterTable (unlike ADD COLUMN)
    await adapter.removeColumn("orders", "note");

    const checks = await adapter.checkConstraints("orders");
    expect(checks).toHaveLength(2);
    const names = checks.map((c) => c.name).sort();
    expect(names).toEqual(["qty_positive", "valid_status"]);

    const rows = await adapter.execute(`SELECT * FROM "orders"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(1);
  });

  it("remove foreign key with ifExists does not throw when missing", async () => {
    adapter.exec(`CREATE TABLE "widgets" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    // No FK exists — should silently return instead of throwing
    await expect(
      adapter.removeForeignKey("widgets", { column: "nonexistent_id", ifExists: true }),
    ).resolves.toBeUndefined();
  });

  it("remove foreign key with ifExists throws when not set", async () => {
    adapter.exec(`CREATE TABLE "gadgets" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await expect(adapter.removeForeignKey("gadgets", { column: "nonexistent_id" })).rejects.toThrow(
      /has no foreign key/,
    );
  });

  it("remove foreign key via toTable option", async () => {
    adapter.exec(`CREATE TABLE "publishers" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    adapter.exec(
      `CREATE TABLE "books" ("id" INTEGER PRIMARY KEY, "publisher_id" INTEGER,
       FOREIGN KEY("publisher_id") REFERENCES "publishers"("id"))`,
    );
    let fks = await adapter.foreignKeys("books");
    expect(fks).toHaveLength(1);

    await adapter.removeForeignKey("books", { toTable: "publishers" });
    fks = await adapter.foreignKeys("books");
    expect(fks).toHaveLength(0);
  });

  it("remove check constraint with ifExists does not throw when missing", async () => {
    adapter.exec(`CREATE TABLE "things" ("id" INTEGER PRIMARY KEY, "val" INTEGER)`);
    await expect(
      adapter.removeCheckConstraint("things", { name: "nonexistent", ifExists: true }),
    ).resolves.toBeUndefined();
  });
});
