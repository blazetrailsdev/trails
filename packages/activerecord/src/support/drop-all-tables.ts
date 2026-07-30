import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";

/**
 * Tables that exist after the schema load but are *not* part of the loaded
 * schema: Rails' own migration bookkeeping, which migrator tests manage per-test
 * and rely on the reset clearing. Dropped like any non-boot-laid table.
 */
const BOOKKEEPING_TABLE_NAMES: ReadonlySet<string> = new Set([
  "schema_migrations",
  "ar_internal_metadata",
]);

/**
 * Fallback for a reset that runs before {@link recordBootLaidTables} — the
 * canonical `schema.rb` mirror, which is the registry the load itself lays from.
 * The adapter-specific half is absent here; only the snapshot knows it.
 */
const CANONICAL_TABLE_NAMES: ReadonlySet<string> = new Set(Object.keys(TEST_SCHEMA));

let _bootLaidTableNames: ReadonlySet<string> | null = null;

/**
 * Snapshot the tables the schema load just laid — both halves of Rails'
 * `load_schema` (`schema.rb`'s mirror and `<adapter>_specific_schema.rb`) — as
 * the set {@link resetTestTables} truncates rather than drops.
 *
 * Taken from the database rather than declared: whatever the loaders create is
 * what is protected, on whichever lane is running, with nothing to keep in step.
 * Called once per worker from `test-setup-dy.ts`, immediately after the load.
 *
 * @internal Boot/template setup paths only.
 */
export async function recordBootLaidTables(adapter: DatabaseAdapter): Promise<void> {
  const laid = (await adapter.tables()).filter((name) => !BOOKKEEPING_TABLE_NAMES.has(name));
  _bootLaidTableNames = new Set(laid);
}

function bootLaidTableNames(): ReadonlySet<string> {
  return _bootLaidTableNames ?? CANONICAL_TABLE_NAMES;
}

/**
 * Drops every user table/view/matview in the database. Idempotent; per-DROP
 * errors are swallowed so teardown noise never aborts the sequence.
 * PG covers all schemas in `current_schemas(false)` (not just `public`).
 * MySQL uses a pinned pool connection with `FOREIGN_KEY_CHECKS=0`.
 */
export async function dropAllTables(adapter: DatabaseAdapter): Promise<void> {
  await resetTables(adapter, "drop-all");
}

/**
 * Between-test row reset that keeps the boot-laid canonical schema intact.
 *
 * Instead of `dropAllTables`' ~330-table `DROP TABLE` fan-out per test (the
 * dominant DDL-churn source measured in PR #4499), this **truncates** the
 * canonical tables (schema/indexes preserved — RFC 0059 lays them once at boot
 * and keeps them shape-stable). **Every non-canonical table is dropped**, exactly
 * as the previous unconditional `dropAllTables` did: bespoke tables a test
 * created (so their shape can't leak into the next file) *and* the
 * `schema_migrations` / `ar_internal_metadata` bookkeeping tables (migrator
 * tests manage those per-test and rely on the reset clearing them).
 * Views/matviews are never canonical, so they are always dropped.
 */
export async function resetTestTables(adapter: DatabaseAdapter): Promise<void> {
  await resetTables(adapter, "reset");
}

type ResetMode = "drop-all" | "reset";

async function resetTables(adapter: DatabaseAdapter, mode: ResetMode): Promise<void> {
  const bootLaid = bootLaidTableNames();
  switch (adapter.adapterName) {
    case "postgres":
      await resetPgTables(adapter, mode, bootLaid);
      break;
    case "mysql":
      await resetMysqlTables(adapter, mode, bootLaid);
      break;
    case "sqlite":
      await resetSqliteTables(adapter, mode, bootLaid);
      break;
  }
}

/**
 * Truncate only the candidate canonical tables that actually hold rows.
 *
 * Truncating is the between-test row-clear, but on PostgreSQL every
 * `truncateTables` call pays `disableReferentialIntegrity` (an `ALTER TABLE …
 * TRIGGER` pass over *every* table) and on MySQL/MariaDB `TRUNCATE` is
 * DDL-grade (drop+recreate tablespace) per table — so truncating all ~330
 * canonical tables per test, even the empty ones, dominates CI time. Most
 * non-transactional tests write to zero canonical tables, so a single
 * `EXISTS` probe collapses the work to the handful (often none) that changed;
 * when none changed we skip `truncateTables` entirely (no referential-integrity
 * pass at all).
 *
 * Exactness matters — missing a non-empty table would leak rows into the next
 * test — so on any probe failure we fall back to truncating the full candidate
 * set (the previous, correct-but-slower behavior).
 */
async function truncateNonEmpty(adapter: DatabaseAdapter, candidates: string[]): Promise<void> {
  if (candidates.length === 0) return;
  let toTruncate = candidates;
  try {
    const probe = candidates
      .map(
        (t) =>
          `SELECT '${t.replace(/'/g, "''")}' AS t WHERE EXISTS (SELECT 1 FROM ${adapter.quoteTableName(t)})`,
      )
      .join(" UNION ALL ");
    const rows = (await adapter.execute(probe)) as Array<{ t?: string; T?: string }>;
    toTruncate = rows.map((r) => r.t ?? r.T).filter((t): t is string => Boolean(t));
  } catch {
    toTruncate = candidates;
  }
  if (toTruncate.length > 0) await adapter.truncateTables(...toTruncate);
}

function _isPgConnectionError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (typeof err.code === "string" && err.code.startsWith("08")) return true;
  const msg = typeof err.message === "string" ? err.message : "";
  return (
    msg.includes("invalid frontend message") ||
    msg.includes("Connection terminated") ||
    msg.includes("client has already ended") ||
    msg.includes("Client has encountered a connection error")
  );
}

async function resetPgTables(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  try {
    await _resetPgTablesOnce(adapter, mode, bootLaid);
  } catch (e) {
    // exec() routes through withRawConnection, whose retry loop calls
    // reconnectBang → the PG reconnect() override on a connection error, so
    // _rawConnection is now null and the next _acquireFreshClient() will open a
    // fresh pg.Client. Retry exactly once.
    if (_isPgConnectionError(e)) {
      await _resetPgTablesOnce(adapter, mode, bootLaid);
    } else {
      throw e;
    }
  }
}

async function _resetPgTablesOnce(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  const schema = `ANY(current_schemas(false))`;
  // Views/matviews are never canonical — always drop them.
  for (const { schemaname: s, name: n } of (await adapter.execute(
    `SELECT schemaname, matviewname AS name FROM pg_matviews WHERE schemaname = ${schema}`,
  )) as { schemaname: string; name: string }[]) {
    try {
      await adapter.executeMutation(`DROP MATERIALIZED VIEW IF EXISTS "${s}"."${n}" CASCADE`);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }
  for (const { schemaname: s, name: n } of (await adapter.execute(
    `SELECT schemaname, viewname AS name FROM pg_views WHERE schemaname = ${schema}`,
  )) as { schemaname: string; name: string }[]) {
    try {
      await adapter.executeMutation(`DROP VIEW IF EXISTS "${s}"."${n}" CASCADE`);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }

  const toTruncate: string[] = [];
  const tableRows = (await adapter.execute(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ${schema}`,
  )) as { schemaname: string; tablename: string }[];
  for (const { schemaname: s, tablename: t } of tableRows) {
    // A table living outside the default (public) schema — e.g. schema.test.ts's
    // test_schema/test_schema2 — can never be a boot-laid canonical table; drop
    // it regardless of mode so it can't bleed state into the next file.
    if (mode === "reset" && s === "public" && bootLaid.has(t)) {
      toTruncate.push(t);
      continue;
    }
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${s}"."${t}" CASCADE`);
    } catch (e) {
      if (_isPgConnectionError(e)) throw e;
    }
  }
  await truncateNonEmpty(adapter, toTruncate);
}

async function resetMysqlTables(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  // Works with both the legacy pool model (_driverPool) and the current
  // single-connection model (_client). Falls back to adapter.execute /
  // adapter.executeMutation so both paths share one implementation.
  const toTruncate: string[] = [];
  try {
    await adapter.execute(`SET FOREIGN_KEY_CHECKS=0`);
    const tableRows = await adapter.execute(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    );
    const viewRows = await adapter.execute(
      `SELECT table_name FROM information_schema.views WHERE table_schema = DATABASE()`,
    );
    for (const r of viewRows as Array<{ table_name?: string; TABLE_NAME?: string }>) {
      const name = r.table_name ?? r.TABLE_NAME;
      if (name)
        try {
          await adapter.executeMutation(`DROP VIEW IF EXISTS \`${name}\``);
        } catch {}
    }
    for (const r of tableRows as Array<{ table_name?: string; TABLE_NAME?: string }>) {
      const name = r.table_name ?? r.TABLE_NAME;
      if (!name) continue;
      if (mode === "reset" && bootLaid.has(name)) {
        toTruncate.push(name);
        continue;
      }
      try {
        await adapter.executeMutation(`DROP TABLE IF EXISTS \`${name}\``);
      } catch {}
    }
    await truncateNonEmpty(adapter, toTruncate);
  } finally {
    try {
      await adapter.execute(`SET FOREIGN_KEY_CHECKS=1`);
    } catch {}
  }
}

async function resetSqliteTables(
  adapter: DatabaseAdapter,
  mode: ResetMode,
  bootLaid: ReadonlySet<string>,
): Promise<void> {
  const toTruncate: string[] = [];
  for (const { name } of (await adapter.execute(
    `SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%'`,
  )) as { name: string }[]) {
    try {
      await adapter.executeMutation(`DROP VIEW IF EXISTS "${name}"`);
    } catch {}
  }
  for (const { name } of (await adapter.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  )) as { name: string }[]) {
    if (mode === "reset" && bootLaid.has(name)) {
      toTruncate.push(name);
      continue;
    }
    try {
      await adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
    } catch {}
  }
  await truncateNonEmpty(adapter, toTruncate);
}
