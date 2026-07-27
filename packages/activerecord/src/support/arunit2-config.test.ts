import { describe, expect, it } from "vitest";
import {
  arunitDatabaseNames,
  databaseName,
  resolveSecondDatabaseConfig,
} from "./arunit2-config.js";

/** A stub env reader backed by a fixed map (no ambient env mutation). */
function reader(env: Record<string, string | undefined>): (key: string) => string | undefined {
  return (key) => env[key];
}

describe("arunit2-config", () => {
  it("databaseName strips the leading slash from the URL path", () => {
    expect(databaseName("mysql://root@localhost:3306/rails_js_test")).toBe("rails_js_test");
    expect(databaseName("postgres://localhost/ar_test")).toBe("ar_test");
  });

  it("arunitDatabaseNames suffixes the primary database name", () => {
    expect(arunitDatabaseNames("rails_js_test")).toEqual({
      arunit: "rails_js_test_arunit",
      arunit2: "rails_js_test_arunit2",
    });
  });

  it("resolves Postgres when ARCONN names the postgresql connection", () => {
    expect(
      resolveSecondDatabaseConfig(
        reader({ ARCONN: "postgresql", PGHOST: "db.example", PGDATABASE: "ar_test" }),
      ),
    ).toEqual({
      adapter: "postgres",
      config: "postgres://postgres@db.example:5432/ar_test_arunit2",
    });
  });

  it("resolves MySQL when ARCONN names the mysql2 connection", () => {
    expect(resolveSecondDatabaseConfig(reader({ ARCONN: "mysql2" }))).toEqual({
      adapter: "mysql",
      config: "mysql://root@localhost:3306/rails_js_test_arunit2",
    });
  });

  it("carries MYSQL_SOCK into the arunit2 connection", () => {
    // Rails puts the socket in mysql2.arunit2 as well as mysql2.arunit
    // (config.example.yml:37-39) before ARUnit2Model.establish_connection
    // :arunit2 (connection.rb:33), so the second database must reach the
    // socket too — not just the primary.
    expect(
      resolveSecondDatabaseConfig(reader({ ARCONN: "mysql2", MYSQL_SOCK: "/tmp/m.sock" })).config,
    ).toBe("mysql://root@localhost:3306/rails_js_test_arunit2?socketPath=%2Ftmp%2Fm.sock");
  });

  it("carries the worker isolation slot into the arunit2 database name", () => {
    expect(resolveSecondDatabaseConfig(reader({ ARCONN: "mysql2", AR_DB_SLOT: "3" })).config).toBe(
      "mysql://root@localhost:3306/rails_js_test_3_arunit2",
    );
  });

  it("ignores connection sub-settings when ARCONN does not select that backend", () => {
    // The whole point of the ARCONN split: a PG host in the environment must
    // not drag the second database onto Postgres.
    expect(
      resolveSecondDatabaseConfig(reader({ PGHOST: "db.example", MYSQL_HOST: "mysql.example" }))
        .adapter,
    ).toBe("sqlite");
  });

  it("falls back to a separate in-memory SQLite pool when ARCONN is unset", () => {
    expect(resolveSecondDatabaseConfig(reader({}))).toEqual({
      adapter: "sqlite",
      config: { adapter: "sqlite3", database: ":memory:", pool: 1 },
    });
  });
});
