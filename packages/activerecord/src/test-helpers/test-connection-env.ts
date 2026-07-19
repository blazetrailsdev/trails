/**
 * The environment surface of the test harness, mirroring
 * `vendor/rails/activerecord/test/config.example.yml`.
 *
 * Rails splits the two concerns this module keeps apart:
 *
 *   - **Which backend runs** is chosen by `ARCONN`, naming a key of the
 *     `connections:` hash (`test/support/connection.rb:10,14-19`). Nothing
 *     else selects a backend — there is no "is this env var set?" sniffing.
 *   - **How to reach it** comes from discrete sub-setting env vars interpolated
 *     into that connection's entry: `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_SOCK`
 *     for the mysql2 lane, and libpq's `PGHOST` / `PGPORT` / `PGUSER` /
 *     `PGPASSWORD` / `PGDATABASE` for the postgresql lane (Rails' `postgresql:`
 *     entries carry no host at all, deferring to libpq's own env).
 *
 * trails previously collapsed both into a single `PG_TEST_URL` /
 * `MYSQL_TEST_URL` URL string, which made backend selection a side effect of
 * a connection detail being present. This module is the replacement: `ARCONN`
 * selects, sub-settings describe.
 *
 * Hard rules (RFC 0023): no `node:*` imports, no `process.*` — environment
 * reads go through activesupport's `getEnv`; async fs only (none needed here).
 *
 * @internal
 */

import { getEnv } from "@blazetrails/activesupport";

/** The public backend lane a named connection drives. */
export type TestAdapterName = "sqlite" | "postgres" | "mysql";

/** A key of the `connections:` hash in `config.example.yml`. */
export type ConnectionName = "sqlite3" | "sqlite3_mem" | "postgresql" | "mysql2";

/** Rails' `config["default_connection"]` (`connection.rb:10`). */
export const DEFAULT_CONNECTION: ConnectionName = "sqlite3";

/** Every connection name the harness knows, and the lane each drives. */
export const CONNECTION_LANES: Record<ConnectionName, TestAdapterName> = {
  sqlite3: "sqlite",
  sqlite3_mem: "sqlite",
  postgresql: "postgres",
  mysql2: "mysql",
};

/** A reader over the environment; injectable so tests need not mutate ambient env. */
export type EnvReader = (key: string) => string | undefined;

/**
 * The connection name selected by `ARCONN`, falling back to
 * {@link DEFAULT_CONNECTION}. Mirrors `connection.rb:10`. The name is returned
 * unvalidated — `test-database-config.ts` owns Rails' "Connection not found"
 * failure so the error surfaces once, at config-build time.
 */
export function connectionName(read: EnvReader = getEnv): ConnectionName {
  return (read("ARCONN") || DEFAULT_CONNECTION) as ConnectionName;
}

/**
 * The backend lane the current `ARCONN` drives. Unknown names resolve to the
 * default connection's lane; the loud failure for those belongs to
 * `test-database-config.ts`, not to every lane predicate in the harness.
 */
export function activeLane(read: EnvReader = getEnv): TestAdapterName {
  return CONNECTION_LANES[connectionName(read)] ?? CONNECTION_LANES[DEFAULT_CONNECTION];
}

/** Connection details for a server-backed lane, assembled from sub-settings. */
export interface ServerSettings {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  /** Unix socket path (`MYSQL_SOCK`); mysql2 prefers it over host/port when set. */
  socket?: string;
}

/**
 * Per-worker database isolation slot, published by `test-setup-worker-db.ts`
 * after it wins an advisory lock. Slot 1 (or unset) is the shared base
 * database; higher slots get a `_N`-suffixed database of their own.
 *
 * Applying the suffix here — rather than rewriting a URL env var in place —
 * means every consumer derives the same worker database from one signal,
 * instead of racing to read a mutated string.
 */
export const SLOT_ENV = "AR_DB_SLOT";

function applySlot(database: string, read: EnvReader): string {
  const slot = parseInt(read(SLOT_ENV) ?? "1", 10);
  return Number.isFinite(slot) && slot > 1 ? `${database}_${slot}` : database;
}

/**
 * PostgreSQL connection details from libpq's standard env vars, exactly the
 * ones Rails' `postgresql:` entries rely on by carrying no host of their own.
 */
export function postgresSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: read("PGHOST") ?? "localhost",
    port: parseInt(read("PGPORT") ?? "5432", 10),
    user: read("PGUSER") ?? "postgres",
    password: read("PGPASSWORD"),
    database: applySlot(read("PGDATABASE") ?? "rails_js_test", read),
  };
}

/**
 * MySQL/MariaDB connection details from the sub-settings `config.example.yml`
 * interpolates (`MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_SOCK`) plus credentials.
 */
export function mysqlSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: read("MYSQL_HOST") ?? "localhost",
    port: parseInt(read("MYSQL_PORT") ?? "3306", 10),
    user: read("MYSQL_USER") ?? "root",
    password: read("MYSQL_PASSWORD"),
    database: applySlot(read("MYSQL_DATABASE") ?? "rails_js_test", read),
    socket: read("MYSQL_SOCK"),
  };
}

/** A copy of `settings` pointed at a different database on the same server. */
export function withDatabase(settings: ServerSettings, database: string): ServerSettings {
  return { ...settings, database };
}

function credentials({ user, password }: ServerSettings): string {
  const auth = encodeURIComponent(user);
  return password ? `${auth}:${encodeURIComponent(password)}@` : `${auth}@`;
}

/**
 * Render `settings` as a connection URL.
 *
 * URLs are a *serialization* of the sub-settings, never a source of them: the
 * `pg` and `mysql2` drivers (and the CLI's `--database-url`) both accept one,
 * so this keeps a single formatting site instead of hand-built strings.
 */
export function settingsUrl(scheme: "postgres" | "mysql", settings: ServerSettings): string {
  const { host, port, database } = settings;
  return `${scheme}://${credentials(settings)}${host}:${port}/${database}`;
}

/** The primary PostgreSQL URL for the active worker. */
export function postgresUrl(read: EnvReader = getEnv): string {
  return settingsUrl("postgres", postgresSettings(read));
}

/** The primary MySQL URL for the active worker. */
export function mysqlUrl(read: EnvReader = getEnv): string {
  return settingsUrl("mysql", mysqlSettings(read));
}
