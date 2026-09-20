import { it, expect, beforeEach, afterEach, vi } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import { Owner } from "../../test-helpers/models/owner.js";
import { ARUnit2Model } from "../../test-helpers/models/arunit2-model.js";
import { inMemoryDb } from "../../support/adapter-helper.js";
import { itIfSupports } from "../../support/supports.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { Notifications, indexBy } from "@blazetrails/activesupport";
import type { Database } from "better-sqlite3";
import type { SqliteConnection } from "../../sqlite-adapter.js";
import { BinaryData } from "@blazetrails/activemodel";

import { QueryAttribute } from "../../relation/query-attribute.js";
import { ValueType, IntegerType } from "@blazetrails/activemodel";
import { assertLogged } from "./test-helper.js";
import type { Column as SQLite3Column } from "../../connection-adapters/sqlite3/column.js";
import { assertCalled, assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { newSqlitePool } from "../../support/pooled-sqlite-adapter.js";
import { NullPool } from "../../connection-adapters/abstract/connection-pool.js";
import { StatementInvalid, StatementTimeout } from "../../errors.js";
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

async function withFileConnection(
  options: Record<string, unknown>,
  fn: (conn: BetterSQLite3Adapter) => Promise<void>,
): Promise<void> {
  options = { ...options };
  const dbConfig = ARUnit2Model.connectionDbConfig();
  options["database"] ??= dbConfig.database;
  const conn = new BetterSQLite3Adapter(options);

  try {
    await fn(conn);
  } finally {
    await conn.disconnectBang();
  }
}

async function capture(fn: () => Promise<void>): Promise<string> {
  let captured = "";
  const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    captured += `${args.join(" ")}\n`;
  });
  try {
    await fn();
  } finally {
    warn.mockRestore();
  }
  return captured;
}

async function rawConnectionOf(conn: BetterSQLite3Adapter): Promise<Database> {
  return ((await conn.rawConnection()) as unknown as SqliteConnection).raw as Database;
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
  await adapter.execute(`DROP TABLE IF EXISTS people`);
  await adapter.execute(`DROP TABLE IF EXISTS foos`);
  await adapter.execute(`DROP TABLE IF EXISTS ex`);
  await adapter.execute(`DROP TABLE IF EXISTS json_defs`);
  await pool.disconnect();
  Notifications.unsubscribeAll();
});

class Barcode extends Base {
  static {
    this._tableName = "barcodes";
  }
}

class BarcodeCustomPk extends Base {
  static {
    this._tableName = "barcode_custom_pks";
    this._primaryKey = "code";
  }
}

class BarcodeCpk extends Base {
  static {
    this._tableName = "barcode_cpks";
    this._primaryKey = ["region", "code"] as unknown as string;
  }
}

describeIfSqlite("SQLite3AdapterTest", () => {
  fixtures(["owners"], { useTransactionalTests: false });

  beforeEach(async () => {
    await adapter.execute(
      `CREATE TABLE "items" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT, "price" INTEGER, "active" INTEGER DEFAULT 1)`,
    );
  });

  it("database should get created when missing parent directories for database path", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sqlite3-adapter-"));
    const dbPath = path.join(dir, "_not_exist/-cinco-dog.sqlite3");
    await assertNothingRaised(async () => {
      const connection = new BetterSQLite3Adapter({ database: dbPath });
      await connection.dropTable("ex", { ifExists: true });
      await connection.disconnectBang();
    });
    expect(await BetterSQLite3Adapter.databaseExists({ database: dbPath })).toBeTruthy();
    await fs.promises.rm(dir, { recursive: true, force: true });
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
    const owner = await Owner.createBang({ name: "hello" });
    try {
      await owner.reload();
      const select = Owner.columns()
        .map((c: { name: string }) => `typeof(${c.name})`)
        .join(", ");
      const result = await (
        await Owner.leaseConnection()
      ).execQuery(
        `SELECT ${select}\nFROM   ${Owner.tableName}\nWHERE  ${Owner.primaryKey} = ${owner.id}\n`,
      );

      expect(result.rows[0].includes("blob")).toBeFalsy();
    } finally {
      await owner.delete();
    }
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
    // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if in_memory_db?` (sqlite3_adapter_test.rb:155)
    if (inMemoryDb()) {
      expect(await adapter.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
      expect(await adapter.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "memory" }]);
      expect(await adapter.execute("PRAGMA synchronous")).toEqual([{ synchronous: 1 }]);
      expect(await adapter.execute("PRAGMA journal_size_limit")).toEqual([
        { journal_size_limit: 67108864 },
      ]);
      expect(await adapter.execute("PRAGMA mmap_size")).toEqual([]);
      expect(await adapter.execute("PRAGMA cache_size")).toEqual([{ cache_size: 2000 }]);
    } else {
      await withFileConnection({}, async (conn) => {
        expect(await conn.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
        expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "wal" }]);
        expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 1 }]);
        expect(await conn.execute("PRAGMA journal_size_limit")).toEqual([
          { journal_size_limit: 67108864 },
        ]);
        expect(await conn.execute("PRAGMA mmap_size")).toEqual([{ mmap_size: 134217728 }]);
        expect(await conn.execute("PRAGMA cache_size")).toEqual([{ cache_size: 2000 }]);
      });
    }
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
    // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if in_memory_db?` (sqlite3_adapter_test.rb:190)
    if (inMemoryDb()) {
      await withMemoryConnection({ pragmas: { journal_mode: "delete" } }, async (conn) => {
        expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "memory" }]);
      });

      await withMemoryConnection({ pragmas: { journal_mode: ":delete" } }, async (conn) => {
        expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "memory" }]);
      });

      let error = await assertRaises([StatementInvalid], {}, async () => {
        await withMemoryConnection({ pragmas: { journal_mode: 0 } }, async (conn) => {
          await conn.execute("PRAGMA journal_mode");
        });
      });
      expect(error.message).toMatch(/nrecognized journal_mode 0/);

      error = await assertRaises([StatementInvalid], {}, async () => {
        await withMemoryConnection({ pragmas: { journal_mode: false } }, async (conn) => {
          await conn.execute("PRAGMA journal_mode");
        });
      });
      expect(error.message).toMatch(/nrecognized journal_mode false/);
    } else {
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");
      const tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sqlite3-journal-"));
      try {
        const databaseFile = path.join(tmpdir, "journal_mode_test.sqlite3");

        await withFileConnection(
          { database: databaseFile, pragmas: { journal_mode: "delete" } },
          async (conn) => {
            expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "delete" }]);
          },
        );

        await withFileConnection(
          { database: databaseFile, pragmas: { journal_mode: ":delete" } },
          async (conn) => {
            expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "delete" }]);
          },
        );

        let error = await assertRaises([StatementInvalid], {}, async () => {
          await withFileConnection(
            { database: databaseFile, pragmas: { journal_mode: 0 } },
            async (conn) => {
              await conn.execute("PRAGMA journal_mode");
            },
          );
        });
        expect(error.message).toMatch(/unrecognized journal_mode 0/);

        error = await assertRaises([StatementInvalid], {}, async () => {
          await withFileConnection(
            { database: databaseFile, pragmas: { journal_mode: false } },
            async (conn) => {
              await conn.execute("PRAGMA journal_mode");
            },
          );
        });
        expect(error.message).toMatch(/unrecognized journal_mode false/);
      } finally {
        await fs.promises.rm(tmpdir, { recursive: true, force: true });
      }
    }
  });

  it("overriding default synchronous pragma", async () => {
    const methodName = inMemoryDb() ? withMemoryConnection : withFileConnection;

    await methodName({ pragmas: { synchronous: ":full" } }, async (conn) => {
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 2 }]);
    });

    await methodName({ pragmas: { synchronous: 2 } }, async (conn) => {
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 2 }]);
    });

    await methodName({ pragmas: { synchronous: "full" } }, async (conn) => {
      expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 2 }]);
    });

    const error = await assertRaises([StatementInvalid], {}, async () => {
      await methodName({ pragmas: { synchronous: false } }, async (conn) => {
        await conn.execute("PRAGMA synchronous");
      });
    });
    expect(error.message).toMatch(/unrecognized synchronous false/);
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
    // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if in_memory_db?` (sqlite3_adapter_test.rb:380)
    if (inMemoryDb()) {
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
    } else {
      await withFileConnection({ pragmas: { temp_store: ":memory" } }, async (conn) => {
        expect(await conn.execute("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
        expect(await conn.execute("PRAGMA journal_mode")).toEqual([{ journal_mode: "wal" }]);
        expect(await conn.execute("PRAGMA synchronous")).toEqual([{ synchronous: 1 }]);
        expect(await conn.execute("PRAGMA journal_size_limit")).toEqual([
          { journal_size_limit: 67108864 },
        ]);
        expect(await conn.execute("PRAGMA mmap_size")).toEqual([{ mmap_size: 134217728 }]);
        expect(await conn.execute("PRAGMA cache_size")).toEqual([{ cache_size: 2000 }]);
        expect(await conn.execute("PRAGMA temp_store")).toEqual([{ temp_store: 2 }]);
      });
    }
  });

  it("setting invalid pragma", async () => {
    // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if in_memory_db?` (sqlite3_adapter_test.rb:404)
    if (inMemoryDb()) {
      const warning = await capture(async () => {
        await withMemoryConnection({ pragmas: { invalid: true } }, async (conn) => {
          await conn.execute("PRAGMA foreign_keys");
        });
      });
      expect(warning).toMatch(/Unknown SQLite pragma: invalid/);
    } else {
      const warning = await capture(async () => {
        await withFileConnection({ pragmas: { invalid: true } }, async (conn) => {
          await conn.execute("PRAGMA foreign_keys");
        });
      });
      expect(warning).toMatch(/Unknown SQLite pragma: invalid/);
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
    await createExampleTable();
    const sql = "INSERT INTO ex (number) VALUES (10)";
    const name = "foo";

    const pragmaQuery: [string, string, unknown[]] = [`PRAGMA table_xinfo("ex")`, "SCHEMA", []];
    const schemaQuery: [string, string, unknown[]] = [
      "SELECT sql FROM (SELECT * FROM sqlite_master UNION ALL SELECT * FROM sqlite_temp_master) WHERE type = 'table' AND name = 'ex'",
      "SCHEMA",
      [],
    ];
    const modifiedInsertQuery: [string, string, unknown[]] = [`${sql} RETURNING "id"`, name, []];
    await assertLogged([pragmaQuery, schemaQuery, modifiedInsertQuery], async () => {
      await adapter.insert(sql, name);
    });
  });

  it("insert id value returned", async () => {
    await createExampleTable();
    const sql = "INSERT INTO ex (number) VALUES (10)";
    const idval = "vuvuzela";
    const id = await adapter.insert(sql, null, null, idval);
    expect(id).toEqual(idval);
  });

  it("exec insert default values with returning disabled", async () => {
    const originalConn = adapter;
    adapter = new BetterSQLite3Adapter({
      database: ":memory:",
      insertReturning: false,
    }) as unknown as SQLite3Adapter;
    await createExampleTable();
    const result = await adapter.execInsert("insert into ex DEFAULT VALUES", null, [], "id");
    const expected = (await adapter.query("select max(id) from ex"))[0][0];
    expect(result.rows[0][0]).toEqual(Number(expected));
    adapter = originalConn;
  });

  it("select rows", async () => {
    await createExampleTable();
    for (const i of [0, 1]) {
      await adapter.create(`INSERT INTO ex (number) VALUES (${i})`);
    }
    const rows = await adapter.selectRows("select number, id from ex");
    expect(rows).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("select rows logged", async () => {
    await createExampleTable();
    const sql = "select * from ex";
    const name = "foo";
    await assertLogged([[sql, name, []]], async () => {
      await adapter.selectRows(sql, name);
    });
  });

  it("transaction", async () => {
    await createExampleTable();
    const countSql = "select count(*) from ex";

    await adapter.beginDbTransaction();
    await adapter.create("INSERT INTO ex (number) VALUES (10)");

    expect((await adapter.selectRows(countSql))[0][0]).toEqual(1);
    await adapter.rollbackDbTransaction();
    expect((await adapter.selectRows(countSql))[0][0]).toEqual(0);
  });

  it("tables", async () => {
    await adapter.execute(`DROP TABLE IF EXISTS items`);
    await createExampleTable();
    expect(await adapter.tables()).toEqual(["ex"]);
    await adapter.execute(
      `CREATE TABLE "people" ("id" integer PRIMARY KEY AUTOINCREMENT, "number" integer)`,
    );
    expect((await adapter.tables()).sort()).toEqual(["ex", "people"].sort());
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
      `CREATE TABLE "ex" (id integer PRIMARY KEY AUTOINCREMENT, number integer not null)`,
    );
    await assertNothingRaised(async () => {
      await adapter.addColumn("ex", "name", "string", { null: false });
    });
    const column = (await adapter.columns("ex")).find((x) => x.name === "name")!;
    expect(column.null).toBeFalsy();
  });

  it("index", async () => {
    await createExampleTable();
    await adapter.addIndex("ex", "id", { unique: true, name: "fun" });
    const indexes = await adapter.indexes("ex");
    const index = indexes.find((idx) => idx.name === "fun")!;

    expect(index.table).toEqual("ex");
    expect(index.unique).toBeTruthy();
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
    const indexes = await adapter.indexes("ex");
    const index = indexes.find((idx) => idx.name === "expression")!;
    expect(index.columns).toBe("max(id, number)");
  });

  itIfSupports("expression_index", "expression index with trailing comment", async () => {
    await createExampleTable();
    await adapter.execute(`CREATE INDEX expression on ex (number % 10) /* comment */`);
    const indexes = await adapter.indexes("ex");
    const index = indexes.find((idx) => idx.name === "expression")!;
    expect(index.columns).toBe("number % 10");
  });

  itIfSupports("expression_index", "expression index with where", async () => {
    await createExampleTable();
    await adapter.execute(
      `CREATE INDEX "expression" ON "ex" (id % 10, max(id, number)) WHERE id > 1000`,
    );
    const indexes = await adapter.indexes("ex");
    const index = indexes.find((idx) => idx.name === "expression")!;
    expect(index.columns).toBe("id % 10, max(id, number)");
    expect(index.where).toBe("id > 1000");
  });

  itIfSupports("expression_index", "complicated expression", async () => {
    await createExampleTable();
    await adapter.execute(
      `CREATE INDEX expression ON ex (id % 10, (CASE WHEN number > 0 THEN max(id, number) END))WHERE(id > 1000)`,
    );
    const indexes = await adapter.indexes("ex");
    const index = indexes.find((idx) => idx.name === "expression")!;
    expect(index.columns).toBe("id % 10, (CASE WHEN number > 0 THEN max(id, number) END)");
    expect(index.where).toBe("(id > 1000)");
  });

  itIfSupports("expression_index", "not everything an expression", async () => {
    await createExampleTable();
    await adapter.execute(`CREATE INDEX "expression" ON "ex" (id, max(id, number))`);
    const indexes = await adapter.indexes("ex");
    const index = indexes.find((idx) => idx.name === "expression")!;
    expect(index.columns).toBe("id, max(id, number)");
  });

  it("primary key", async () => {
    await createExampleTable();
    expect(await adapter.primaryKey("ex")).toEqual("id");
    await adapter.execute(
      `CREATE TABLE "foos" (internet integer PRIMARY KEY AUTOINCREMENT, number integer not null)`,
    );
    expect(await adapter.primaryKey("foos")).toEqual("internet");
  });

  it("no primary key", async () => {
    await adapter.execute(`CREATE TABLE "ex" (number integer not null)`);
    expect(await adapter.primaryKey("ex")).toBeNull();
  });

  it("copy table with existing records have custom primary key", async () => {
    const connection = (await BarcodeCustomPk.leaseConnection()) as any;
    try {
      await connection.createTable(
        "barcode_custom_pks",
        { primaryKey: "code", id: { type: "string", limit: 42 }, force: true },
        (t: any) => {
          t.text("other_attr");
        },
      );
      const code = "214fe0c2-dd47-46df-b53b-66090b3c1d40";
      await BarcodeCustomPk.createBang({ code, other_attr: "xxx" });

      await connection.removeColumn("barcode_custom_pks", "other_attr");

      expect((await BarcodeCustomPk.first())!.id).toEqual(code);
    } finally {
      await BarcodeCustomPk.resetColumnInformation();
      await connection.dropTable("barcode_custom_pks", { ifExists: true });
    }
  });

  it("copy table with composite primary keys", async () => {
    const connection = (await BarcodeCpk.leaseConnection()) as any;
    try {
      await connection.createTable(
        "barcode_cpks",
        { primaryKey: ["region", "code"], force: true },
        (t: any) => {
          t.string("region");
          t.string("code");
          t.text("other_attr");
        },
      );
      const region = "US";
      const code = "214fe0c2-dd47-46df-b53b-66090b3c1d40";
      await BarcodeCpk.createBang({ region, code, other_attr: "xxx" });

      await connection.removeColumn("barcode_cpks", "other_attr");

      expect(await connection.primaryKeys("barcode_cpks")).toEqual(["region", "code"]);

      const barcode = (await BarcodeCpk.first()) as any;
      expect(barcode.region).toEqual(region);
      expect(barcode.code).toEqual(code);
    } finally {
      await BarcodeCpk.resetColumnInformation();
      await connection.dropTable("barcode_cpks", { ifExists: true });
    }
  });

  it("custom primary key in create table", async () => {
    const connection = (await Barcode.leaseConnection()) as any;
    try {
      await connection.createTable("barcodes", { id: false, force: true }, (t: any) => {
        t.primaryKey("id", "string");
      });

      expect(await connection.primaryKey("barcodes")).toEqual("id");

      await Barcode.resetColumnInformation();
      await Barcode.loadSchema();
      const customPk = Barcode.columnsHash()["id"];

      expect(customPk.type).toEqual("string");
      expect(customPk.null).toBeFalsy();
    } finally {
      await Barcode.resetColumnInformation();
      await connection.dropTable("barcodes", { ifExists: true });
    }
  });

  it("custom primary key in change table", async () => {
    const connection = (await Barcode.leaseConnection()) as any;
    try {
      await connection.createTable("barcodes", { id: false, force: true }, (t: any) => {
        t.integer("dummy");
      });
      await connection.changeTable("barcodes", {}, async (t: any) => {
        await t.primaryKey("id", "string");
      });

      expect(await connection.primaryKey("barcodes")).toEqual("id");

      await Barcode.resetColumnInformation();
      await Barcode.loadSchema();
      const customPk = Barcode.columnsHash()["id"];

      expect(customPk.type).toEqual("string");
      expect(customPk.null).toBeFalsy();
    } finally {
      await Barcode.resetColumnInformation();
      await connection.dropTable("barcodes", { ifExists: true });
    }
  });

  it("add column with custom primary key", async () => {
    const connection = (await Barcode.leaseConnection()) as any;
    try {
      await connection.createTable("barcodes", { id: false, force: true }, (t: any) => {
        t.integer("dummy");
      });
      await connection.addColumn("barcodes", "id", "string", { primaryKey: true });

      expect(await connection.primaryKey("barcodes")).toEqual("id");

      await Barcode.resetColumnInformation();
      await Barcode.loadSchema();
      const customPk = Barcode.columnsHash()["id"];

      expect(customPk.type).toEqual("string");
      expect(customPk.null).toBeFalsy();
    } finally {
      await Barcode.resetColumnInformation();
      await connection.dropTable("barcodes", { ifExists: true });
    }
  });

  it("remove column preserves index options", async () => {
    const connection = (await Barcode.leaseConnection()) as any;
    try {
      await connection.createTable("barcodes", { force: true }, (t: any) => {
        t.string("code");
        t.string("region");
        t.boolean("bool_attr");

        t.index("code", { unique: true, name: "unique" });
        t.index("code", { where: "bool_attr", name: "partial" });
        t.index("code", { name: "ordered", order: { code: "desc" } });
      });
      await connection.removeColumn("barcodes", "region");

      const indexes = (await connection.indexes("barcodes")) as any[];

      const partialIndex = indexes.find((idx) => idx.name === "partial");
      expect(partialIndex.where).toEqual("bool_attr");

      const uniqueIndex = indexes.find((idx) => idx.name === "unique");
      expect(uniqueIndex.unique).toBeTruthy();

      const orderedIndex = indexes.find((idx) => idx.name === "ordered");
      expect(orderedIndex.orders).toEqual("desc");
    } finally {
      await Barcode.resetColumnInformation();
      await connection.dropTable("barcodes", { ifExists: true });
    }
  });

  it("auto increment preserved on table changes", async () => {
    const connection = (await Barcode.leaseConnection()) as any;
    try {
      await connection.createTable("barcodes", { force: true }, (t: any) => {
        t.string("code");
      });

      let pkColumn = (await connection.columns("barcodes")).find(
        (col: SQLite3Column) => col.name === "id",
      ) as SQLite3Column;
      let sql = (
        await connection.execQuery("SELECT sql FROM sqlite_master WHERE tbl_name='barcodes'")
      ).rows[0][0] as string;

      expect(pkColumn.isAutoIncrement).toBeTruthy();
      expect(sql.match("PRIMARY KEY AUTOINCREMENT")).toBeTruthy();

      await connection.changeColumn("barcodes", "code", "integer");

      pkColumn = (await connection.columns("barcodes")).find(
        (col: SQLite3Column) => col.name === "id",
      ) as SQLite3Column;
      sql = (await connection.execQuery("SELECT sql FROM sqlite_master WHERE tbl_name='barcodes'"))
        .rows[0][0] as string;

      expect(pkColumn.isAutoIncrement).toBeTruthy();
      expect(sql.match("PRIMARY KEY AUTOINCREMENT")).toBeTruthy();
    } finally {
      await Barcode.resetColumnInformation();
      await connection.dropTable("barcodes", { ifExists: true });
    }
  });

  // BLOCKED: sqlite3-statement-closed-busy-parity
  it.skip("statement closed", async () => {
    await adapter.connectBang();

    const rawConnection = (await adapter.rawConnection()) as unknown as SqliteConnection;
    const statement = await rawConnection.prepare(
      "CREATE TABLE statement_test (number integer not null)",
    );
    vi.spyOn(statement, "all").mockImplementation(() => {
      throw new Error("busy");
    });
    vi.spyOn(rawConnection, "prepare").mockImplementation(() => statement);
    await assertCalled(statement, "close", null, {}, async () => {
      const error: any = await assertRaises([StatementTimeout], {}, async () => {
        await adapter.execQuery("select * from statement_test");
      });
      expect(error.connectionPool).toEqual(adapter.pool);
    });
  });

  it("db is not readonly when readonly option is false", async () => {
    const conn = new BetterSQLite3Adapter({ database: ":memory:", readonly: false });
    await conn.connectBang();

    expect((await rawConnectionOf(conn)).readonly).toBeFalsy();
    await conn.disconnectBang();
  });

  it("db is not readonly when readonly option is unspecified", async () => {
    const conn = new BetterSQLite3Adapter({ database: ":memory:" });
    await conn.connectBang();

    expect((await rawConnectionOf(conn)).readonly).toBeFalsy();
    await conn.disconnectBang();
  });

  // BLOCKED: better-sqlite3 refuses readonly on :memory: (story sqlite-readonly-memory-and-strict-false)
  it.skip("db is readonly when readonly option is true", async () => {
    const conn = new BetterSQLite3Adapter({ database: ":memory:", readonly: true });
    await conn.connectBang();

    expect((await rawConnectionOf(conn)).readonly).toBeTruthy();
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
      expect(await adapter.tableExists("ex")).toBeTruthy();
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
