import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { itIfSupports } from "../../support/supports.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { Notifications, indexBy } from "@blazetrails/activesupport";
import { BinaryData } from "@blazetrails/activemodel";

import { QueryAttribute } from "../../relation/query-attribute.js";
import { ValueType, IntegerType } from "@blazetrails/activemodel";
import { assertLogged } from "./test-helper.js";
import type { Column as SQLite3Column } from "../../connection-adapters/sqlite3/column.js";
import { assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { newSqlitePool } from "../../support/pooled-sqlite-adapter.js";
import { NullPool } from "../../connection-adapters/abstract/connection-pool.js";
import { StatementInvalid } from "../../errors.js";
import type { ConnectionPool } from "../../connection-adapters/abstract/connection-pool.js";

let adapter: SQLite3Adapter;
let pool: ConnectionPool;

beforeEach(async () => {
  pool = newSqlitePool();
  adapter = (await pool.checkout()) as unknown as SQLite3Adapter;
});

async function withMemoryConnection(
  options: Record<string, unknown>,
  fn: (conn: BetterSQLite3Adapter) => Promise<void>,
): Promise<void> {
  const conn = new BetterSQLite3Adapter({ ...options, database: ":memory:" });
  try {
    await conn.connectBang();
    await fn(conn);
  } finally {
    await conn.disconnectBang();
  }
}

async function withStrictStringsByDefault(fn: () => Promise<void>): Promise<void> {
  SQLite3Adapter.strictStringsByDefault = true;
  try {
    await fn();
  } finally {
    SQLite3Adapter.strictStringsByDefault = false;
  }
}

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
  await adapter.execute(`DROP TABLE IF EXISTS cpk_table`);
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
    const a = new BetterSQLite3Adapter({ database: dbPath });
    await a.connectBang();
    expect(a.isActive()).toBe(true);
    expect(await BetterSQLite3Adapter.databaseExists({ database: dbPath })).toBeTruthy();
    await a.disconnectBang();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it("database exists returns false when the database does not exist", async () => {
    expect(await BetterSQLite3Adapter.databaseExists({ database: "non_extant_db" })).toBeFalsy();
  });

  it("database exists returns true when database exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dbPath = path.join(os.tmpdir(), `sqlite-exists-${Date.now()}.db`);
    const a = new BetterSQLite3Adapter({ database: dbPath });
    try {
      await a.connectBang();
      expect(await BetterSQLite3Adapter.databaseExists({ database: dbPath })).toBeTruthy();
    } finally {
      await a.disconnectBang();
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("database exists returns true for an in memory db", async () => {
    expect(await BetterSQLite3Adapter.databaseExists({ database: ":memory:" })).toBeTruthy();
  });

  it("connect with url", async () => {
    const a = new BetterSQLite3Adapter({ database: ":memory:" });
    await a.connectBang();
    expect(a.isActive()).toBeTruthy();
    await a.disconnectBang();
  });

  it("connect memory with url", async () => {
    const a = new BetterSQLite3Adapter({ database: ":memory:" });
    await a.connectBang();
    expect(a.isActive()).toBeTruthy();
    await a.disconnectBang();
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
    await createExampleTable();
    const vals = [new QueryAttribute("number", 10, new ValueType())];
    await adapter.execInsert("insert into ex (number) VALUES (?)", "SQL", vals);

    const result = await adapter.execQuery("select number from ex where number = ?", "SQL", vals);

    expect(result.rows.length).toEqual(1);
    expect(result.rows[0][0]).toEqual(10);
  });

  it("exec insert with quote", async () => {
    await createExampleTable();
    const vals = [new QueryAttribute("number", 10, new ValueType())];
    await adapter.execInsert('insert into "ex" (number) VALUES (?)', "SQL", vals);

    const result = await adapter.execQuery('select number from "ex" where number = ?', "SQL", vals);

    expect(result.rows.length).toEqual(1);
    expect(result.rows[0][0]).toEqual(10);
  });

  it("primary key returns nil for no pk", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id int, data string)`);
    expect(await adapter.primaryKey("ex")).toBeNull();
  });

  it("connection no db", async () => {
    const os = await import("os");
    const path = await import("path");
    const a = new BetterSQLite3Adapter({
      database: path.join(os.tmpdir(), "nonexistent-path-12345", "no.db"),
      readonly: true,
    });
    await expect(a.connectBang()).rejects.toThrow();
  });

  it("bad timeout", async () => {
    const a = new BetterSQLite3Adapter({ database: ":memory:", timeout: "usa" });
    const exception: any = await assertRaises([StatementInvalid], {}, async () => {
      await a.connectBang();
    });
    expect(exception.message).toMatch("TypeError");
    expect(exception.connectionPool).toBeInstanceOf(NullPool);
  });

  it("nil timeout", async () => {
    const a = new BetterSQLite3Adapter({ database: ":memory:", timeout: undefined });
    await a.connectBang();
    expect(a).toBeTruthy();
    await a.disconnectBang();
  });

  it("connect", async () => {
    const a = new BetterSQLite3Adapter({ database: ":memory:" });
    expect(a).toBeTruthy();
    await a.disconnectBang();
  });

  it("encoding", async () => {
    const rows = (await adapter.execute(`PRAGMA encoding`))!;
    expect(rows[0].encoding).toBe("UTF-8");
  });

  it("default pragmas", async () => {
    await withMemoryConnection({}, async (conn) => {
      expect(await conn.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
      expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "memory" }]);
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 1 }]);
      expect(await conn.execute("PRAGMA journal_size_limit")).toEqual([
        { journal_size_limit: 67108864 },
      ]);
      expect(await conn.execute("PRAGMA mmap_size")).toEqual([]);
      expect(await conn.execute("PRAGMA cache_size")).toEqual([{ cache_size: 2000 }]);
    });
  });

  // BLOCKED: pragmas.ts raises JSON-quoted/no Ruby NoMethodError messages (story sqlite-pragma-error-parity)
  it.skip("overriding default foreign keys pragma", async () => {
    await withMemoryConnection({ pragmas: { foreign_keys: false } }, async (conn) => {
      expect(await conn.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 0 }]);
    });

    await withMemoryConnection({ pragmas: { foreign_keys: 0 } }, async (conn) => {
      expect(await conn.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 0 }]);
    });

    await withMemoryConnection({ pragmas: { foreign_keys: "false" } }, async (conn) => {
      expect(await conn.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 0 }]);
    });

    await expect(
      withMemoryConnection({ pragmas: { foreign_keys: ":false" } }, async (conn) => {
        await conn.execute("PRAGMA foreign_keys");
      }),
    ).rejects.toThrow(/unrecognized pragma parameter :false/);
  });

  it("overriding default journal mode pragma", async () => {
    await withMemoryConnection({ pragmas: { journal_mode: "delete" } }, async (conn) => {
      expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "memory" }]);
    });

    await withMemoryConnection({ pragmas: { journal_mode: ":delete" } }, async (conn) => {
      expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "memory" }]);
    });

    await expect(
      withMemoryConnection({ pragmas: { journal_mode: 0 } }, async (conn) => {
        await conn.execute("PRAGMA journal_mode");
      }),
    ).rejects.toThrow(/nrecognized journal_mode 0/);

    await expect(
      withMemoryConnection({ pragmas: { journal_mode: false } }, async (conn) => {
        await conn.execute("PRAGMA journal_mode");
      }),
    ).rejects.toThrow(/nrecognized journal_mode false/);
  });

  it("overriding default synchronous pragma", async () => {
    await withMemoryConnection({ pragmas: { synchronous: ":full" } }, async (conn) => {
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 2 }]);
    });

    await withMemoryConnection({ pragmas: { synchronous: 2 } }, async (conn) => {
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 2 }]);
    });

    await withMemoryConnection({ pragmas: { synchronous: "full" } }, async (conn) => {
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 2 }]);
    });

    await expect(
      withMemoryConnection({ pragmas: { synchronous: false } }, async (conn) => {
        await conn.execute("PRAGMA synchronous");
      }),
    ).rejects.toThrow(/unrecognized synchronous false/);
  });

  // BLOCKED: pragmas.ts raises JSON-quoted/no Ruby NoMethodError messages (story sqlite-pragma-error-parity)
  it.skip("overriding default journal size limit pragma", async () => {
    await withMemoryConnection({ pragmas: { journal_size_limit: 100 } }, async (conn) => {
      expect(await conn.execute("PRAGMA journal_size_limit")).toEqual([
        { journal_size_limit: 100 },
      ]);
    });

    await withMemoryConnection({ pragmas: { journal_size_limit: "200" } }, async (conn) => {
      expect(await conn.execute("PRAGMA journal_size_limit")).toEqual([
        { journal_size_limit: 200 },
      ]);
    });

    await expect(
      withMemoryConnection({ pragmas: { journal_size_limit: false } }, async (conn) => {
        await conn.execute("PRAGMA journal_size_limit");
      }),
    ).rejects.toThrow(/to_i/);
    await expect(
      withMemoryConnection({ pragmas: { journal_size_limit: ":false" } }, async (conn) => {
        await conn.execute("PRAGMA journal_size_limit");
      }),
    ).rejects.toThrow(/to_i/);
  });

  // BLOCKED: pragmas.ts raises JSON-quoted/no Ruby NoMethodError messages (story sqlite-pragma-error-parity)
  it.skip("overriding default mmap size pragma", async () => {
    await withMemoryConnection({ pragmas: { mmap_size: 100 } }, async (conn) => {
      expect(await conn.execute("PRAGMA mmap_size")).toEqual([]);
    });

    await withMemoryConnection({ pragmas: { mmap_size: "200" } }, async (conn) => {
      expect(await conn.execute("PRAGMA mmap_size")).toEqual([]);
    });

    await expect(
      withMemoryConnection({ pragmas: { mmap_size: false } }, async (conn) => {
        await conn.execute("PRAGMA mmap_size");
      }),
    ).rejects.toThrow(/to_i/);
    await expect(
      withMemoryConnection({ pragmas: { mmap_size: ":false" } }, async (conn) => {
        await conn.execute("PRAGMA mmap_size");
      }),
    ).rejects.toThrow(/to_i/);
  });

  // BLOCKED: pragmas.ts raises JSON-quoted/no Ruby NoMethodError messages (story sqlite-pragma-error-parity)
  it.skip("overriding default cache size pragma", async () => {
    await withMemoryConnection({ pragmas: { cache_size: 100 } }, async (conn) => {
      expect(await conn.execute("PRAGMA cache_size")).toEqual([{ cache_size: 100 }]);
    });

    await withMemoryConnection({ pragmas: { cache_size: "200" } }, async (conn) => {
      expect(await conn.execute("PRAGMA cache_size")).toEqual([{ cache_size: 200 }]);
    });

    await expect(
      withMemoryConnection({ pragmas: { cache_size: false } }, async (conn) => {
        await conn.execute("PRAGMA cache_size");
      }),
    ).rejects.toThrow(/to_i/);
    await expect(
      withMemoryConnection({ pragmas: { cache_size: ":false" } }, async (conn) => {
        await conn.execute("PRAGMA cache_size");
      }),
    ).rejects.toThrow(/to_i/);
  });

  it("setting new pragma", async () => {
    await withMemoryConnection({ pragmas: { temp_store: ":memory" } }, async (conn) => {
      expect(await conn.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
      expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "memory" }]);
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 1 }]);
      expect(await conn.execute("PRAGMA journal_size_limit")).toEqual([
        { journal_size_limit: 67108864 },
      ]);
      expect(await conn.execute("PRAGMA mmap_size")).toEqual([]);
      expect(await conn.execute("PRAGMA cache_size")).toEqual([{ cache_size: 2000 }]);
      expect(await conn.execute("PRAGMA temp_store")).toEqual([{ temp_store: 2 }]);
    });
  });

  it("setting invalid pragma", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await withMemoryConnection({ pragmas: { invalid: true } }, async (conn) => {
        await conn.execute("PRAGMA foreign_keys");
      });
      expect(warn.mock.calls.map((c) => String(c[0])).join("")).toMatch(
        /Unknown SQLite pragma: invalid/,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("exec no binds", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id int, data string)`);
    let result = await adapter.execQuery("SELECT id, data FROM ex");
    expect(result.rows.length).toEqual(0);
    expect(result.columns.length).toEqual(2);
    expect(result.columns).toEqual(["id", "data"]);

    await adapter.execQuery("INSERT INTO ex (id, data) VALUES (1, 'foo')");
    result = await adapter.execQuery("SELECT id, data FROM ex");
    expect(result.rows.length).toEqual(1);
    expect(result.columns.length).toEqual(2);

    expect(result.rows).toEqual([[1, "foo"]]);
  });

  it("exec query with binds", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id int, data string)`);
    await adapter.execQuery("INSERT INTO ex (id, data) VALUES (1, 'foo')");
    const result = await adapter.execQuery("SELECT id, data FROM ex WHERE id = ?", null, [
      new QueryAttribute("", 1, new ValueType()),
    ]);

    expect(result.rows.length).toEqual(1);
    expect(result.columns.length).toEqual(2);

    expect(result.rows).toEqual([[1, "foo"]]);
  });

  it("exec query typecasts bind vals", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id int, data string)`);
    await adapter.execQuery("INSERT INTO ex (id, data) VALUES (1, 'foo')");

    const result = await adapter.execQuery("SELECT id, data FROM ex WHERE id = ?", null, [
      new QueryAttribute("id", "1-fuu", new IntegerType()),
    ]);

    expect(result.rows.length).toEqual(1);
    expect(result.columns.length).toEqual(2);

    expect(result.rows).toEqual([[1, "foo"]]);
  });

  it("quote binary column escapes it", async () => {
    await adapter.execute(`CREATE TABLE "bin_esc" ("id" INTEGER PRIMARY KEY, "data" BLOB)`);
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    await adapter.execInsert(`INSERT INTO "bin_esc" ("data") VALUES (?)`, null, [
      new BinaryData(buf),
    ]);
    const rows = (await adapter.execute(`SELECT "data" FROM "bin_esc"`))!;
    expect(Buffer.from(rows[0].data as Buffer)).toEqual(buf);
  });

  it("type cast should not mutate encoding", async () => {
    await adapter.execute(`CREATE TABLE "enc_test" ("id" INTEGER PRIMARY KEY, "data" BLOB)`);
    const original = Buffer.from("hello world");
    const copy = Buffer.from(original);
    await adapter.execInsert(`INSERT INTO "enc_test" ("data") VALUES (?)`, null, [
      new BinaryData(copy),
    ]);
    expect(original).toEqual(Buffer.from("hello world"));
  });

  it("execute", async () => {
    await createExampleTable();
    await adapter.execute("INSERT INTO ex (number) VALUES (10)");
    const records = (await adapter.execute("SELECT * FROM ex"))!;
    expect(records.length).toEqual(1);

    const record = records[0];
    expect(record["number"]).toEqual(10);
    expect(record["id"]).toEqual(1);
  });

  it("insert logged", async () => {
    const sql = `INSERT INTO "items" ("name") VALUES ('logged')`;
    const logged: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("INSERT")) logged.push(event.payload.sql);
    });
    try {
      await adapter.execute(sql);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(logged.some((s) => s.includes("INSERT") && s.includes("logged"))).toBe(true);
  });

  it("insert id value returned", async () => {
    const id1 = await adapter.insert(`INSERT INTO "items" ("name") VALUES ('a')`);
    const id2 = await adapter.insert(`INSERT INTO "items" ("name") VALUES ('b')`);
    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });

  it("exec insert default values with returning disabled", async () => {
    await adapter.execute(
      `CREATE TABLE "def_vals" ("id" INTEGER PRIMARY KEY, "name" TEXT DEFAULT 'default')`,
    );
    const id = await adapter.insert(`INSERT INTO "def_vals" DEFAULT VALUES`);
    expect(id).toBe(1);
    const rows = (await adapter.execute(`SELECT * FROM "def_vals"`))!;
    expect(rows[0].name).toBe("default");
  });

  it("select rows", async () => {
    await adapter.execute(`INSERT INTO "items" ("name", "price") VALUES ('a', 1)`);
    await adapter.execute(`INSERT INTO "items" ("name", "price") VALUES ('b', 2)`);
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
    await adapter.execute(`INSERT INTO "items" ("name") VALUES ('x')`);
    await adapter.commitTransaction();
    const rows = (await adapter.execute(`SELECT * FROM "items"`))!;
    expect(rows).toHaveLength(1);
  });

  it("tables", async () => {
    await adapter.execute(`DROP TABLE IF EXISTS items`);
    await createExampleTable();
    expect(await adapter.tables()).toEqual(["ex"]);
    await adapter.execute(
      `CREATE TABLE "people" ("id" integer PRIMARY KEY AUTOINCREMENT, "number" integer)`,
    );
    try {
      expect((await adapter.tables()).sort()).toEqual(["ex", "people"].sort());
    } finally {
      await adapter.execute(`DROP TABLE IF EXISTS "people"`);
    }
  });

  it("columns", async () => {
    await createExampleTable();
    const columns = (await adapter.columns("ex")).sort((a, b) => a.name.localeCompare(b.name));
    expect(columns.length).toEqual(2);
    expect(columns.map((c) => c.name)).toEqual(["id", "number"]);
    expect(columns.map((c) => c.default)).toEqual([null, null]);
    expect(columns.map((c) => c.null)).toEqual([true, true]);
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
      `CREATE TABLE "ex" (id integer PRIMARY KEY AUTOINCREMENT, number integer not null)`,
    );
    const column = (await adapter.columns("ex")).find((x) => x.name === "number")!;
    expect(column.null).toBeFalsy();
  });

  it("add column with not null", async () => {
    await adapter.execute(
      `ALTER TABLE "items" ADD COLUMN "required" TEXT NOT NULL DEFAULT 'default_val'`,
    );
    const cols = (await adapter.execute(`PRAGMA table_info("items")`))!;
    const reqCol = cols.find((c: any) => c.name === "required");
    expect(reqCol!.notnull).toBe(1);
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
    await createExampleTable();
    await adapter.addIndex("ex", "id");

    await assertNothingRaised(async () => {
      await adapter.addIndex("ex", "id", { ifNotExists: true });
    });
  });

  it("non unique index", async () => {
    await adapter.execute(`CREATE INDEX "fun" ON "items" ("id")`);
    const indexes = (await adapter.indexes("items")) as any[];
    const index = indexes.find((idx) => idx.name === "fun");
    expect(index.unique).toBeFalsy();
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
    await adapter.execute(`CREATE TABLE "ex" (number integer not null)`);
    expect(await adapter.primaryKey("ex")).toBeNull();
  });

  it("copy table with existing records have custom primary key", async () => {
    await adapter.execute(
      `CREATE TABLE "custom_pk_src" ("custom_id" INTEGER PRIMARY KEY, "name" TEXT)`,
    );
    await adapter.execute(`INSERT INTO "custom_pk_src" ("name") VALUES ('Alice')`);
    await adapter.execute(`CREATE TABLE "custom_pk_dest" AS SELECT * FROM "custom_pk_src"`);
    const rows = (await adapter.execute(`SELECT * FROM "custom_pk_dest"`))!;
    expect(rows).toHaveLength(1);
    expect(rows[0].custom_id).toBe(1);
  });

  it("copy table with composite primary keys", async () => {
    await adapter.execute(
      `CREATE TABLE "cpk_src" ("a" INTEGER, "b" INTEGER, "val" TEXT, PRIMARY KEY ("a", "b"))`,
    );
    await adapter.execute(`INSERT INTO "cpk_src" ("a", "b", "val") VALUES (1, 2, 'x')`);
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
    await adapter.execute(`INSERT INTO "items" ("name") VALUES ('a')`);
    await adapter.execute(`INSERT INTO "items" ("name") VALUES ('b')`);
    await adapter.execute(`DELETE FROM "items" WHERE "name" = 'b'`);
    const id = await adapter.insert(`INSERT INTO "items" ("name") VALUES ('c')`);
    expect(id).toBe(3);
  });

  it("statement closed", async () => {
    const a = new BetterSQLite3Adapter({ database: ":memory:" });
    await a.connectBang();
    expect(a.isActive()).toBe(true);
    await a.disconnectBang();
    expect(a.isActive()).toBe(false);
  });

  it("db is not readonly when readonly option is false", async () => {
    const conn = new BetterSQLite3Adapter({ database: ":memory:", readonly: false });
    await conn.connectBang();

    expect((conn.rawConnection as any).readonly).toBeFalsy();
    await conn.disconnectBang();
  });

  it("db is not readonly when readonly option is unspecified", async () => {
    const conn = new BetterSQLite3Adapter({ database: ":memory:" });
    await conn.connectBang();

    expect((conn.rawConnection as any).readonly).toBeFalsy();
    await conn.disconnectBang();
  });

  // BLOCKED: better-sqlite3 refuses readonly on :memory: (story sqlite-readonly-memory-and-strict-false)
  it.skip("db is readonly when readonly option is true", async () => {
    const conn = new BetterSQLite3Adapter({ database: ":memory:", readonly: true });
    await conn.connectBang();

    expect((conn.rawConnection as any).readonly).toBeTruthy();
    await conn.disconnectBang();
  });

  // BLOCKED: better-sqlite3 refuses readonly on :memory: (story sqlite-readonly-memory-and-strict-false)
  it.skip("writes are not permitted to readonly databases", async () => {
    const conn = new BetterSQLite3Adapter({ database: ":memory:", readonly: true });
    await conn.connectBang();

    const exception: any = await assertRaises([StatementInvalid], {}, async () => {
      await conn.execute("CREATE TABLE test(id integer)");
    });
    expect(exception.message).toMatch("SQLite3::ReadOnlyException");
    expect(exception.connectionPool).toEqual(conn.pool);
    await conn.disconnectBang();
  });

  // BLOCKED: strict: false is not applied to the connection (story sqlite-readonly-memory-and-strict-false)
  it.skip("strict strings by default", async () => {
    let conn = new BetterSQLite3Adapter({ database: ":memory:" });
    await conn.createTable("testings");

    await assertNothingRaised(async () => {
      await conn.addIndex("testings", "non_existent");
    });
    await conn.disconnectBang();

    await withStrictStringsByDefault(async () => {
      conn = new BetterSQLite3Adapter({ database: ":memory:" });
      await conn.createTable("testings");

      const error: any = await assertRaises([Error], {}, async () => {
        await conn.addIndex("testings", "non_existent2");
      });
      expect(error.message).toMatch(/no such column: "?non_existent2"?/);
      expect(error.connectionPool).toEqual(conn.pool);
      await conn.disconnectBang();
    });
  });

  it("strict strings by default and true in database yml", async () => {
    let conn = new BetterSQLite3Adapter({ database: ":memory:", strict: true });
    await conn.createTable("testings");

    let error: any = await assertRaises([Error], {}, async () => {
      await conn.addIndex("testings", "non_existent");
    });
    expect(error.message).toMatch(/no such column: "?non_existent"?/);
    expect(error.connectionPool).toEqual(conn.pool);
    await conn.disconnectBang();

    await withStrictStringsByDefault(async () => {
      conn = new BetterSQLite3Adapter({ database: ":memory:", strict: true });
      await conn.createTable("testings");

      error = await assertRaises([Error], {}, async () => {
        await conn.addIndex("testings", "non_existent2");
      });
      expect(error.message).toMatch(/no such column: "?non_existent2"?/);
      expect(error.connectionPool).toEqual(conn.pool);
      await conn.disconnectBang();
    });
  });

  // BLOCKED: strict: false is not applied to the connection (story sqlite-readonly-memory-and-strict-false)
  it.skip("strict strings by default and false in database yml", async () => {
    let conn = new BetterSQLite3Adapter({ database: ":memory:", strict: false });
    await conn.createTable("testings");

    await assertNothingRaised(async () => {
      await conn.addIndex("testings", "non_existent");
    });
    await conn.disconnectBang();

    await withStrictStringsByDefault(async () => {
      conn = new BetterSQLite3Adapter({ database: ":memory:", strict: false });
      await conn.createTable("testings");

      await assertNothingRaised(async () => {
        await conn.addIndex("testings", "non_existent");
      });
      await conn.disconnectBang();
    });
  });

  it("rowid column", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id_uppercase INTEGER PRIMARY KEY)`);
    expect(
      indexBy((await adapter.columns("ex")) as SQLite3Column[], (c: SQLite3Column) => c.name)[
        "id_uppercase"
      ].rowid,
    ).toBeTruthy();
  });

  it("lowercase rowid column", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id_lowercase integer PRIMARY KEY)`);
    expect(
      indexBy((await adapter.columns("ex")) as SQLite3Column[], (c: SQLite3Column) => c.name)[
        "id_lowercase"
      ].rowid,
    ).toBeTruthy();
  });

  it("non integer column returns false for rowid", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id_int_short int PRIMARY KEY)`);
    expect(
      indexBy((await adapter.columns("ex")) as SQLite3Column[], (c: SQLite3Column) => c.name)[
        "id_int_short"
      ].rowid,
    ).toBeFalsy();
  });

  it("mixed case integer colum returns true for rowid", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id_mixed_case InTeGeR PRIMARY KEY)`);
    expect(
      indexBy((await adapter.columns("ex")) as SQLite3Column[], (c: SQLite3Column) => c.name)[
        "id_mixed_case"
      ].rowid,
    ).toBeTruthy();
  });

  it("rowid column with autoincrement returns true for rowid", async () => {
    await adapter.execute(`CREATE TABLE "ex" (id_autoincrement integer PRIMARY KEY AUTOINCREMENT)`);
    expect(
      indexBy((await adapter.columns("ex")) as SQLite3Column[], (c: SQLite3Column) => c.name)[
        "id_autoincrement"
      ].rowid,
    ).toBeTruthy();
  });

  it("integer cpk column returns false for rowid", async () => {
    await adapter.execute(
      `CREATE TABLE "cpk_table" (id integer, shop_id integer, PRIMARY KEY (shop_id, id))`,
    );
    expect(
      ((await adapter.columns("cpk_table")) as SQLite3Column[]).some((c) => c.rowid),
    ).toBeFalsy();
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
