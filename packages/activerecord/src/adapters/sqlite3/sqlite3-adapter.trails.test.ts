import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { newSqlitePool } from "../../support/pooled-sqlite-adapter.js";
import type { ConnectionPool } from "../../connection-adapters/abstract/connection-pool.js";
import { isInMemoryDatabase } from "../../sqlite/sqlite-uri.js";
import { fixtures } from "../../test-fixtures.js";
import {
  ActiveRecordError,
  StatementInvalid,
  StatementTimeout,
  ValueTooLong,
} from "../../errors.js";

describe("SqliteAdapter", () => {
  let adapter: SQLite3Adapter;
  let pool: ConnectionPool;

  beforeEach(async () => {
    pool = newSqlitePool();
    adapter = (await pool.checkout()) as unknown as SQLite3Adapter;
  });

  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "affinities"`);
    await pool.disconnect();
  });

  describe("alterTable", () => {
    it("round-trips a typeless (BLOB affinity) column", async () => {
      await adapter.exec(
        `CREATE TABLE "affinities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "untyped", "doomed" varchar)`,
      );
      await adapter.executeMutation(`INSERT INTO "affinities" ("untyped") VALUES (42)`);

      await adapter.removeColumn("affinities", "doomed");

      const columns = await adapter.columns("affinities");
      expect(columns.map((c) => c.name)).toEqual(["id", "untyped"]);
      expect(columns.find((c) => c.name === "untyped")?.sqlType).toBe("");
      const rows = await adapter.selectAll(`SELECT typeof("untyped") AS t FROM "affinities"`);
      expect(rows.rows[0]?.[0]).toBe("integer");
    });
  });

  const castType = (sqlType: string) => adapter.lookupCastType(sqlType);

  describe("lookupCastType", () => {
    it("resolves base SQL types", () => {
      expect(castType("text").name).toBe("text");
      expect(castType("integer").name).toBe("integer");
      expect(castType("float").name).toBe("float");
      expect(castType("boolean").name).toBe("boolean");
      expect(castType("date").name).toBe("date");
      expect(castType("datetime").name).toBe("datetime");
      expect(castType("time").name).toBe("time");
      expect(castType("json").name).toBe("json");
      expect(castType("blob").name).toBe("binary");
    });

    it("strips precision/scale metadata", () => {
      expect(castType("DECIMAL(10, 0)").name).toBe("decimal");
      expect(castType("decimal(5,2)").name).toBe("decimal");
      expect(castType("INTEGER(11)").name).toBe("integer");
    });

    it("handles case-insensitive types", () => {
      expect(castType("TEXT").name).toBe("text");
      expect(castType("INTEGER").name).toBe("integer");
      expect(castType("BOOLEAN").name).toBe("boolean");
    });

    it("resolves SQLite affinity types via regex", () => {
      expect(castType("varchar").name).toBe("string");
      expect(castType("character").name).toBe("string");
      expect(castType("clob").name).toBe("text");
      expect(castType("double").name).toBe("float");
      expect(castType("bigint").name).toBe("integer");
      expect(castType("tinyint").name).toBe("integer");
    });
  });
});

describe("isInMemoryDatabase", () => {
  const isMemoryFilename = isInMemoryDatabase;

  it("treats :memory: as in-memory", () => {
    expect(isMemoryFilename(":memory:")).toBe(true);
  });

  it("treats file::memory: URI as in-memory", () => {
    expect(isMemoryFilename("file::memory:?cache=shared")).toBe(true);
  });

  it("treats file:?mode=memory URI as in-memory", () => {
    expect(isMemoryFilename("file:memdb1?mode=memory&cache=shared")).toBe(true);
  });

  it("does NOT treat a path containing mode=memory text as in-memory", () => {
    expect(isMemoryFilename("file:/tmp/mode=memory.db")).toBe(false);
  });

  it("treats a regular file path as on-disk", () => {
    expect(isMemoryFilename("/tmp/test.db")).toBe(false);
  });
});

describe("SQLite3Adapter pragmas option", () => {
  let adapter: SQLite3Adapter | undefined;

  afterEach(async () => {
    await adapter?.close();
    vi.restoreAllMocks();
  });

  it("applies a valid numeric pragma on connect", async () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { cache_size: 500 } });
    await adapter.connectBang();
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "cache_size",
    ) as Array<{ cache_size: number }>;
    expect(result[0]?.cache_size).toBe(500);
  });

  it("applies a valid string enum pragma", async () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { synchronous: "FULL" } });
    await adapter.connectBang();
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "synchronous",
    ) as Array<{ synchronous: number }>;
    expect(result[0]?.synchronous).toBe(2);
  });

  it("converts boolean true to 1 for pragma", async () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { foreign_keys: true } });
    await adapter.connectBang();
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "foreign_keys",
    ) as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(1);
  });

  it("converts boolean false to 0 for pragma", async () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { foreign_keys: false } });
    await adapter.connectBang();
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "foreign_keys",
    ) as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(0);
  });

  it("warns and skips an invalid pragma name", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter(":memory:", {
      pragmas: { "bad-name!": 1 } as Record<string, number>,
    });
    await adapter.connectBang();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid SQLite pragma name"),
    );
  });

  it("warns and skips a string value with unsafe characters", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter(":memory:", {
      pragmas: { synchronous: "FULL; DROP TABLE users" },
    });
    await adapter.connectBang();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("unsafe characters"));
  });
});

describe("SQLite3 databaseExists", () => {
  it("answers true for an in-memory adapter without connecting", async () => {
    const a = new BetterSQLite3Adapter(":memory:");
    expect(await a.databaseExists()).toBe(true);
    await a.close();
  });

  it("answers from the file the driver opens, not a cached handle", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dbPath = path.join(os.tmpdir(), `sqlite-exists-instance-${Date.now()}.db`);
    const a = new BetterSQLite3Adapter(dbPath);
    try {
      await a.connectBang();
      expect(await a.databaseExists()).toBe(true);
      fs.rmSync(dbPath, { force: true });
      expect(await a.databaseExists()).toBe(false);
    } finally {
      await a.close();
      fs.rmSync(dbPath, { force: true });
    }
  });
});

describe("SQLite3 write-path float binds", () => {
  fixtures([]);

  it("binds a whole-valued float column as SQLITE_FLOAT", async () => {
    const { NumericData } = await import("../../test-helpers/models/numeric-data.js");
    const record = await NumericData.create({ temperature: 2.0 });
    const rows = (await NumericData.connection.execute(
      `SELECT typeof("temperature") AS t FROM "numeric_data" WHERE "id" = ${record.id}`,
    )) as Array<{ t: string }>;
    expect(rows[0].t).toBe("real");
  });
});

describe("SQLite3 translateException", () => {
  let pool: ConnectionPool;
  let adapter: SQLite3Adapter;

  beforeEach(async () => {
    pool = newSqlitePool();
    adapter = (await pool.checkout()) as unknown as SQLite3Adapter;
  });

  afterEach(async () => {
    await pool.disconnect();
  });

  const translate = (exception: unknown) =>
    adapter.translateException(exception, { message: "msg", sql: "SELECT 1", binds: [] });

  it("classifies a busy database as StatementTimeout", () => {
    const busy = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
    expect(translate(busy)).toBeInstanceOf(StatementTimeout);
  });

  it("passes an ActiveRecordError through unchanged", () => {
    const error = new ActiveRecordError("boom");
    expect(translate(error)).toBe(error);
  });

  it("does not translate an oversized value", () => {
    const tooLong = new Error("String or BLOB exceeded size limit");
    const translated = translate(tooLong);
    expect(translated).toBeInstanceOf(StatementInvalid);
    expect(translated).not.toBeInstanceOf(ValueTooLong);
  });
});
