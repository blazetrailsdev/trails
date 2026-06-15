/**
 * ARTest-style second-database (`arunit2`) configuration for the test harness.
 *
 * Rails models the AR suite as two databases — `arunit` (primary) and
 * `arunit2` — both declared in `test/config.yml` and surfaced through
 * `ARTest.test_configuration_hashes` / `ARTest.connection_config`.
 * `ActiveRecord::Base` connects to `arunit`; `ARUnit2Model` connects to
 * `arunit2`; the cross-database-select probe references both by their
 * configured names.
 *
 * trails provisions a single server per adapter (`MYSQL_TEST_URL` /
 * `PG_TEST_URL`), so rather than maintaining a separate config file we derive
 * the two database names from the primary connection URL by suffixing. This
 * keeps the names config-derived (not invented per call) and dedicated to the
 * cross-pool work — off the shared primary database whose canonical tables
 * parallel workers create and drop.
 *
 * Hard rules (RFC 0023): no `node:*` imports, no `process.*` — environment
 * reads go through activesupport's `getEnv`; async fs only (none needed here).
 *
 * @internal
 */

import { getEnv } from "@blazetrails/activesupport";

export type TestAdapterName = "sqlite" | "postgres" | "mysql";

const ARUNIT_SUFFIX = "_arunit";
const ARUNIT2_SUFFIX = "_arunit2";

/** The database component of a connection URL (`scheme://host/foo` → `foo`). */
export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/** Return a copy of `url` with its database (path) swapped to `database`. */
function swapDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/**
 * The config-derived `arunit` / `arunit2` database names for a primary URL.
 * Both are the primary database name plus a fixed suffix, mirroring how
 * `ARTest.test_configuration_hashes` exposes two named databases.
 */
export function arunitDatabaseNames(primaryUrl: string): { arunit: string; arunit2: string } {
  const base = databaseName(primaryUrl);
  return { arunit: `${base}${ARUNIT_SUFFIX}`, arunit2: `${base}${ARUNIT2_SUFFIX}` };
}

/** The `arunit2` connection URL derived from a primary URL. */
export function arunit2Url(primaryUrl: string): string {
  return swapDatabase(primaryUrl, arunitDatabaseNames(primaryUrl).arunit2);
}

/** A config accepted by `Model.establishConnection` (URL string or hash). */
export type SecondDatabaseConfig = string | { adapter: string; database: string; pool: number };

export interface ResolvedSecondDatabase {
  adapter: TestAdapterName;
  config: SecondDatabaseConfig;
}

/**
 * Resolve the second-database (`arunit2`) connection config for the adapter the
 * current worker is running against, from the same env signals
 * (`PG_TEST_URL` / `MYSQL_TEST_URL`) the primary harness uses. On sqlite the
 * two databases are separate in-memory pools (a server-less analog of the
 * `arunit` / `arunit2` split); on Postgres/MySQL the config points at the
 * derived `arunit2` database on the shared server.
 *
 * Status: the sole runtime caller (`setupSecondPool`) only runs on the sqlite
 * lane today — `MultipleDbTest` is `describe.skipIf(!isSqliteRun())` because no
 * one provisions a second named database on the PG/MySQL servers yet. The
 * Postgres/MySQL branches here are therefore groundwork: exercised by this
 * file's unit tests and ready for the un-gating + `CREATE DATABASE`
 * provisioning tracked in its own story, not yet live on a PG/MySQL run.
 *
 * `read` is injectable so tests can exercise each adapter branch without
 * mutating the ambient environment; it defaults to activesupport's `getEnv`.
 */
export function resolveSecondDatabaseConfig(
  read: (key: string) => string | undefined = getEnv,
): ResolvedSecondDatabase {
  const pgUrl = read("PG_TEST_URL");
  if (pgUrl) {
    return { adapter: "postgres", config: arunit2Url(pgUrl) };
  }
  const mysqlUrl = read("MYSQL_TEST_URL");
  if (mysqlUrl) {
    return { adapter: "mysql", config: arunit2Url(mysqlUrl) };
  }
  return { adapter: "sqlite", config: { adapter: "sqlite3", database: ":memory:", pool: 1 } };
}
