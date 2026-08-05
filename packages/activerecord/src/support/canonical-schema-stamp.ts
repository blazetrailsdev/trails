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
import { RUN_TOKEN_ENV } from "./run-token.js";

function stampFor(runToken: string): string {
  return `canonical-schema:${runToken}`;
}

/**
 * `ar_internal_metadata` key holding the tables the load that stamped this
 * database laid — canonical *and* adapter-specific, as they stood before any
 * test ran. Persisted rather than recomputed because a worker arriving on a
 * stamped database cannot tell an adapter-specific table (`defaults`,
 * `postgresql_times`, …) from a bespoke one a previous file left behind, and
 * the two have opposite fates in the purge.
 */
const LAID_TABLES_KEY = "laid_tables";

/**
 * Bookkeeping tables are never part of the laid set — `resetTables` drops them
 * unconditionally, so recording them would only make the snapshot lie.
 */
const BOOKKEEPING_TABLE_NAMES: ReadonlySet<string> = new Set([
  "schema_migrations",
  "ar_internal_metadata",
]);

/**
 * The tables the stamping load laid, or `null` if this database carries no
 * snapshot (an unstamped run, or one laid before this key existed). A `null`
 * puts the caller back on the re-lay-everything path.
 *
 * @internal
 */
export async function laidTables(adapter: DatabaseAdapter): Promise<string[] | null> {
  const metadata = new InternalMetadata(adapter);
  if (!(await metadata.tableExists())) return null;
  const raw = await metadata.get(LAID_TABLES_KEY);
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
 * together with the {@link laidTables} snapshot — taken after the flags, so the
 * metadata table itself is present and filtered out along with
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
  const snapshot =
    laid ?? (await adapter.tables()).filter((name) => !BOOKKEEPING_TABLE_NAMES.has(name));
  await metadata.set(LAID_TABLES_KEY, JSON.stringify([...snapshot].sort()));
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
