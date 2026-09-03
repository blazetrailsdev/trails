import { describe, it, expect, afterEach } from "vitest";
import { ActiveRecord } from "../ar-config.js";
import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import type { DatabaseConfigOptions } from "../database-configurations/database-config.js";

const dbConfig = (hash: Record<string, unknown>): HashConfig =>
  new HashConfig("test", "primary", hash as DatabaseConfigOptions);

describe("AbstractMysqlAdapter.dbconsole option keys", () => {
  const config = dbConfig({
    host: "localhost",
    username: "root",
    password: "secret",
    database: "blog",
  });

  it("masks the password with -p unless includePassword is set", () => {
    expect(AbstractMysqlAdapter.dbconsole(config)).not.toContain("--password=secret");
    expect(AbstractMysqlAdapter.dbconsole(config)).toContain("-p");
  });

  it("emits --password=… when includePassword is true", () => {
    const args = AbstractMysqlAdapter.dbconsole(config, { includePassword: true });
    expect(args).toContain("--password=secret");
    expect(args).not.toContain("-p");
  });

  it("keeps Ruby-truthy empty-string and zero config values", () => {
    const args = AbstractMysqlAdapter.dbconsole(
      dbConfig({ host: "", username: "", port: 0, socket: "" }),
    );
    expect(args).toContain("--host=");
    expect(args).toContain("--user=");
    expect(args).toContain("--port=0");
    expect(args).toContain("--socket=");
  });

  it("emits every flag rb:59-72 maps, in that order", () => {
    const args = AbstractMysqlAdapter.dbconsole(
      dbConfig({
        host: "h",
        port: 3307,
        socket: "s",
        username: "u",
        encoding: "utf8mb4",
        sslca: "ca",
        sslcert: "cert",
        sslcapath: "capath",
        sslcipher: "cipher",
        sslkey: "key",
        sslMode: "VERIFY_CA",
        database: "blog",
      }),
    );
    expect(args).toEqual([
      "mysql",
      "--host=h",
      "--port=3307",
      "--socket=s",
      "--user=u",
      "--default-character-set=utf8mb4",
      "--ssl-ca=ca",
      "--ssl-cert=cert",
      "--ssl-capath=capath",
      "--ssl-cipher=cipher",
      "--ssl-key=key",
      "--ssl-mode=VERIFY_CA",
      "blog",
    ]);
  });

  it("pushes an empty-string database, as Rails' unconditional args << config.database does", () => {
    expect(AbstractMysqlAdapter.dbconsole(dbConfig({ database: "" }))).toEqual(["mysql", ""]);
  });
});

describe("SQLite3Adapter.dbconsole option keys", () => {
  it("prepends -#{mode} and -header before the database path", () => {
    expect(
      SQLite3Adapter.dbconsole(dbConfig({ database: "db.sqlite3" }), {
        mode: "html",
        header: true,
      }),
    ).toEqual(["sqlite3", "-html", "-header", "db.sqlite3"]);
  });

  it("omits the flags when mode/header are absent", () => {
    expect(SQLite3Adapter.dbconsole(dbConfig({ database: "db.sqlite3" }))).toEqual([
      "sqlite3",
      "db.sqlite3",
    ]);
  });

  it("keeps a Ruby-truthy empty-string mode", () => {
    expect(SQLite3Adapter.dbconsole(dbConfig({ database: "db.sqlite3" }), { mode: "" })).toEqual([
      "sqlite3",
      "-",
      "db.sqlite3",
    ]);
  });
});

describe("dbconsole reads ActiveRecord.databaseCli", () => {
  const original = ActiveRecord.databaseCli;
  afterEach(() => {
    ActiveRecord.databaseCli = original;
  });

  it("names the configured client at the head of the argv", () => {
    ActiveRecord.databaseCli = { sqlite: "litecli", mysql: ["mycli"], postgresql: "pgcli" };
    expect(SQLite3Adapter.dbconsole(dbConfig({ database: "db.sqlite3" }))[0]).toBe("litecli");
    expect(AbstractMysqlAdapter.dbconsole(dbConfig({ database: "blog" }))[0]).toBe("mycli");
    expect(PostgreSQLAdapter.dbconsole(dbConfig({ database: "blog" })).argv).toEqual([
      "pgcli",
      "blog",
    ]);
  });
});

describe("PostgreSQLAdapter.dbconsole option keys", () => {
  const config = dbConfig({ username: "alice", host: "localhost", password: "secret" });

  it("sets PGPASSWORD only when includePassword is set", () => {
    expect(PostgreSQLAdapter.dbconsole(config).env.PGPASSWORD).toBeUndefined();
    expect(PostgreSQLAdapter.dbconsole(config, { includePassword: true }).env.PGPASSWORD).toBe(
      "secret",
    );
  });

  it("exports Ruby-truthy empty-string and zero config values", () => {
    const { env } = PostgreSQLAdapter.dbconsole(dbConfig({ username: "", host: "", port: 0 }));
    expect(env.PGUSER).toBe("");
    expect(env.PGHOST).toBe("");
    expect(env.PGPORT).toBe("0");
  });

  it("skips a false password even when includePassword is set", () => {
    const { env } = PostgreSQLAdapter.dbconsole(dbConfig({ password: false }), {
      includePassword: true,
    });
    expect(env.PGPASSWORD).toBeUndefined();
  });

  it("builds PGOPTIONS from variables, dropping only :default (not the bare string default)", () => {
    const { env } = PostgreSQLAdapter.dbconsole(
      dbConfig({
        variables: { statement_timeout: "5s", search_path: "default", lock_timeout: ":default" },
      }),
    );
    expect(env.PGOPTIONS).toBe("-c statement_timeout=5s -c search_path=default");
  });
});
