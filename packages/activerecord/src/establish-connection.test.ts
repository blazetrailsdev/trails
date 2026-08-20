import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { Mysql2Adapter } from "./connection-adapters/mysql2-adapter.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { join } from "path";
import { tmpdir } from "os";

async function resetConnection() {
  Base._adapter = null;
  await Base._connectionHandler.clearAllConnections();
  Base._connectionHandler = new ConnectionHandler();
}

describe("Base.establishConnection", () => {
  beforeEach(() => resetConnection());
  afterEach(() => resetConnection());

  it("creates a PostgresAdapter from a postgres:// URL", async () => {
    await Base.establishConnection("postgres://localhost:5432/testdb");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool).toBeDefined();
    expect(await pool!.checkout()).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("creates a PostgresAdapter from a postgresql:// URL", async () => {
    await Base.establishConnection("postgresql://localhost:5432/testdb");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("creates a MysqlAdapter from a mysql:// URL", async () => {
    await Base.establishConnection("mysql://localhost:3306/testdb");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(Mysql2Adapter);
  });

  it("creates a SqliteAdapter from a :memory: URL", async () => {
    await Base.establishConnection("sqlite3::memory:");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(BetterSQLite3Adapter);
  });

  it("creates a SqliteAdapter from a .sqlite3 file path", async () => {
    await Base.establishConnection(`sqlite3:${join(tmpdir(), "test.sqlite3")}`);
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(BetterSQLite3Adapter);
  });

  it("accepts a config object with adapter name", async () => {
    await Base.establishConnection({ adapter: "sqlite", database: ":memory:" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(BetterSQLite3Adapter);
  });

  it("throws for an unrecognized URL scheme", async () => {
    await expect(Base.establishConnection("ftp://localhost/db")).rejects.toThrow(
      /nonexistent 'ftp' adapter/,
    );
  });

  it("throws for an unknown adapter name", async () => {
    await expect(
      Base.establishConnection({ adapter: "oracle", url: "oracle://localhost" }),
    ).rejects.toThrow(/nonexistent 'oracle' adapter/);
  });

  it("registers the pool with the ConnectionHandler", async () => {
    await Base.establishConnection("sqlite3::memory:");
    expect(Base.connectionHandler.connectionPools.length).toBe(1);
  });

  it("accepts sqlite3 as an adapter name alias", async () => {
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(BetterSQLite3Adapter);
  });

  it("accepts postgres as an adapter name alias", async () => {
    await Base.establishConnection({ adapter: "postgres", url: "postgres://localhost/db" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("accepts mysql2 as an adapter name alias", async () => {
    await Base.establishConnection({ adapter: "mysql2", url: "mysql://localhost/db" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(Mysql2Adapter);
  });

  it("parses sqlite:// URLs into file paths", async () => {
    await Base.establishConnection("sqlite3:///tmp/test.sqlite3");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(await pool!.checkout()).toBeInstanceOf(BetterSQLite3Adapter);
  });
});

describe("Base.adapter without establishConnection", () => {
  beforeEach(() => resetConnection());
  afterEach(() => resetConnection());

  it("throws when no connection is established", () => {
    delete process.env.DATABASE_URL;
    expect(() => Base.connection).toThrow(/No database connection defined/);
  });
});
