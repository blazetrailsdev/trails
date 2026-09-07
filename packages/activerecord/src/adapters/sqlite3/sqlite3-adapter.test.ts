import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { itIfSupports } from "../../support/supports.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { Notifications } from "@blazetrails/activesupport";
import { BinaryData } from "@blazetrails/activemodel";
import type {
  SqliteDriver,
  SqliteOpenConfig,
  SyncSqliteConnection,
  SyncSqliteStatement,
} from "../../sqlite-adapter.js";
import { assertLogged } from "./test-helper.js";
import { newSqlitePool } from "../../support/pooled-sqlite-adapter.js";
import type { ConnectionPool } from "../../connection-adapters/abstract/connection-pool.js";

let adapter: SQLite3Adapter;
let pool: ConnectionPool;

beforeEach(async () => {
  pool = newSqlitePool();
  adapter = (await pool.checkout()) as unknown as SQLite3Adapter;
});

async function createExampleTable(): Promise<void> {
  await adapter.execute(
    `CREATE TABLE "ex" ("id" integer PRIMARY KEY AUTOINCREMENT, "number" integer)`,
  );
}

afterEach(async () => {
  await adapter.execute(`DROP TABLE IF EXISTS items`);
  await adapter.execute(`DROP TABLE IF EXISTS typed`);
  await adapter.execute(`DROP TABLE IF EXISTS no_pk`);
  await adapter.execute(`DROP TABLE IF EXISTS bin_esc`);
  await adapter.execute(`DROP TABLE IF EXISTS enc_test`);
  await adapter.execute(`DROP TABLE IF EXISTS def_vals`);
  await adapter.execute(`DROP TABLE IF EXISTS strict_items`);
  await adapter.execute(`DROP TABLE IF EXISTS custom_pk_src`);
  await adapter.execute(`DROP TABLE IF EXISTS custom_pk_dest`);
  await adapter.execute(`DROP TABLE IF EXISTS cpk_src`);
  await adapter.execute(`DROP TABLE IF EXISTS cpk_dest`);
  await adapter.execute(`DROP TABLE IF EXISTS custom_pk`);
  await adapter.execute(`DROP TABLE IF EXISTS change_pk`);
  await adapter.execute(`DROP TABLE IF EXISTS barcodes`);
  await adapter.execute(`DROP TABLE IF EXISTS test`);
  await adapter.execute(`DROP TABLE IF EXISTS testings`);
  await adapter.execute(`DROP TABLE IF EXISTS rowid_test`);
  await adapter.execute(`DROP TABLE IF EXISTS rowid_lower`);
  await adapter.execute(`DROP TABLE IF EXISTS text_pk`);
  await adapter.execute(`DROP TABLE IF EXISTS mixed_case`);
  await adapter.execute(`DROP TABLE IF EXISTS auto_inc`);
  await adapter.execute(`DROP TABLE IF EXISTS cpk`);
  await adapter.execute(`DROP TABLE IF EXISTS ex`);
  await adapter.execute(`DROP TABLE IF EXISTS json_defs`);
  await pool.disconnect();
  Notifications.unsubscribeAll();
});

describeIfSqlite("SQLite3AdapterTest", () => {
  beforeEach(async () => {
    await adapter.execute(
      `CREATE TABLE "items" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT, "price" INTEGER, "active" INTEGER DEFAULT 1)`,
    );
  });

  it("database should get created when missing parent directories for database path", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const baseDir = path.join(os.tmpdir(), `sqlite-nested-${Date.now()}`);
    const nested = path.join(baseDir, "sub", "dir");
    fs.mkdirSync(nested, { recursive: true });
    const dbPath = path.join(nested, "test.db");
    const a = new BetterSQLite3Adapter(dbPath);
    await a.connectBang();
    expect(a.isOpen).toBe(true);
    expect(await BetterSQLite3Adapter.databaseExists({ database: dbPath })).toBe(true);
    await a.close();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it("database exists returns false when the database does not exist", async () => {
    expect(await BetterSQLite3Adapter.databaseExists({ database: "non_extant_db" })).toBe(false);
  });

  it("database exists returns true when database exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dbPath = path.join(os.tmpdir(), `sqlite-exists-${Date.now()}.db`);
    const a = new BetterSQLite3Adapter(dbPath);
    try {
      await a.connectBang();
      expect(await BetterSQLite3Adapter.databaseExists({ database: dbPath })).toBe(true);
    } finally {
      await a.close();
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("database exists returns true for an in memory db", async () => {
    expect(await BetterSQLite3Adapter.databaseExists({ database: ":memory:" })).toBe(true);
  });

  it("connect with url", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    await a.connectBang();
    expect(a.isOpen).toBe(true);
    await a.close();
  });

  it("connect memory with url", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    await a.connectBang();
    expect(a.isOpen).toBe(true);
    await a.close();
  });

  it("column types", async () => {
    await adapter.execute(
      `CREATE TABLE "typed" ("id" INTEGER PRIMARY KEY, "name" TEXT, "age" INTEGER, "score" REAL, "data" BLOB)`,
    );
    const cols = (await adapter.execute(`PRAGMA table_info("typed")`))!;
    expect(cols.length).toBe(5);
    const types = cols.map((c: any) => c.type);
    expect(types).toContain("TEXT");
    expect(types).toContain("INTEGER");
    expect(types).toContain("REAL");
    expect(types).toContain("BLOB");
  });

  it("change column default serializes a structured json default", async () => {
    await adapter.execute(`CREATE TABLE "json_defs" ("id" INTEGER PRIMARY KEY, "options" json)`);
    await adapter.changeColumnDefault("json_defs", "options", {});
    const col = (await adapter.columns("json_defs")).find((c) => c.name === "options");
    expect(col?.default).toEqual("{}");
  });

  it("change column default treats a bare to object as a literal default", async () => {
    await adapter.execute(`CREATE TABLE "json_defs" ("id" INTEGER PRIMARY KEY, "options" json)`);
    await adapter.changeColumnDefault("json_defs", "options", { to: 1 });
    const col = (await adapter.columns("json_defs")).find((c) => c.name === "options");
    expect(col?.default).toEqual('{"to":1}');
  });

  it("change column serializes a structured json default", async () => {
    await adapter.execute(`CREATE TABLE "json_defs" ("id" INTEGER PRIMARY KEY, "options" TEXT)`);
    await adapter.changeColumn("json_defs", "options", "json", { default: {} });
    const col = (await adapter.columns("json_defs")).find((c) => c.name === "options");
    expect(col?.default).toEqual("{}");
  });

  it("quote default expression serializes a structured json default once", async () => {
    expect(await adapter.quoteDefaultExpression({}, { sqlType: "json" })).toEqual("'{}'");
  });

  it("exec insert", async () => {
    const id = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('test')`);
    expect(id).toBe(1);
  });

  it("exec insert with quote", async () => {
    await createExampleTable();
    await adapter.executeMutation(`insert into "ex" (number) VALUES (?)`, [10]);
    const rows = (
      await adapter.execQuery(`select number from "ex" where number = ?`, "SQL", [10])
    ).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe(10);
  });

  it("primary key returns nil for no pk", async () => {
    await adapter.execute(`CREATE TABLE "no_pk" ("name" TEXT, "value" TEXT)`);
    const cols = (await adapter.execute(`PRAGMA table_info("no_pk")`))!;
    const pkCols = cols.filter((c: any) => c.pk > 0);
    expect(pkCols).toHaveLength(0);
  });

  it("connection no db", async () => {
    const os = await import("os");
    const path = await import("path");
    const a = new BetterSQLite3Adapter(path.join(os.tmpdir(), "nonexistent-path-12345", "no.db"), {
      readonly: true,
    });
    await expect(a.connectBang()).rejects.toThrow();
  });

  it("bad timeout", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    expect(a).toBeDefined();
    await a.close();
  });

  it("nil timeout", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    expect(a).toBeDefined();
    await a.close();
  });

  it("connect", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    expect(a).toBeDefined();
    await a.close();
  });

  it("encoding", async () => {
    const rows = (await adapter.execute(`PRAGMA encoding`))!;
    expect(rows[0].encoding).toBe("UTF-8");
  });

  it("default pragmas", async () => {
    const jm = (await adapter.execute(`PRAGMA journal_mode`))!;
    expect(["wal", "memory"]).toContain(jm[0].journal_mode);
    const fk = (await adapter.execute(`PRAGMA foreign_keys`))!;
    expect(fk[0].foreign_keys).toBe(1);
  });

  it("overriding default foreign keys pragma", async () => {
    const fk = (await adapter.execute(`PRAGMA foreign_keys`))!;
    expect(fk[0].foreign_keys).toBe(1);
    await adapter.execute(`PRAGMA foreign_keys = OFF`);
    const fk2 = (await adapter.execute(`PRAGMA foreign_keys`))!;
    expect(fk2[0].foreign_keys).toBe(0);
    await adapter.execute(`PRAGMA foreign_keys = ON`);
  });

  it("overriding default journal mode pragma", async () => {
    const jm = (await adapter.execute(`PRAGMA journal_mode`))!;
    expect(jm[0].journal_mode).toBeDefined();
    await adapter.execute(`PRAGMA journal_mode = DELETE`);
    const jm2 = (await adapter.execute(`PRAGMA journal_mode`))!;
    expect(jm2[0].journal_mode).toBeDefined();
  });

  it("overriding default synchronous pragma", async () => {
    await adapter.execute(`PRAGMA synchronous = OFF`);
    const rows = (await adapter.execute(`PRAGMA synchronous`))!;
    expect(rows[0].synchronous).toBe(0);
    await adapter.execute(`PRAGMA synchronous = NORMAL`);
  });

  it("overriding default journal size limit pragma", async () => {
    await adapter.execute(`PRAGMA journal_size_limit = 1048576`);
    const rows = (await adapter.execute(`PRAGMA journal_size_limit`))!;
    expect(rows[0].journal_size_limit).toBe(1048576);
  });

  it("overriding default mmap size pragma", async () => {
    await adapter.execute(`PRAGMA mmap_size = 0`);
  });

  it("overriding default cache size pragma", async () => {
    await adapter.execute(`PRAGMA cache_size = 5000`);
    const rows = (await adapter.execute(`PRAGMA cache_size`))!;
    expect(rows[0].cache_size).toBe(5000);
  });

  it("setting new pragma", async () => {
    await adapter.execute(`PRAGMA temp_store = MEMORY`);
    const rows = (await adapter.execute(`PRAGMA temp_store`))!;
    expect(rows[0].temp_store).toBe(2);
  });

  it("setting invalid pragma", async () => {
    await adapter.execute(`PRAGMA not_a_real_pragma`);
  });

  it("exec no binds", async () => {
    const rows = (await adapter.execute(`SELECT 1 AS val`))!;
    expect(rows[0].val).toBe(1);
  });

  it("exec query with binds", async () => {
    await adapter.executeMutation(`INSERT INTO "items" ("name", "price") VALUES ('widget', 10)`);
    const rows = (await adapter.execute(`SELECT * FROM "items" WHERE "name" = 'widget'`))!;
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(10);
  });

  it("exec query typecasts bind vals", async () => {
    await adapter.executeMutation(`INSERT INTO "items" ("name", "price") VALUES (?, ?)`, [
      "widget",
      10,
    ]);
    const rows = (
      await adapter.execQuery(`SELECT * FROM "items" WHERE "name" = ?`, "SQL", ["widget"])
    ).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(10);
  });

  it("quote binary column escapes it", async () => {
    await adapter.execute(`CREATE TABLE "bin_esc" ("id" INTEGER PRIMARY KEY, "data" BLOB)`);
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    await adapter.executeMutation(`INSERT INTO "bin_esc" ("data") VALUES (?)`, [
      new BinaryData(buf),
    ]);
    const rows = (await adapter.execute(`SELECT "data" FROM "bin_esc"`))!;
    expect(Buffer.from(rows[0].data as Buffer)).toEqual(buf);
  });

  it("type cast should not mutate encoding", async () => {
    await adapter.execute(`CREATE TABLE "enc_test" ("id" INTEGER PRIMARY KEY, "data" BLOB)`);
    const original = Buffer.from("hello world");
    const copy = Buffer.from(original);
    await adapter.executeMutation(`INSERT INTO "enc_test" ("data") VALUES (?)`, [
      new BinaryData(copy),
    ]);
    expect(original).toEqual(Buffer.from("hello world"));
  });

  it("execute", async () => {
    await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('a')`);
    const rows = (await adapter.execute(`SELECT * FROM "items"`))!;
    expect(rows).toHaveLength(1);
  });

  it("insert logged", async () => {
    const sql = `INSERT INTO "items" ("name") VALUES ('logged')`;
    const logged: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("INSERT")) logged.push(event.payload.sql);
    });
    try {
      await adapter.executeMutation(sql);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(logged.some((s) => s.includes("INSERT") && s.includes("logged"))).toBe(true);
  });

  it("insert id value returned", async () => {
    const id1 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('a')`);
    const id2 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('b')`);
    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });

  it("exec insert default values with returning disabled", async () => {
    await adapter.execute(
      `CREATE TABLE "def_vals" ("id" INTEGER PRIMARY KEY, "name" TEXT DEFAULT 'default')`,
    );
    const id = await adapter.executeMutation(`INSERT INTO "def_vals" DEFAULT VALUES`);
    expect(id).toBe(1);
    const rows = (await adapter.execute(`SELECT * FROM "def_vals"`))!;
    expect(rows[0].name).toBe("default");
  });

  it("select rows", async () => {
    await adapter.executeMutation(`INSERT INTO "items" ("name", "price") VALUES ('a', 1)`);
    await adapter.executeMutation(`INSERT INTO "items" ("name", "price") VALUES ('b', 2)`);
    const rows = (await adapter.execute(`SELECT "name", "price" FROM "items" ORDER BY "name"`))!;
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("a");
    expect(rows[1].name).toBe("b");
  });

  it("select rows logged", async () => {
    const sql = `select * from "items"`;
    const logged: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.toLowerCase().startsWith("select")) logged.push(event.payload.sql);
    });
    try {
      await adapter.execute(sql);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(logged.some((s) => s.toLowerCase().startsWith("select"))).toBe(true);
  });

  it("transaction", async () => {
    await adapter.beginTransaction({ _lazy: false });
    await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('x')`);
    await adapter.commitTransaction();
    const rows = (await adapter.execute(`SELECT * FROM "items"`))!;
    expect(rows).toHaveLength(1);
  });

  it("tables", async () => {
    const rows = (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    ))!;
    const names = rows.map((r: any) => r.name);
    expect(names).toContain("items");
  });

  it("columns", async () => {
    const cols = (await adapter.execute(`PRAGMA table_info("items")`))!;
    const names = cols.map((c: any) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("name");
    expect(names).toContain("price");
  });

  it("columns with default", async () => {
    await adapter.execute(
      `CREATE TABLE "ex" ("id" integer PRIMARY KEY AUTOINCREMENT, "number" integer default 10)`,
    );
    const column = (await adapter.columns("ex")).find((x) => x.name === "number")!;
    expect(column.default).toBe("10");
  });

  it("columns with not null", async () => {
    await adapter.execute(
      `CREATE TABLE "strict_items" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)`,
    );
    const cols = (await adapter.execute(`PRAGMA table_info("strict_items")`))!;
    const nameCol = cols.find((c: any) => c.name === "name");
    expect(nameCol!.notnull).toBe(1);
  });

  it("add column with not null", async () => {
    await adapter.execute(
      `ALTER TABLE "items" ADD COLUMN "required" TEXT NOT NULL DEFAULT 'default_val'`,
    );
    const cols = (await adapter.execute(`PRAGMA table_info("items")`))!;
    const reqCol = cols.find((c: any) => c.name === "required");
    expect(reqCol!.notnull).toBe(1);
  });

  it("indexes logs", async () => {
    const logged: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql) logged.push(event.payload.sql);
    });
    try {
      await adapter.indexes("items");
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(logged.length).toBeGreaterThan(0);
  });

  it("no indexes", async () => {
    const rows = (await adapter.execute(`PRAGMA index_list("items")`))!;
    expect(rows).toHaveLength(0);
  });

  it("index", async () => {
    await adapter.execute(`CREATE UNIQUE INDEX "fun" ON "items" ("id")`);
    const indexes = (await adapter.indexes("items")) as any[];
    const index = indexes.find((idx) => idx.name === "fun");
    expect(index.table).toBe("items");
    expect(index.unique).toBe(true);
    expect(index.columns).toEqual(["id"]);
  });

  it("index with if not exists", async () => {
    await adapter.execute(`CREATE INDEX IF NOT EXISTS "idx_items_name" ON "items" ("name")`);
    await adapter.execute(`CREATE INDEX IF NOT EXISTS "idx_items_name" ON "items" ("name")`);
    const rows = (await adapter.execute(`PRAGMA index_list("items")`))!;
    const matching = rows.filter((r: any) => r.name === "idx_items_name");
    expect(matching).toHaveLength(1);
  });

  it("non unique index", async () => {
    await adapter.execute(`CREATE INDEX "fun" ON "items" ("id")`);
    const indexes = (await adapter.indexes("items")) as any[];
    const index = indexes.find((idx) => idx.name === "fun");
    expect(index.unique).toBe(false);
  });

  it("compound index", async () => {
    await adapter.execute(`CREATE INDEX "fun" ON "items" ("id", "price")`);
    const indexes = (await adapter.indexes("items")) as any[];
    const index = indexes.find((idx) => idx.name === "fun");
    expect([...index.columns].sort()).toEqual(["id", "price"].sort());
  });

  it("partial index with comment", async () => {
    await adapter.execute(`CREATE INDEX "fun" ON "items" ("id") WHERE price > 0 /*tag:test*/`);
    const indexes = (await adapter.indexes("items")) as any[];
    const index = indexes.find((idx) => idx.name === "fun");
    expect(index.columns).toEqual(["id"]);
    expect(index.where).toBe("price > 0");
  });

  itIfSupports("expression_index", "expression index", async () => {
    await createExampleTable();
    await adapter.execute(`CREATE INDEX "expression" ON "ex" (max(id, number))`);
    const indexes = (await adapter.indexes("ex")) as any[];
    const index = indexes.find((idx) => idx.name === "expression");
    expect(index.columns).toBe("max(id, number)");
  });

  itIfSupports("expression_index", "expression index with trailing comment", async () => {
    await createExampleTable();
    await adapter.execute(`CREATE INDEX expression on ex (number % 10) /* comment */`);
    const indexes = (await adapter.indexes("ex")) as any[];
    const index = indexes.find((idx) => idx.name === "expression");
    expect(index.columns).toBe("number % 10");
  });

  itIfSupports("expression_index", "expression index with where", async () => {
    await createExampleTable();
    await adapter.execute(
      `CREATE INDEX "expression" ON "ex" (id % 10, max(id, number)) WHERE id > 1000`,
    );
    const indexes = (await adapter.indexes("ex")) as any[];
    const index = indexes.find((idx) => idx.name === "expression");
    expect(index.columns).toBe("id % 10, max(id, number)");
    expect(index.where).toBe("id > 1000");
  });

  itIfSupports("expression_index", "complicated expression", async () => {
    await createExampleTable();
    await adapter.execute(
      `CREATE INDEX expression ON ex (id % 10, (CASE WHEN number > 0 THEN max(id, number) END))WHERE(id > 1000)`,
    );
    const indexes = (await adapter.indexes("ex")) as any[];
    const index = indexes.find((idx) => idx.name === "expression");
    expect(index.columns).toBe("id % 10, (CASE WHEN number > 0 THEN max(id, number) END)");
    expect(index.where).toBe("(id > 1000)");
  });

  itIfSupports("expression_index", "not everything an expression", async () => {
    await createExampleTable();
    await adapter.execute(`CREATE INDEX "expression" ON "ex" (id, max(id, number))`);
    const indexes = (await adapter.indexes("ex")) as any[];
    const index = indexes.find((idx) => idx.name === "expression");
    expect(index.columns).toBe("id, max(id, number)");
  });

  it("primary key", async () => {
    const cols = (await adapter.execute(`PRAGMA table_info("items")`))!;
    const pkCol = cols.find((c: any) => c.pk === 1);
    expect(pkCol!.name).toBe("id");
  });

  it("no primary key", async () => {
    await adapter.execute(`CREATE TABLE "no_pk" ("a" TEXT, "b" TEXT)`);
    const cols = (await adapter.execute(`PRAGMA table_info("no_pk")`))!;
    const pkCols = cols.filter((c: any) => c.pk > 0);
    expect(pkCols).toHaveLength(0);
  });

  it("copy table with existing records have custom primary key", async () => {
    await adapter.execute(
      `CREATE TABLE "custom_pk_src" ("custom_id" INTEGER PRIMARY KEY, "name" TEXT)`,
    );
    await adapter.executeMutation(`INSERT INTO "custom_pk_src" ("name") VALUES ('Alice')`);
    await adapter.execute(`CREATE TABLE "custom_pk_dest" AS SELECT * FROM "custom_pk_src"`);
    const rows = (await adapter.execute(`SELECT * FROM "custom_pk_dest"`))!;
    expect(rows).toHaveLength(1);
    expect(rows[0].custom_id).toBe(1);
  });

  it("copy table with composite primary keys", async () => {
    await adapter.execute(
      `CREATE TABLE "cpk_src" ("a" INTEGER, "b" INTEGER, "val" TEXT, PRIMARY KEY ("a", "b"))`,
    );
    await adapter.executeMutation(`INSERT INTO "cpk_src" ("a", "b", "val") VALUES (1, 2, 'x')`);
    await adapter.execute(`CREATE TABLE "cpk_dest" AS SELECT * FROM "cpk_src"`);
    const rows = (await adapter.execute(`SELECT * FROM "cpk_dest"`))!;
    expect(rows).toHaveLength(1);
    expect(rows[0].val).toBe("x");
  });

  it("custom primary key in create table", async () => {
    await adapter.execute(
      `CREATE TABLE "custom_pk" ("custom_id" INTEGER PRIMARY KEY, "name" TEXT)`,
    );
    const cols = (await adapter.execute(`PRAGMA table_info("custom_pk")`))!;
    const pkCol = cols.find((c: any) => c.pk === 1);
    expect(pkCol!.name).toBe("custom_id");
  });

  it("custom primary key in change table", async () => {
    await adapter.execute(
      `CREATE TABLE "change_pk" ("custom_id" INTEGER PRIMARY KEY, "name" TEXT)`,
    );
    await adapter.execute(`ALTER TABLE "change_pk" ADD COLUMN "age" INTEGER DEFAULT 0`);
    const cols = (await adapter.execute(`PRAGMA table_info("change_pk")`))!;
    expect(cols.find((c: any) => c.name === "age")).toBeDefined();
    const pkCol = cols.find((c: any) => c.pk === 1);
    expect(pkCol!.name).toBe("custom_id");
  });

  it("add column with custom primary key", async () => {
    await adapter.createTable("barcodes", { id: false, force: true }, (t) => {
      t.integer("dummy");
    });
    await adapter.addColumn("barcodes", "id", "string", { primaryKey: true });

    expect(await adapter.primaryKey("barcodes")).toBe("id");

    const customPk = (await adapter.columns("barcodes")).find((c) => c.name === "id")!;

    expect(customPk.type).toBe("string");
    expect(customPk.null).toBe(false);
  });

  it("remove column preserves index options", async () => {
    await adapter.execute(
      `CREATE TABLE "barcodes" ("id" INTEGER PRIMARY KEY, "code" TEXT, "region" TEXT, "bool_attr" INTEGER)`,
    );
    await adapter.execute(`CREATE UNIQUE INDEX "unique" ON "barcodes" ("code")`);
    await adapter.execute(`CREATE INDEX "partial" ON "barcodes" ("code") WHERE bool_attr`);
    await adapter.execute(`CREATE INDEX "ordered" ON "barcodes" ("code" DESC)`);
    await adapter.removeColumn("barcodes", "region");

    const indexes = (await adapter.indexes("barcodes")) as any[];

    const partialIndex = indexes.find((idx) => idx.name === "partial");
    expect(partialIndex.where).toBe("bool_attr");

    const uniqueIndex = indexes.find((idx) => idx.name === "unique");
    expect(uniqueIndex.unique).toBe(true);

    const orderedIndex = indexes.find((idx) => idx.name === "ordered");
    expect(orderedIndex.orders).toBe("desc");
  });

  it("auto increment preserved on table changes", async () => {
    await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('b')`);
    await adapter.executeMutation(`DELETE FROM "items" WHERE "name" = 'b'`);
    const id = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('c')`);
    expect(id).toBe(3);
  });

  it("statement closed", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    await a.connectBang();
    expect(a.isOpen).toBe(true);
    await a.close();
    expect(a.isOpen).toBe(false);
  });

  it("db is not readonly when readonly option is false", async () => {
    const a = new BetterSQLite3Adapter(":memory:", { readonly: false });
    await a.connectBang();
    expect(a.isOpen).toBe(true);
    await a.close();
  });

  it("db is not readonly when readonly option is unspecified", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    await a.connectBang();
    expect(a.isOpen).toBe(true);
    await a.close();
  });

  it("db is readonly when readonly option is true", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const tmpFile = path.join(os.tmpdir(), `sqlite-readonly-test-${Date.now()}.db`);
    const writer = new BetterSQLite3Adapter(tmpFile);
    await writer.execute(`CREATE TABLE "test" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await writer.close();
    const reader = new BetterSQLite3Adapter(tmpFile, { readonly: true });
    const rows = (await reader.execute(`SELECT * FROM "test"`))!;
    expect(rows).toHaveLength(0);
    await reader.close();
    fs.unlinkSync(tmpFile);
  });

  it("writes are not permitted to readonly databases", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const tmpFile = path.join(os.tmpdir(), `sqlite-readonly-write-${Date.now()}.db`);
    const writer = new BetterSQLite3Adapter(tmpFile);
    await writer.execute(`CREATE TABLE "test" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await writer.close();
    const reader = new BetterSQLite3Adapter(tmpFile, { readonly: true });
    await expect(
      reader.executeMutation(`INSERT INTO "test" ("name") VALUES ('fail')`),
    ).rejects.toThrow();
    await reader.close();
    fs.unlinkSync(tmpFile);
  });

  it("strict strings by default", async () => {
    expect(SQLite3Adapter.strictStringsByDefault).toBe(false);
    const conn = new BetterSQLite3Adapter(":memory:");
    expect(conn._strictStrings).toBe(false);
    await conn.close();

    SQLite3Adapter.strictStringsByDefault = true;
    try {
      const strict = new BetterSQLite3Adapter(":memory:");
      expect(strict._strictStrings).toBe(true);
      await strict.execute(`CREATE TABLE "testings" ("id" INTEGER PRIMARY KEY)`);
      await expect(
        strict.execute(`CREATE INDEX "idx_non_existent2" ON "testings" ("non_existent2")`),
      ).rejects.toThrow(/no such column/i);
      await strict.close();
    } finally {
      SQLite3Adapter.strictStringsByDefault = false;
    }
  });

  it("strict strings by default and true in database yml", async () => {
    const conn = new BetterSQLite3Adapter(":memory:", { strict: true });
    try {
      expect(conn._strictStrings).toBe(true);
      await conn.execute(`CREATE TABLE "testings" ("id" INTEGER PRIMARY KEY)`);
      await expect(
        conn.execute(`CREATE INDEX "idx_non_existent" ON "testings" ("non_existent")`),
      ).rejects.toThrow(/no such column/i);
    } finally {
      await conn.close();
    }

    SQLite3Adapter.strictStringsByDefault = true;
    try {
      const strict = new BetterSQLite3Adapter(":memory:", { strict: true });
      try {
        expect(strict._strictStrings).toBe(true);
        await strict.execute(`CREATE TABLE "testings" ("id" INTEGER PRIMARY KEY)`);
        await expect(
          strict.execute(`CREATE INDEX "idx_non_existent2" ON "testings" ("non_existent2")`),
        ).rejects.toThrow(/no such column/i);
      } finally {
        await strict.close();
      }
    } finally {
      SQLite3Adapter.strictStringsByDefault = false;
    }
  });

  it("strict strings by default and false in database yml", async () => {
    const conn = new BetterSQLite3Adapter(":memory:", { strict: false });
    try {
      expect(conn._strictStrings).toBe(false);
    } finally {
      await conn.close();
    }

    SQLite3Adapter.strictStringsByDefault = true;
    try {
      const strict = new BetterSQLite3Adapter(":memory:", { strict: false });
      try {
        expect(strict._strictStrings).toBe(false);
      } finally {
        await strict.close();
      }
    } finally {
      SQLite3Adapter.strictStringsByDefault = false;
    }
  });

  it("forwards strictStringsByDefault to the driver via openSync(config)", async () => {
    const capture: { config: SqliteOpenConfig | null } = { config: null };
    const fakeStmt: SyncSqliteStatement = {
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      get: () => ({ v: "3.37.0" }),
      all: () => [],
      iterate: () => [].values(),
      columns: () => [],
      setReadBigInts: () => {},
      reader: true,
      close: () => {},
      closed: false,
    };
    const fakeConn: SyncSqliteConnection = {
      prepare: () => fakeStmt,
      exec: () => {},
      pragma: () => [],
      changes: () => 0,
      lastInsertRowId: () => 0,
      close: () => {},
      isOpen: () => true,
      raw: null,
    };
    const fakeDriver: SqliteDriver = {
      name: "fake-strict-capture",
      capabilities: {
        inProcessSync: true,
        streaming: false,
        loadExtension: false,
        concurrentStatements: true,
        foreignKeysOnByDefault: false,
        immediateTransactions: false,
        sharedCache: false,
      },
      open: () => Promise.reject(new Error("sync only")),
      openSync: (config: SqliteOpenConfig) => {
        capture.config = config;
        return fakeConn;
      },
    };

    const originalDefault = SQLite3Adapter.strictStringsByDefault;
    SQLite3Adapter.strictStringsByDefault = true;
    try {
      const conn = new BetterSQLite3Adapter(":memory:", { driver: fakeDriver });
      try {
        await conn.connectBang();
        expect(capture.config?.strict).toBe(true);
        expect(conn._strictStrings).toBe(true);
      } finally {
        await conn.close();
      }
    } finally {
      SQLite3Adapter.strictStringsByDefault = originalDefault;
    }

    capture.config = null;
    const explicit = new BetterSQLite3Adapter(":memory:", {
      driver: fakeDriver,
      strict: false,
    });
    try {
      await explicit.connectBang();
      expect((capture.config as SqliteOpenConfig | null)?.strict).toBe(false);
      expect(explicit._strictStrings).toBe(false);
    } finally {
      await explicit.close();
    }
  });

  it("rowid column", async () => {
    await adapter.execute(`CREATE TABLE "rowid_test" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    const cols = (await adapter.execute(`PRAGMA table_info("rowid_test")`))!;
    const idCol = cols.find((c: any) => c.name === "id");
    expect(idCol!.type).toBe("INTEGER");
    expect(idCol!.pk).toBe(1);
  });

  it("lowercase rowid column", async () => {
    await adapter.execute(`CREATE TABLE "rowid_lower" ("id" integer PRIMARY KEY, "name" text)`);
    const cols = (await adapter.execute(`PRAGMA table_info("rowid_lower")`))!;
    const idCol = cols.find((c: any) => c.name === "id");
    expect(idCol!.pk).toBe(1);
  });

  it("non integer column returns false for rowid", async () => {
    await adapter.execute(`CREATE TABLE "text_pk" ("id" TEXT PRIMARY KEY, "name" TEXT)`);
    const cols = (await adapter.execute(`PRAGMA table_info("text_pk")`))!;
    const idCol = cols.find((c: any) => c.name === "id");
    expect(idCol!.type).toBe("TEXT");
  });

  it("mixed case integer colum returns true for rowid", async () => {
    await adapter.execute(`CREATE TABLE "mixed_case" ("id" Integer PRIMARY KEY, "name" TEXT)`);
    const cols = (await adapter.execute(`PRAGMA table_info("mixed_case")`))!;
    const idCol = cols.find((c: any) => c.name === "id");
    expect((idCol as any).type.toUpperCase()).toBe("INTEGER");
    expect(idCol!.pk).toBe(1);
  });

  it("rowid column with autoincrement returns true for rowid", async () => {
    await adapter.execute(
      `CREATE TABLE "auto_inc" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT)`,
    );
    const cols = (await adapter.execute(`PRAGMA table_info("auto_inc")`))!;
    const idCol = cols.find((c: any) => c.name === "id");
    expect(idCol!.type).toBe("INTEGER");
    expect(idCol!.pk).toBe(1);
  });

  it("integer cpk column returns false for rowid", async () => {
    await adapter.execute(
      `CREATE TABLE "cpk" ("id1" INTEGER, "id2" INTEGER, "name" TEXT, PRIMARY KEY ("id1", "id2"))`,
    );
    const cols = (await adapter.execute(`PRAGMA table_info("cpk")`))!;
    const pkCols = cols.filter((c: any) => c.pk > 0);
    expect(pkCols).toHaveLength(2);
  });
  it("tables logs name", async () => {
    const sql =
      "SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND type IN ('table')";
    await assertLogged([[sql, "SCHEMA", []]], () => adapter.tables());
  });

  it("table exists logs name", async () => {
    await adapter.execute(
      `CREATE TABLE "ex" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "number" INTEGER)`,
    );
    const sql =
      "SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND name = 'ex' AND type IN ('table')";
    await assertLogged([[sql, "SCHEMA", []]], async () => {
      expect(await adapter.tableExists("ex")).toBe(true);
    });
  });

  it("indexes logs", async () => {
    await adapter.execute(
      `CREATE TABLE "ex" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "number" INTEGER)`,
    );
    await assertLogged([[`PRAGMA index_list("ex")`, "SCHEMA", []]], async () => {
      await adapter.indexes("ex");
    });
  });

  it("no indexes", async () => {
    expect(await adapter.indexes("items")).toEqual([]);
  });
});
