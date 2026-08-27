import { describe, expect, it } from "vitest";
import {
  driverConfig,
  settingsUrl,
  mysqlPreparedStatements,
  mysqlSettings,
  mysqlUrl,
  ownsSlotDatabase,
  postgresSettings,
  postgresUrl,
  sqliteSiblingDatabase,
  withDatabase,
} from "./config.js";
import { activeLane, connectionName } from "./connection.js";

function reader(env: Record<string, string | undefined>): (key: string) => string | undefined {
  return (key) => env[key];
}

describe("config", () => {
  it("selects the connection named by ARCONN", () => {
    expect(connectionName(reader({ ARCONN: "mysql2" }))).toBe("mysql2");
    expect(activeLane(reader({ ARCONN: "mysql2" }))).toBe("mysql");
    expect(activeLane(reader({ ARCONN: "postgresql" }))).toBe("postgres");
    expect(activeLane(reader({ ARCONN: "sqlite3_mem" }))).toBe("sqlite");
  });

  it("falls back to the default_connection when ARCONN is unset", () => {
    expect(connectionName(reader({}))).toBe("sqlite3");
  });

  it("treats an empty ARCONN as a connection name, not as unset", () => {
    expect(connectionName(reader({ ARCONN: "" }))).toBe("");
  });

  it("never selects a backend from a connection sub-setting", () => {
    expect(activeLane(reader({ PGHOST: "db.example", MYSQL_HOST: "mysql.example" }))).toBe(
      "sqlite",
    );
  });

  it("reads Postgres details from libpq's env vars, defaulting no credential", () => {
    expect(postgresSettings(reader({}))).toEqual({
      host: "localhost",
      port: 5432,
      user: undefined,
      password: undefined,
      database: "activerecord_unittest",
    });
    expect(
      postgresSettings(
        reader({ PGHOST: "db", PGPORT: "6543", PGUSER: "u", PGPASSWORD: "p", PGDATABASE: "d" }),
      ),
    ).toEqual({
      host: "db",
      port: 6543,
      user: "u",
      password: "p",
      database: "activerecord_unittest",
    });
  });

  it("reads MySQL details from the sub-settings config.example.yml interpolates", () => {
    expect(
      mysqlSettings(
        reader({ MYSQL_HOST: "db", MYSQL_PORT: "3307", MYSQL_SOCK: "/tmp/mysql.sock" }),
      ),
    ).toEqual({
      host: "db",
      port: 3307,
      user: "rails",
      database: "activerecord_unittest",
      socket: "/tmp/mysql.sock",
    });
  });

  it("interpolates exactly the sub-setting key set config.example.yml interpolates", () => {
    const seen: string[] = [];
    const recording = (env: Record<string, string>) => (key: string) => {
      seen.push(key);
      return env[key];
    };

    mysqlSettings(recording({}));
    mysqlPreparedStatements(recording({}));
    expect(new Set(seen)).toEqual(
      new Set([
        "MYSQL_HOST",
        "MYSQL_PORT",
        "MYSQL_SOCK",
        "MYSQL_PREPARED_STATEMENTS",
        "AR_DB_SLOT",
        "AR_TEST_RUN_TOKEN",
      ]),
    );

    seen.length = 0;
    postgresSettings(recording({}));
    expect(new Set(seen)).toEqual(
      new Set(["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "AR_DB_SLOT", "AR_TEST_RUN_TOKEN"]),
    );
  });

  it("turns prepared statements on when MYSQL_PREPARED_STATEMENTS is present", () => {
    expect(mysqlPreparedStatements(reader({}))).toBe(false);
    expect(mysqlPreparedStatements(reader({ MYSQL_PREPARED_STATEMENTS: "1" }))).toBe(true);
    expect(mysqlPreparedStatements(reader({ MYSQL_PREPARED_STATEMENTS: "0" }))).toBe(true);
    expect(mysqlPreparedStatements(reader({ MYSQL_PREPARED_STATEMENTS: "" }))).toBe(true);
  });

  it("suffixes the database with the worker isolation slot above slot 1", () => {
    expect(postgresSettings(reader({ AR_DB_SLOT: "1" })).database).toBe("activerecord_unittest");
    expect(postgresSettings(reader({ AR_DB_SLOT: "4" })).database).toBe("activerecord_unittest_4");
    expect(mysqlSettings(reader({ AR_DB_SLOT: "2" })).database).toBe("activerecord_unittest_2");
  });

  it("owns the slot database on every stamped slot, slot 1 included", () => {
    const token = "aaax1";
    expect(ownsSlotDatabase(reader({ AR_DB_SLOT: "1", AR_TEST_RUN_TOKEN: token }))).toBe(true);
    expect(ownsSlotDatabase(reader({ AR_DB_SLOT: "4", AR_TEST_RUN_TOKEN: token }))).toBe(true);
    expect(ownsSlotDatabase(reader({ AR_TEST_RUN_TOKEN: token }))).toBe(true);
  });

  it("does not own the slot database on an unstamped slot 1", () => {
    expect(ownsSlotDatabase(reader({ AR_DB_SLOT: "1" }))).toBe(false);
    expect(ownsSlotDatabase(reader({}))).toBe(false);
    expect(ownsSlotDatabase(reader({ AR_DB_SLOT: "1", AR_TEST_RUN_TOKEN: "" }))).toBe(false);
    expect(ownsSlotDatabase(reader({ AR_DB_SLOT: "2" }))).toBe(true);
    expect(() => ownsSlotDatabase(reader({ AR_DB_SLOT: "0" }))).toThrow(/must be >= 1/);
  });

  it("stamps the run token into the database name, slot 1 included", () => {
    const stamped = (slot: string) =>
      postgresSettings(reader({ AR_DB_SLOT: slot, AR_TEST_RUN_TOKEN: "aaax1" })).database;
    expect(stamped("1")).toBe("activerecord_unittest_aaax1_1");
    expect(stamped("4")).toBe("activerecord_unittest_aaax1_4");
    expect(mysqlSettings(reader({ AR_DB_SLOT: "2", AR_TEST_RUN_TOKEN: "bbbx2" })).database).toBe(
      "activerecord_unittest_bbbx2_2",
    );
  });

  it("treats an empty sub-setting as unset rather than as an empty value", () => {
    const settings = mysqlSettings(reader({ MYSQL_HOST: "", MYSQL_SOCK: "" }));
    expect(settings.host).toBe("localhost");
    expect(settings.socket).toBeUndefined();
    expect(postgresSettings(reader({ PGUSER: "", PGPASSWORD: "" })).user).toBeUndefined();
  });

  it("raises on a malformed slot rather than sharing the base database", () => {
    expect(() => postgresSettings(reader({ AR_DB_SLOT: "abc" }))).toThrow(/must be an integer/);
    expect(() => postgresSettings(reader({ AR_DB_SLOT: "0" }))).toThrow(/must be >= 1/);
  });

  it("raises on a non-integer port rather than passing NaN to the driver", () => {
    expect(() => postgresSettings(reader({ PGPORT: "abc" }))).toThrow(/PGPORT must be an integer/);
    expect(() => mysqlSettings(reader({ MYSQL_PORT: "3306.5" }))).toThrow(
      /MYSQL_PORT must be an integer/,
    );
  });

  it("carries MYSQL_SOCK through a rendered URL as socketPath", () => {
    const settings = mysqlSettings(reader({ MYSQL_SOCK: "/tmp/mysql.sock" }));
    expect(settingsUrl("mysql", settings)).toBe(
      "mysql://rails@localhost:3306/activerecord_unittest?socketPath=%2Ftmp%2Fmysql.sock",
    );
  });

  it("spells a socket-directory PGHOST the way libpq does", () => {
    const settings = postgresSettings(reader({ PGHOST: "/var/run/postgresql" }));
    expect(settingsUrl("postgres", settings)).toBe(
      "postgres:///activerecord_unittest?host=%2Fvar%2Frun%2Fpostgresql&port=5432",
    );
  });

  it("raises for a socket field on the postgres scheme", () => {
    expect(() =>
      settingsUrl("postgres", { ...postgresSettings(reader({})), socket: "/tmp/pg.sock" }),
    ).toThrow(/PGHOST=/);
  });

  it("renders settings as a URL, encoding credentials", () => {
    expect(mysqlUrl(reader({}))).toBe("mysql://rails@localhost:3306/activerecord_unittest");
    expect(postgresUrl(reader({ PGUSER: "u", PGPASSWORD: "p@ss word" }))).toBe(
      "postgres://u:p%40ss%20word@localhost:5432/activerecord_unittest",
    );
    expect(postgresUrl(reader({}))).toBe("postgres://localhost:5432/activerecord_unittest");
  });

  it("withDatabase repoints settings at another database on the same server", () => {
    const settings = mysqlSettings(reader({ MYSQL_HOST: "db" }));
    expect(withDatabase(settings, "other")).toEqual({ ...settings, database: "other" });
  });

  it("driverConfig emits Rails' username and socket spellings only", () => {
    const config = driverConfig(mysqlSettings(reader({ MYSQL_SOCK: "/tmp/m.sock" })));
    expect(config.username).toBe("rails");
    expect(config).not.toHaveProperty("user");
    expect(config.socket).toBe("/tmp/m.sock");
    expect(config).not.toHaveProperty("socketPath");
  });

  it("driverConfig omits password and socket entirely when unset", () => {
    const config = driverConfig(mysqlSettings(reader({})));
    expect(config).not.toHaveProperty("password");
    expect(config).not.toHaveProperty("socket");
    expect(config).not.toHaveProperty("socketPath");
  });

  it("sqliteSiblingDatabase puts _2 before the extension, as config.example.yml spells it", () => {
    expect(sqliteSiblingDatabase("db/fixture_database.sqlite3")).toBe(
      "db/fixture_database_2.sqlite3",
    );
    expect(sqliteSiblingDatabase("/tmp/ar-test-worker-abc-1.sqlite")).toBe(
      "/tmp/ar-test-worker-abc-1_2.sqlite",
    );
  });

  it("sqliteSiblingDatabase appends _2 when the name carries no extension", () => {
    expect(sqliteSiblingDatabase("/tmp/ar-test-worker-abc-1")).toBe("/tmp/ar-test-worker-abc-1_2");
    expect(sqliteSiblingDatabase("/tmp/.hidden")).toBe("/tmp/.hidden_2");
  });
});
