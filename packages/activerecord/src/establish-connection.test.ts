import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { PostgreSQLAdapter } from "./adapters/postgresql-adapter.js";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { Mysql2Adapter } from "./adapters/mysql2-adapter.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function resetConnection() {
  Base._adapter = null;
  Base._connectionHandler.clearAllConnections();
  Base._connectionHandler = new ConnectionHandler();
}

describe("Base.establishConnection", () => {
  beforeEach(() => resetConnection());
  afterEach(() => resetConnection());

  it("creates a PostgresAdapter from a postgres:// URL", async () => {
    await Base.establishConnection("postgres://localhost:5432/testdb");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool).toBeDefined();
    expect(pool!.checkout()).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("creates a PostgresAdapter from a postgresql:// URL", async () => {
    await Base.establishConnection("postgresql://localhost:5432/testdb");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("creates a MysqlAdapter from a mysql:// URL", async () => {
    await Base.establishConnection("mysql://localhost:3306/testdb");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(Mysql2Adapter);
  });

  it("creates a SqliteAdapter from a :memory: URL", async () => {
    await Base.establishConnection(":memory:");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(SQLite3Adapter);
  });

  it("creates a SqliteAdapter from a .sqlite3 file path", async () => {
    await Base.establishConnection(join(tmpdir(), "test.sqlite3"));
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(SQLite3Adapter);
  });

  it("accepts a config object with adapter name", async () => {
    await Base.establishConnection({ adapter: "sqlite", database: ":memory:" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(SQLite3Adapter);
  });

  it("throws for an unrecognized URL scheme", async () => {
    await expect(Base.establishConnection("ftp://localhost/db")).rejects.toThrow(
      /Cannot detect database adapter/,
    );
  });

  it("throws for an unknown adapter name", async () => {
    await expect(
      Base.establishConnection({ adapter: "oracle", url: "oracle://localhost" }),
    ).rejects.toThrow(/nonexistent 'oracle' adapter/);
  });

  it("registers the pool with the ConnectionHandler", async () => {
    await Base.establishConnection(":memory:");
    expect(Base.connectionHandler.connectionPools.length).toBe(1);
  });

  it("accepts sqlite3 as an adapter name alias", async () => {
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(SQLite3Adapter);
  });

  it("accepts postgres as an adapter name alias", async () => {
    await Base.establishConnection({ adapter: "postgres", url: "postgres://localhost/db" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("accepts mysql2 as an adapter name alias", async () => {
    await Base.establishConnection({ adapter: "mysql2", url: "mysql://localhost/db" });
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(Mysql2Adapter);
  });

  it("parses sqlite:// URLs into file paths", async () => {
    await Base.establishConnection("sqlite3:///tmp/test.sqlite3");
    const pool = Base.connectionHandler.retrieveConnectionPool("Base");
    expect(pool!.checkout()).toBeInstanceOf(SQLite3Adapter);
  });
});

describe("Base.establishConnection with config file", () => {
  const originalEnv = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const tempDir = join(tmpdir(), `trails-test-${process.pid}`);
  const configPath = join(tempDir, "database.json");

  beforeEach(() => {
    resetConnection();
    mkdirSync(tempDir, { recursive: true });
    Base._configPath = configPath;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    Base._configPath = null;
    resetConnection();
    try {
      rmSync(tempDir, { recursive: true });
    } catch {}
  });

  it("connects from DATABASE_URL", async () => {
    process.env.DATABASE_URL = ":memory:";
    await Base.establishConnection();
    expect(Base.adapter).toBeInstanceOf(SQLite3Adapter);
  });

  it("connects from config/database.json", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";
    writeFileSync(
      configPath,
      JSON.stringify({
        development: {
          adapter: "sqlite",
          database: ":memory:",
        },
      }),
    );

    await Base.establishConnection();
    expect(Base.adapter).toBeInstanceOf(SQLite3Adapter);
  });

  it("uses NODE_ENV to select the environment from config", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "production";
    writeFileSync(
      configPath,
      JSON.stringify({
        development: {
          adapter: "sqlite",
          database: ":memory:",
        },
        production: {
          adapter: "postgresql",
          url: "postgres://localhost:5432/prod",
        },
      }),
    );

    await Base.establishConnection();
    expect(Base.adapter).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("DATABASE_URL overrides url in config file", async () => {
    process.env.DATABASE_URL = "postgres://localhost/override";
    process.env.NODE_ENV = "development";
    writeFileSync(
      configPath,
      JSON.stringify({
        development: {
          adapter: "postgresql",
          url: "postgres://localhost/from-config",
        },
      }),
    );

    await Base.establishConnection();
    expect(Base.adapter).toBeInstanceOf(PostgreSQLAdapter);
  });

  it("throws when no config file and no DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    await expect(Base.establishConnection()).rejects.toThrow(/No database configuration found/);
  });

  it("connection goes through ConnectionHandler pool", async () => {
    process.env.DATABASE_URL = ":memory:";
    await Base.establishConnection();
    void Base.adapter; // trigger pool checkout
    expect(Base.connectionHandler.connectionPools.length).toBe(1);
  });
});

describe("Base.establishConnection with JS config file", () => {
  const originalEnv = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCwd = process.cwd();
  const tempDir = join(tmpdir(), `trails-jsconfig-${process.pid}`);
  const configDir = join(tempDir, "config");

  beforeEach(() => {
    resetConnection();
    mkdirSync(configDir, { recursive: true });
    process.chdir(tempDir);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    process.chdir(originalCwd);
    Base._configPath = null;
    resetConnection();
    try {
      rmSync(tempDir, { recursive: true });
    } catch {}
  });

  it("loads config/database.js when present", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";
    writeFileSync(
      join(configDir, "database.js"),
      `module.exports = { development: { adapter: "sqlite", database: ":memory:" } };`,
    );

    await Base.establishConnection();
    expect(Base.adapter).toBeInstanceOf(SQLite3Adapter);
  });
});

describe("Base.adapter without establishConnection", () => {
  beforeEach(() => resetConnection());
  afterEach(() => resetConnection());

  it("throws when no connection is established", () => {
    delete process.env.DATABASE_URL;
    expect(() => Base.adapter).toThrow(/No connection pool for/);
  });
});
