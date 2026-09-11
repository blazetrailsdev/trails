import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { trailsRoot } from "@blazetrails/activesupport";
import { AbstractAdapter } from "./abstract-adapter.js";
import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import type { DatabaseConfigOptions } from "../database-configurations/database-config.js";

const dbConfig = (hash: Record<string, unknown>): HashConfig =>
  new HashConfig("test", "primary", hash as DatabaseConfigOptions);

beforeEach(() => {
  vi.spyOn(AbstractAdapter, "findCmdAndExec").mockImplementation(
    (commands: string | string[], ...args: string[]) => [
      Array.isArray(commands) ? commands[0] : commands,
      ...args,
    ],
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AbstractMysqlAdapter.dbconsole option keys", () => {
  const config = dbConfig({
    host: "localhost",
    username: "root",
    password: "secret",
    database: "blog",
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

  it("pushes an empty-string database, as Rails' unconditional args << config.database does", () => {
    expect(AbstractMysqlAdapter.dbconsole(dbConfig({ database: "" }))).toEqual(["mysql", ""]);
  });
});

describe("SQLite3Adapter.dbconsole option keys", () => {
  const expanded = (database: string) => File.expandPath(database, trailsRoot() ?? undefined);

  it("prepends -#{mode} and -header before the database path", () => {
    expect(
      SQLite3Adapter.dbconsole(dbConfig({ database: "db.sqlite3" }), {
        mode: "html",
        header: true,
      }),
    ).toEqual(["sqlite3", "-html", "-header", expanded("db.sqlite3")]);
  });

  it("keeps a Ruby-truthy empty-string mode", () => {
    expect(SQLite3Adapter.dbconsole(dbConfig({ database: "db.sqlite3" }), { mode: "" })).toEqual([
      "sqlite3",
      "-",
      expanded("db.sqlite3"),
    ]);
  });
});

describe("PostgreSQLAdapter.dbconsole option keys", () => {
  const config = dbConfig({ username: "alice", host: "localhost", password: "secret" });

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
