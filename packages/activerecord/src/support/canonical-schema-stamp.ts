/**
 * The "this database already carries this run's canonical schema" stamp.
 *
 * No Rails counterpart: Rails' suite is one process against one database that
 * is loaded once. trails forks workers against cloned/slotted databases, so a
 * worker has to decide whether the database it just claimed was already laid by
 * this run (clear the rows and go) or has to be loaded from scratch.
 *
 * The stamp is the run token, written into `ar_internal_metadata`'s
 * `schema_sha1` — the same slot `DatabaseTasks.loadSchemaCurrent` stamps a
 * schema-file SHA1 into, and the one `schemaUpToDate` reads. A token rather
 * than a file digest because the canonical schema is laid from the registry
 * (`loadCanonicalSchema`), which has no file to digest: within one run every
 * database is laid from the same registry, so "stamped by this run" *is* the
 * up-to-date test, and across runs the token differs.
 *
 * The stamp says the canonical tables are laid and shape-current; it says
 * nothing about what tests have since done to the rest of the database, so the
 * fast path still clears the rows and re-runs the adapter-specific arm (see
 * `test-setup-dy.ts`).
 *
 * @internal Boot/template setup paths only.
 */
import { getEnv } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { InternalMetadata } from "../internal-metadata.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { RUN_TOKEN_ENV } from "./run-token.js";

function stampFor(runToken: string): string {
  return `canonical-schema:${runToken}`;
}

/**
 * `ar_internal_metadata` key holding the **adapter-specific** tables the load
 * that stamped this database laid — the `<adapter>_specific_schema.rb` half
 * only, as it stood before any test ran.
 *
 * Persisted rather than recomputed because a worker arriving on a stamped
 * database cannot tell an adapter-specific table (`defaults`,
 * `postgresql_times`, …) from a bespoke one a previous file left behind, and
 * the two have opposite fates in the purge. The canonical half is deliberately
 * *not* recorded: it is `TEST_SCHEMA`'s key set, which the purge already
 * protects by name, so storing it would only bloat the value.
 */
const ADAPTER_SPECIFIC_TABLES_KEY = "adapter_specific_tables";

/**
 * `ar_internal_metadata.value` is `t.string` (`internal_metadata.rb:85-93`),
 * which Rails' MySQL adapter renders as `varchar(255)`
 * (`abstract_mysql_adapter.rb:33`). PostgreSQL's and SQLite's `string` carries
 * no length limit (`postgresql_adapter.rb:136`, `sqlite3_adapter.rb:71`), so
 * the cap is MySQL's alone — applying it everywhere would silently disable the
 * memo on PostgreSQL, whose adapter-specific half is the largest of the three.
 *
 * Rather than widen the column — that would be a schema divergence from Rails —
 * a value that would not fit is written empty, and the boot falls back to
 * re-laying the adapter-specific arm. Only the memo is lost, never correctness.
 *
 * The recorded half is small by construction (1 table on SQLite, 7 on MySQL,
 * 24 on PostgreSQL), so this is a backstop, not an expected path.
 */
const MYSQL_MAX_VALUE_LENGTH = 255;

function fitsValueColumn(adapter: DatabaseAdapter, encoded: string): boolean {
  return adapter.adapterName !== "mysql" || encoded.length <= MYSQL_MAX_VALUE_LENGTH;
}

/**
 * Bookkeeping tables are never part of the laid set — `resetTables` drops them
 * unconditionally, so recording them would only make the snapshot lie.
 */
const BOOKKEEPING_TABLE_NAMES: ReadonlySet<string> = new Set([
  "schema_migrations",
  "ar_internal_metadata",
]);

/** The canonical `schema.rb` mirror, which the purge protects by name already. */
const CANONICAL_TABLE_NAMES: ReadonlySet<string> = new Set(Object.keys(TEST_SCHEMA));

/** What is on the database beyond the canonical and bookkeeping halves. */
async function adapterSpecificHalf(adapter: DatabaseAdapter): Promise<string[]> {
  return (await adapter.tables()).filter(
    (name) => !BOOKKEEPING_TABLE_NAMES.has(name) && !CANONICAL_TABLE_NAMES.has(name),
  );
}

/**
 * The adapter-specific tables the stamping load laid, or `null` if this
 * database carries no snapshot (an unstamped run, one laid before this key
 * existed, or one whose set did not fit {@link MYSQL_MAX_VALUE_LENGTH}). A `null`
 * puts the caller back on the re-lay-the-arm path.
 *
 * @internal
 */
export async function adapterSpecificTables(adapter: DatabaseAdapter): Promise<string[] | null> {
  const metadata = new InternalMetadata(adapter);
  if (!(await metadata.tableExists())) return null;
  const raw = await metadata.get(ADAPTER_SPECIFIC_TABLES_KEY);
  if (raw == null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * Write the stamp onto a database whose canonical schema has just been laid,
 * together with the {@link adapterSpecificTables} snapshot — taken after the
 * flags, so the metadata table itself is present and filtered out along with
 * `schema_migrations`.
 *
 * `laid` carries a snapshot forward instead of taking a fresh one. Only a
 * caller that has just *laid* schema may let it default: the purge drops
 * `ar_internal_metadata`, so a re-stamping caller that snapshotted the live
 * database would record whatever the last test file left behind, and a file
 * that dropped an adapter-specific table would shrink the recorded set for
 * every later file with nothing to restore it.
 *
 * A run without a token (globalSetup disabled) stamps nothing, which leaves
 * every worker on the full load path.
 *
 * @internal
 */
export async function stampCanonicalSchema(
  adapter: DatabaseAdapter,
  runToken = getEnv(RUN_TOKEN_ENV),
  laid?: readonly string[],
): Promise<void> {
  if (!runToken) return;
  const metadata = new InternalMetadata(adapter);
  await metadata.createTableAndSetFlags("test", stampFor(runToken));
  const snapshot = laid ?? (await adapterSpecificHalf(adapter));
  const encoded = JSON.stringify([...snapshot].sort());
  // An over-long value is written as empty rather than skipped: skipping would
  // leave an earlier, now-stale snapshot in place on a database whose metadata
  // table survived, and {@link adapterSpecificTables} reads empty as absent.
  await metadata.set(ADAPTER_SPECIFIC_TABLES_KEY, fitsValueColumn(adapter, encoded) ? encoded : "");
}

/**
 * Whether this database was laid by this run and no test has touched it since.
 *
 * @internal
 */
export async function canonicalSchemaUpToDate(adapter: DatabaseAdapter): Promise<boolean> {
  const runToken = getEnv(RUN_TOKEN_ENV);
  if (!runToken) return false;
  const metadata = new InternalMetadata(adapter);
  if (!(await metadata.tableExists())) return false;
  return (await metadata.get("schema_sha1")) === stampFor(runToken);
}

/**
 * The stamp value a database laid by `runToken` carries. Exported for the
 * template probe (`pg-template.test.ts`), which asserts globalSetup stamped it.
 *
 * @internal
 */
export function canonicalSchemaStamp(runToken: string): string {
  return stampFor(runToken);
}
