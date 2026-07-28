import { describe, expect, it } from "vitest";
import {
  driverConfig,
  settingsUrl,
  mysqlPreparedStatements,
  mysqlSettings,
  mysqlUrl,
  postgresSettings,
  postgresUrl,
  withDatabase,
} from "./config.js";
import { activeLane, connectionName } from "./connection.js";

/** A stub env reader backed by a fixed map (no ambient env mutation). */
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
    // Ruby's `ENV["ARCONN"] || config["default_connection"]` falls back on nil
    // alone, so "" is a selected name and takes the unknown-name path.
    expect(connectionName(reader({ ARCONN: "" }))).toBe("");
  });

  it("never selects a backend from a connection sub-setting", () => {
    // The regression this whole module exists to prevent: connection details
    // present in the environment must not switch the lane on their own.
    expect(activeLane(reader({ PGHOST: "db.example", MYSQL_HOST: "mysql.example" }))).toBe(
      "sqlite",
    );
  });

  it("reads Postgres details from libpq's env vars, defaulting no credential", () => {
    // Rails' postgresql: entries carry no connection fields at all
    // (config.example.yml:74-81), so there is no credential to default: an
    // unset PGUSER stays unset and pg resolves libpq's own default. The
    // database comes from expand_config (support/config.rb:28-34), not from
    // PGDATABASE — an entry's own database beats libpq's env in Rails too.
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
      // config.example.yml:4,24 hard-code `username: rails` with no password.
      user: "rails",
      database: "activerecord_unittest",
      socket: "/tmp/mysql.sock",
    });
  });

  it("interpolates exactly the sub-setting key set config.example.yml interpolates", () => {
    // Rails interpolates only MYSQL_HOST/MYSQL_PORT/MYSQL_SOCK
    // (config.example.yml:12-20) plus MYSQL_PREPARED_STATEMENTS
    // (config.example.yml:7-11,26-30) and hard-codes the credential and database;
    // its postgresql: entries carry no fields so libpq reads PG* itself
    // (config.example.yml:74-81). AR_DB_SLOT is the one trails addition — the
    // per-worker database copy Rails has no analogue for. Re-widening this set
    // is a decision, not a detail.
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
      ]),
    );

    seen.length = 0;
    postgresSettings(recording({}));
    expect(new Set(seen)).toEqual(
      new Set(["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "AR_DB_SLOT"]),
    );
  });

  it("turns prepared statements on when MYSQL_PREPARED_STATEMENTS is present", () => {
    // config.example.yml:7-11,26-30 tests the var with a bare `if`, so any
    // value at all — including "" and "0" — turns prepared statements on.
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

  it("treats an empty sub-setting as unset rather than as an empty value", () => {
    // CI routinely sets a var to "" to mean "no value". Taking that literally
    // yields host: "" / user: "" and the server answers `Access denied for
    // user ''`.
    const settings = mysqlSettings(reader({ MYSQL_HOST: "", MYSQL_SOCK: "" }));
    expect(settings.host).toBe("localhost");
    expect(settings.socket).toBeUndefined();
    expect(postgresSettings(reader({ PGUSER: "", PGPASSWORD: "" })).user).toBeUndefined();
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
      "mysql://rails@localhost:3306/activerecord_unittest?socketPath=%2Ftmp%2Fmysql.sock",
    );
  });

  it("spells a socket-directory PGHOST the way libpq does", () => {
    // Rails' postgresql: entries carry no host and lean on libpq's PG* env
    // (config.example.yml:74-81), where a leading "/" in PGHOST means a socket
    // DIRECTORY. Putting that in the URL authority yields
    // postgres://user@/var/run/postgresql:5432/db, which pg misreads as a
    // hostname and reports as an authentication failure — verified against a
    // real socket, as was the empty-authority + host= form emitted here.
    const settings = postgresSettings(reader({ PGHOST: "/var/run/postgresql" }));
    expect(settingsUrl("postgres", settings)).toBe(
      "postgres:///activerecord_unittest?host=%2Fvar%2Frun%2Fpostgresql&port=5432",
    );
  });

  it("raises for a socket field on the postgres scheme", () => {
    // Postgres has no socket sub-setting; PGHOST carries it (see above).
    expect(() =>
      settingsUrl("postgres", { ...postgresSettings(reader({})), socket: "/tmp/pg.sock" }),
    ).toThrow(/PGHOST=/);
  });

  it("renders settings as a URL, encoding credentials", () => {
    expect(mysqlUrl(reader({}))).toBe("mysql://rails@localhost:3306/activerecord_unittest");
    expect(postgresUrl(reader({ PGUSER: "u", PGPASSWORD: "p@ss word" }))).toBe(
      "postgres://u:p%40ss%20word@localhost:5432/activerecord_unittest",
    );
    // No PGUSER means no userinfo at all, so pg resolves libpq's default user
    // rather than seeing an empty username.
    expect(postgresUrl(reader({}))).toBe("postgres://localhost:5432/activerecord_unittest");
  });

  it("withDatabase repoints settings at another database on the same server", () => {
    const settings = mysqlSettings(reader({ MYSQL_HOST: "db" }));
    expect(withDatabase(settings, "other")).toEqual({ ...settings, database: "other" });
  });

  it("driverConfig emits Rails' username and socket spellings only", () => {
    // Both keys are Rails' canonical spelling — the adapters map them to the
    // driver-native `user` / `socketPath`.
    const config = driverConfig(mysqlSettings(reader({ MYSQL_SOCK: "/tmp/m.sock" })));
    expect(config.username).toBe("rails");
    expect(config).not.toHaveProperty("user");
    expect(config.socket).toBe("/tmp/m.sock");
    expect(config).not.toHaveProperty("socketPath");
  });

  it("driverConfig omits password and socket entirely when unset", () => {
    // `undefined` is not the same as absent to mysql2.
    const config = driverConfig(mysqlSettings(reader({})));
    expect(config).not.toHaveProperty("password");
    expect(config).not.toHaveProperty("socket");
    expect(config).not.toHaveProperty("socketPath");
  });
});
