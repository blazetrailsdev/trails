import { describe, expect, it } from "vitest";
import {
  activeLane,
  connectionName,
  mysqlSettings,
  mysqlUrl,
  postgresSettings,
  postgresUrl,
  withDatabase,
} from "./test-connection-env.js";

/** A stub env reader backed by a fixed map (no ambient env mutation). */
function reader(env: Record<string, string | undefined>): (key: string) => string | undefined {
  return (key) => env[key];
}

describe("test-connection-env", () => {
  it("selects the connection named by ARCONN", () => {
    expect(connectionName(reader({ ARCONN: "mysql2" }))).toBe("mysql2");
    expect(activeLane(reader({ ARCONN: "mysql2" }))).toBe("mysql");
    expect(activeLane(reader({ ARCONN: "postgresql" }))).toBe("postgres");
    expect(activeLane(reader({ ARCONN: "sqlite3_mem" }))).toBe("sqlite");
  });

  it("falls back to the default_connection when ARCONN is unset or empty", () => {
    expect(connectionName(reader({}))).toBe("sqlite3");
    expect(activeLane(reader({ ARCONN: "" }))).toBe("sqlite");
  });

  it("never selects a backend from a connection sub-setting", () => {
    // The regression this whole module exists to prevent: connection details
    // present in the environment must not switch the lane on their own.
    expect(activeLane(reader({ PGHOST: "db.example", MYSQL_HOST: "mysql.example" }))).toBe(
      "sqlite",
    );
  });

  it("reads Postgres details from libpq's env vars, with defaults", () => {
    expect(postgresSettings(reader({}))).toEqual({
      host: "localhost",
      port: 5432,
      user: "postgres",
      password: undefined,
      database: "rails_js_test",
    });
    expect(
      postgresSettings(
        reader({ PGHOST: "db", PGPORT: "6543", PGUSER: "u", PGPASSWORD: "p", PGDATABASE: "d" }),
      ),
    ).toEqual({ host: "db", port: 6543, user: "u", password: "p", database: "d" });
  });

  it("reads MySQL details from the sub-settings config.example.yml interpolates", () => {
    expect(
      mysqlSettings(
        reader({ MYSQL_HOST: "db", MYSQL_PORT: "3307", MYSQL_SOCK: "/tmp/mysql.sock" }),
      ),
    ).toEqual({
      host: "db",
      port: 3307,
      user: "root",
      password: undefined,
      database: "rails_js_test",
      socket: "/tmp/mysql.sock",
    });
  });

  it("suffixes the database with the worker isolation slot above slot 1", () => {
    expect(postgresSettings(reader({ AR_DB_SLOT: "1" })).database).toBe("rails_js_test");
    expect(postgresSettings(reader({ AR_DB_SLOT: "4" })).database).toBe("rails_js_test_4");
    expect(mysqlSettings(reader({ AR_DB_SLOT: "2" })).database).toBe("rails_js_test_2");
  });

  it("renders settings as a URL, encoding credentials", () => {
    expect(mysqlUrl(reader({}))).toBe("mysql://root@localhost:3306/rails_js_test");
    expect(postgresUrl(reader({ PGPASSWORD: "p@ss word" }))).toBe(
      "postgres://postgres:p%40ss%20word@localhost:5432/rails_js_test",
    );
  });

  it("withDatabase repoints settings at another database on the same server", () => {
    const settings = mysqlSettings(reader({ MYSQL_HOST: "db" }));
    expect(withDatabase(settings, "other")).toEqual({ ...settings, database: "other" });
  });
});
