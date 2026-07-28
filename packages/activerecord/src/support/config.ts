/**
 * The test harness' configuration, mirroring
 * `vendor/rails/activerecord/test/support/config.rb` — Rails' `ARTest.config`,
 * i.e. the parsed `test/config.yml` (whose shape is
 * `vendor/rails/activerecord/test/config.example.yml`).
 *
 * Rails reads a YAML file off disk; trails has no `config.yml` to read, so the
 * `connections:` hash is expressed directly here as `DEFAULT_CONNECTION` /
 * `CONNECTION_LANES` plus the sub-setting readers below, and the named-entry
 * builders live in `connection.ts` next to the code that fetches them. There is
 * therefore no `configFile` / `readConfig` pair to port: those are the file IO
 * `ARTest.config` memoizes, and with no file there is nothing to read or copy
 * from `config.example.yml`. The `test/config.rb` path constants (`TEST_ROOT`,
 * `FIXTURES_ROOT`, `SCHEMA_ROOT`, …) are likewise absent — nothing in trails
 * resolves fixtures or schema by path from a test root; `test-helpers/` is
 * imported as modules.
 *
 * Rails splits the two concerns this module keeps apart:
 *
 *   - **Which backend runs** is chosen by `ARCONN`, naming a key of the
 *     `connections:` hash (`test/support/connection.rb:10,14-19`). Nothing
 *     else selects a backend — there is no "is this env var set?" sniffing.
 *   - **How to reach it** comes from the connection entry itself, over which
 *     Rails interpolates exactly four env vars: `MYSQL_HOST` / `MYSQL_PORT` /
 *     `MYSQL_SOCK` (`config.example.yml:12-20`) and
 *     `MYSQL_PREPARED_STATEMENTS` (`config.example.yml:7-11,26-30`), the last
 *     of which selects a value rather than supplying one — see
 *     {@link mysqlPreparedStatements}. The postgresql entries carry
 *     no connection fields at all (`config.example.yml:74-81`), leaving libpq
 *     to resolve `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` itself.
 *
 * ## Credentials and database names: converged with `config.example.yml`
 *
 * Both come straight from Rails, not from the environment:
 *
 *   - `username: rails`, no password, on `mysql2.arunit` and `mysql2.arunit2`
 *     (`config.example.yml:4,24`) — see {@link MYSQL_USERNAME}. The user is
 *     provisioned the way `db:mysql:build_user` provisions it
 *     (`activerecord/Rakefile:227-235`): `CREATE USER` with no `IDENTIFIED BY`,
 *     then `GRANT ALL PRIVILEGES`, done here by the container init scripts in
 *     `.github/workflows/ci.yml` and `docker-compose.yml`.
 *   - `database: activerecord_unittest`, which `ARTest.expand_config` fills in
 *     for every entry that carries none (`test/support/config.rb:28-34`) — see
 *     {@link ARUNIT_DATABASE}.
 *   - The postgresql lane hard-codes no credential, exactly as Rails' entries
 *     do not: `PGUSER` / `PGPASSWORD` stay unset unless the environment carries
 *     them, and `pg` then resolves libpq's defaults.
 *
 * `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` / `PGDATABASE` are
 * therefore NOT read — Rails interpolates none of them, and an entry's own
 * `database` beats libpq's env in Rails too. The exact key set each lane reads
 * is pinned by a test (`config.test.ts`, "interpolates exactly the sub-setting
 * key set config.example.yml interpolates"), so re-widening it has to be a
 * decision rather than a drift.
 *
 * The one addition with no Rails counterpart is {@link SLOT_ENV}: Rails runs
 * one database, trails runs parallel vitest workers and gives each its own
 * `_N`-suffixed copy of it.
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
 * Read an env var, treating an empty value as absent.
 *
 * CI routinely sets a variable to `""` to mean "no value" (an empty password,
 * an unused socket path), and `??` alone would take that literally — an empty
 * `MYSQL_USER` becomes `user: ""` and the server answers
 * `Access denied for user ''`. This matches the convention already used by
 * `MySQLDatabaseTasks#resolvedField`, which likewise rejects `""`.
 */
function present(read: EnvReader, key: string): string | undefined {
  const value = read(key);
  return value === undefined || value === "" ? undefined : value;
}

/** Parse an integer sub-setting, failing loudly rather than yielding NaN. */
function intSetting(read: EnvReader, key: string, fallback: number): number {
  const raw = present(read, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    // Test-helper invariant with no Rails error counterpart — a bare Error is intentional.
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(`${key} must be an integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

/** Connection details for a server-backed lane, assembled from sub-settings. */
export interface ServerSettings {
  host: string;
  port: number;
  /** Absent on the postgresql lane unless `PGUSER` is set — Rails' entries carry none. */
  user?: string;
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
  // A malformed slot must never silently degrade to the shared base database —
  // that is precisely the cross-worker collision slots exist to prevent, and it
  // would surface later as an unrelated DDL or fixture failure.
  const slot = intSetting(read, SLOT_ENV, 1);
  if (slot < 1) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(`${SLOT_ENV} must be >= 1, got ${slot}`);
  }
  return slot > 1 ? `${database}_${slot}` : database;
}

/**
 * The `arunit` database name `ARTest.expand_config` fills in when a connection
 * entry carries none — which is every mysql2 and postgresql entry
 * (`test/support/config.rb:28-31`, `config.example.yml:2-40,74-81`).
 */
export const ARUNIT_DATABASE = "activerecord_unittest";

/**
 * The credential `config.example.yml` hard-codes on both `mysql2.arunit` and
 * `mysql2.arunit2` (`config.example.yml:4,24`), provisioned by
 * `db:mysql:build_user` (`activerecord/Rakefile:227-235`) — `CREATE USER`, no
 * `IDENTIFIED BY`, hence no password.
 */
export const MYSQL_USERNAME = "rails";

/**
 * PostgreSQL connection details.
 *
 * Rails' `postgresql:` entries carry no connection fields at all
 * (`config.example.yml:74-81`) — no host, port, or credential — so libpq
 * resolves them from its own `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD`.
 * Reading those here is that same deferral, not an interpolation of trails'
 * own: they are the driver's env contract. `user` and `password` are left
 * unset when the environment carries none, so `pg` applies libpq's defaults
 * exactly as it would for Rails.
 *
 * The database is NOT read from `PGDATABASE`: `expand_config` fills the entry's
 * `database` in (`support/config.rb:31-34`), and an explicit config value beats
 * libpq's env in Rails too.
 */
export function postgresSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: present(read, "PGHOST") ?? "localhost",
    port: intSetting(read, "PGPORT", 5432),
    user: present(read, "PGUSER"),
    password: present(read, "PGPASSWORD"),
    database: applySlot(ARUNIT_DATABASE, read),
  };
}

/**
 * MySQL/MariaDB connection details.
 *
 * Exactly the three connection keys Rails interpolates — `MYSQL_HOST` /
 * `MYSQL_PORT` / `MYSQL_SOCK` (`config.example.yml:12-20`) — over the hard-coded
 * `username: rails` (`config.example.yml:4,24`) and the `expand_config`
 * database. The credential is not env-driven because Rails' is not.
 */
export function mysqlSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: present(read, "MYSQL_HOST") ?? "localhost",
    port: intSetting(read, "MYSQL_PORT", 3306),
    user: MYSQL_USERNAME,
    database: applySlot(ARUNIT_DATABASE, read),
    socket: present(read, "MYSQL_SOCK"),
  };
}

/**
 * The mysql2 `prepared_statements` value for the `arunit` / `arunit2` entries:
 * `true` when `MYSQL_PREPARED_STATEMENTS` is set, `false` otherwise
 * (`config.example.yml:7-11,26-30`).
 *
 * Presence, not truthiness, and deliberately not routed through the
 * empty-string rejection the other sub-settings use: Rails tests the variable
 * with a bare `if`, under which `""` and `"0"` are both truthy, so
 * `MYSQL_PREPARED_STATEMENTS=` turns prepared statements ON there and must here
 * too. `arunit_without_prepared_statements` is unaffected — that entry exists
 * to be the one with them off (`config.rb:27-28`).
 */
export function mysqlPreparedStatements(read: EnvReader = getEnv): boolean {
  return read("MYSQL_PREPARED_STATEMENTS") !== undefined;
}

/**
 * Translate {@link ServerSettings} into the key set a `configuration_hash` /
 * driver options object needs.
 *
 * The credential is Rails' canonical `username` alone (as `database.yml` spells
 * it): `MySQLDatabaseTasks#buildAdapterConfig` / `PostgreSQLDatabaseTasks` read
 * it directly, and `Mysql2Adapter` / `PostgreSQLAdapter` map it to the
 * driver-native `user` when building their driver config.
 *
 * The socket is likewise Rails' canonical `socket` alone: `Mysql2Adapter` maps
 * it to mysql2's `socketPath` when building its driver config.
 *
 * `password` and `socket` are omitted when unset so the drivers apply
 * their own defaults — a literal `undefined` is not the same as absent.
 */
export function driverConfig(settings: ServerSettings): Record<string, unknown> {
  const { host, port, user, password, database, socket } = settings;
  return {
    host,
    port,
    database,
    ...(user === undefined ? {} : { username: user }),
    ...(password === undefined ? {} : { password }),
    ...(socket === undefined ? {} : { socket }),
  };
}

/** A copy of `settings` pointed at a different database on the same server. */
export function withDatabase(settings: ServerSettings, database: string): ServerSettings {
  return { ...settings, database };
}

function credentials({ user, password }: ServerSettings): string {
  // No user at all is libpq's own default path (Rails' postgresql: entries carry
  // no credential): the URL must then carry no authority userinfo either, or the
  // driver sees an empty username instead of resolving the OS user.
  if (user === undefined) return "";
  const auth = encodeURIComponent(user);
  return password ? `${auth}:${encodeURIComponent(password)}@` : `${auth}@`;
}

/**
 * Render `settings` as a connection URL.
 *
 * URLs are a *serialization* of the sub-settings, never a source of them: the
 * `pg` and `mysql2` drivers (and the CLI's `--database-url`) both accept one,
 * so this keeps a single formatting site instead of hand-built strings.
 *
 * A `MYSQL_SOCK` connection survives the round trip: mysql2's `parseUrl` copies
 * every query parameter into its options hash and `socketPath` is one of its
 * recognised keys (`mysql2/lib/connection_config.js:52,271-290`), so the socket
 * is emitted as `?socketPath=`. Verified against the driver — with a socket in
 * the query it attempts the socket and fails `ENOENT` rather than silently
 * falling back to TCP. This matters because Rails carries `MYSQL_SOCK` into
 * both `mysql2.arunit` and `mysql2.arunit2` (`config.example.yml:18-19,37-39`),
 * so every mysql path here has to preserve it.
 *
 * Postgres has no socket *sub-setting* because libpq spells a socket connection
 * as a directory in `PGHOST` (`/var/run/postgresql`) — Rails' `postgresql:`
 * entries carry no host fields at all and lean on that env
 * (`config.example.yml:74-81`). A directory cannot go in the URL authority: it
 * yields `postgres://user@/var/run/postgresql:5432/db`, which `pg` misreads as
 * a hostname and reports as a confusing authentication failure rather than a
 * parse error. libpq's own spelling for this is an empty authority plus a
 * `host=` parameter, so a socket-directory `PGHOST` is emitted as
 * `postgres://user:pass@/database?host=/dir&port=N` — verified against a real
 * PostgreSQL socket.
 */
export function settingsUrl(scheme: "postgres" | "mysql", settings: ServerSettings): string {
  const { host, port, database, socket } = settings;
  const auth = credentials(settings);

  if (scheme === "postgres") {
    // libpq treats a leading "/" in PGHOST as a socket directory, not a host.
    if (host.startsWith("/")) {
      const params = new URLSearchParams({ host, port: String(port) });
      return `postgres://${auth}/${database}?${params.toString()}`;
    }
    if (socket !== undefined) {
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new Error(
        `Postgres has no socket sub-setting; spell a socket connection as ` +
          `PGHOST=${socket} so libpq resolves it as a socket directory.`,
      );
    }
    return `postgres://${auth}${host}:${port}/${database}`;
  }

  const base = `mysql://${auth}${host}:${port}/${database}`;
  return socket === undefined ? base : `${base}?socketPath=${encodeURIComponent(socket)}`;
}

/** The primary PostgreSQL URL for the active worker. */
export function postgresUrl(read: EnvReader = getEnv): string {
  return settingsUrl("postgres", postgresSettings(read));
}

/** The primary MySQL URL for the active worker. */
export function mysqlUrl(read: EnvReader = getEnv): string {
  return settingsUrl("mysql", mysqlSettings(read));
}
