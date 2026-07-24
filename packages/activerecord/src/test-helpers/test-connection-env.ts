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
 * ## Deviations from `config.example.yml` (deliberate, not parity)
 *
 * Rails interpolates ONLY `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_SOCK` from the
 * environment and hard-codes the rest — notably `username: rails` on both
 * `mysql2.arunit` and `mysql2.arunit2` (`config.example.yml:4,24`), because
 * Rails' own CI provisions a `rails` user.
 *
 * trails makes the credential and database name env-driven too
 * (`MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`, and the `PG*` set), and
 * defaults them to `root` / `postgres` / `rails_js_test` — the users and
 * database the containers in `.github/workflows/ci.yml` actually provision.
 * Hard-coding Rails' `rails` user would not authenticate against them.
 *
 * So: the ARCONN-selects / sub-settings-describe *split* is Rails parity; the
 * particular set of interpolated keys and their defaults is a trails choice.
 * Anything relying on Rails' literal credential must set `MYSQL_USER` itself.
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

/**
 * The connection name selected by `ARCONN`, falling back to
 * {@link DEFAULT_CONNECTION}. Mirrors `connection.rb:10`.
 *
 * Returns a bare `string`, not a {@link ConnectionName}: `ARCONN` is arbitrary
 * user input, and asserting it into the union here would be a type lie that
 * makes the unknown-name branch look unreachable to every caller.
 * `test-database-config.ts` owns Rails' "Connection not found" failure, so the
 * error surfaces once, at config-build time.
 */
export function connectionName(read: EnvReader = getEnv): string {
  return present(read, "ARCONN") ?? DEFAULT_CONNECTION;
}

/**
 * The backend lane the current `ARCONN` drives. Unknown names resolve to the
 * default connection's lane; the loud failure for those belongs to
 * `test-database-config.ts`, not to every lane predicate in the harness.
 */
export function activeLane(read: EnvReader = getEnv): TestAdapterName {
  const lanes: Partial<Record<string, TestAdapterName>> = CONNECTION_LANES;
  return lanes[connectionName(read)] ?? CONNECTION_LANES[DEFAULT_CONNECTION];
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
 * PostgreSQL connection details from libpq's standard env vars — the ones
 * Rails' `postgresql:` entries rely on by carrying no host of their own. The
 * defaults (`postgres` / `rails_js_test`) are a trails choice matching what CI
 * provisions; see the deviations note in the module doc.
 */
export function postgresSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: present(read, "PGHOST") ?? "localhost",
    port: intSetting(read, "PGPORT", 5432),
    user: present(read, "PGUSER") ?? "postgres",
    password: present(read, "PGPASSWORD"),
    database: applySlot(present(read, "PGDATABASE") ?? "rails_js_test", read),
  };
}

/**
 * MySQL/MariaDB connection details.
 *
 * `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_SOCK` mirror the keys Rails interpolates
 * (`config.example.yml:12-19`). The credential and database name are a trails
 * extension defaulting to what CI provisions — Rails hard-codes
 * `username: rails` instead. See the deviations note in the module doc.
 */
export function mysqlSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: present(read, "MYSQL_HOST") ?? "localhost",
    port: intSetting(read, "MYSQL_PORT", 3306),
    user: present(read, "MYSQL_USER") ?? "root",
    password: present(read, "MYSQL_PASSWORD"),
    database: applySlot(present(read, "MYSQL_DATABASE") ?? "rails_js_test", read),
    socket: present(read, "MYSQL_SOCK"),
  };
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
    username: user,
    database,
    ...(password === undefined ? {} : { password }),
    ...(socket === undefined ? {} : { socket }),
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
