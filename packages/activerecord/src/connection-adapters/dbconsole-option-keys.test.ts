import { describe, it, expect } from "vitest";
import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

// The Rails `dbconsole` PTY exec is unported (see scripts/api-compare/
// unported-files.ts); these cover the option-key parity of the arg/env
// builders only — `include_password` (mysql/pg), `header`/`mode` (sqlite3).

describe("AbstractMysqlAdapter.dbconsole option keys", () => {
  const config = { host: "localhost", username: "root", password: "secret", database: "blog" };

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
    const args = AbstractMysqlAdapter.dbconsole({ host: "", username: "", port: 0, socket: "" });
    expect(args).toContain("--host=");
    expect(args).toContain("--user=");
    expect(args).toContain("--port=0");
    expect(args).toContain("--socket=");
  });
});

describe("AbstractSQLite3Adapter.dbconsole option keys", () => {
  it("prepends -#{mode} and -header before the database path", () => {
    expect(
      AbstractSQLite3Adapter.dbconsole({ database: "db.sqlite3" }, { mode: "html", header: true }),
    ).toEqual(["-html", "-header", "db.sqlite3"]);
  });

  it("omits the flags when mode/header are absent", () => {
    expect(AbstractSQLite3Adapter.dbconsole({ database: "db.sqlite3" })).toEqual(["db.sqlite3"]);
  });

  it("keeps a Ruby-truthy empty-string mode", () => {
    expect(AbstractSQLite3Adapter.dbconsole({ database: "db.sqlite3" }, { mode: "" })).toEqual([
      "-",
      "db.sqlite3",
    ]);
  });
});

describe("PostgreSQLAdapter.dbconsole option keys", () => {
  const config = { username: "alice", host: "localhost", password: "secret" };

  it("sets PGPASSWORD only when includePassword is set", () => {
    expect(PostgreSQLAdapter.dbconsole(config).PGPASSWORD).toBeUndefined();
    expect(PostgreSQLAdapter.dbconsole(config, { includePassword: true }).PGPASSWORD).toBe(
      "secret",
    );
  });

  it("exports Ruby-truthy empty-string and zero config values", () => {
    const env = PostgreSQLAdapter.dbconsole({ username: "", host: "", port: 0 });
    expect(env.PGUSER).toBe("");
    expect(env.PGHOST).toBe("");
    expect(env.PGPORT).toBe("0");
  });

  it("skips a false password even when includePassword is set", () => {
    const env = PostgreSQLAdapter.dbconsole({ password: false }, { includePassword: true });
    expect(env.PGPASSWORD).toBeUndefined();
  });

  it("builds PGOPTIONS from variables, dropping only :default (not the bare string default)", () => {
    const env = PostgreSQLAdapter.dbconsole({
      variables: { statement_timeout: "5s", search_path: "default", lock_timeout: ":default" },
    });
    expect(env.PGOPTIONS).toBe("-c statement_timeout=5s -c search_path=default");
  });
});
