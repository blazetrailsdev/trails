import { describe, expect, it } from "vitest";
import {
  activeLane,
  driverConfig,
  settingsUrl,
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

  it("treats an empty sub-setting as unset rather than as an empty value", () => {
    // CI routinely sets a var to "" to mean "no value". Taking that literally
    // yields user: "" and the server answers `Access denied for user ''`.
    const settings = mysqlSettings(
      reader({ MYSQL_USER: "", MYSQL_HOST: "", MYSQL_DATABASE: "", MYSQL_SOCK: "" }),
    );
    expect(settings.user).toBe("root");
    expect(settings.host).toBe("localhost");
    expect(settings.database).toBe("rails_js_test");
    expect(settings.socket).toBeUndefined();
    expect(activeLane(reader({ ARCONN: "" }))).toBe("sqlite");
  });

  it("raises on a malformed slot rather than sharing the base database", () => {
    // Silently falling back to the base DB is the cross-worker collision the
    // slot mechanism exists to prevent, and would surface as an unrelated
    // DDL failure much later.
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
    // Rails puts MYSQL_SOCK in both mysql2.arunit and mysql2.arunit2
    // (config.example.yml:18-19,37-39), so every mysql path must preserve it.
    // mysql2's parseUrl copies query params into its options and honours
    // socketPath (connection_config.js:52,271-290) — verified against the
    // driver, which attempts the socket rather than falling back to TCP.
    const settings = mysqlSettings(reader({ MYSQL_SOCK: "/tmp/mysql.sock" }));
    expect(settingsUrl("mysql", settings)).toBe(
      "mysql://root@localhost:3306/rails_js_test?socketPath=%2Ftmp%2Fmysql.sock",
    );
  });

  it("raises for a socket on the postgres scheme, which has no socket setting", () => {
    // libpq spells a socket connection as PGHOST=/path, already carried as host.
    expect(() =>
      settingsUrl("postgres", { ...postgresSettings(reader({})), socket: "/tmp/pg.sock" }),
    ).toThrow(/PGHOST=/);
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

  it("driverConfig emits both spellings of the credential and the socket", () => {
    // Regression guard: DatabaseTasks reads Rails' `username`/`socket`, the
    // drivers read `user`/`socketPath`, and both drivers IGNORE the key they
    // don't know — so emitting one spelling connects as the OS user instead of
    // failing. Caught as `Access denied for user ''` on the MySQL
    // slot-provisioning path, which routes through DatabaseTasks.
    const config = driverConfig(
      mysqlSettings(reader({ MYSQL_USER: "u", MYSQL_PASSWORD: "p", MYSQL_SOCK: "/tmp/m.sock" })),
    );
    expect(config.username).toBe("u");
    expect(config.user).toBe("u");
    expect(config.socket).toBe("/tmp/m.sock");
    expect(config.socketPath).toBe("/tmp/m.sock");
  });

  it("driverConfig omits password and socket entirely when unset", () => {
    // `undefined` is not the same as absent to mysql2.
    const config = driverConfig(mysqlSettings(reader({})));
    expect(config).not.toHaveProperty("password");
    expect(config).not.toHaveProperty("socket");
    expect(config).not.toHaveProperty("socketPath");
  });
});
