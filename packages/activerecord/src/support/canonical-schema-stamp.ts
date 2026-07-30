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
 * The stamp is single-use by construction: `resetTestTables` drops
 * `ar_internal_metadata` between test files, so a slot database handed to a
 * later worker no longer reports up-to-date and takes the full purge+load path.
 * That is what makes the fast path safe to leave the schema untouched — a
 * database that reports up-to-date is exactly one that no test has run against.
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
 * Write the stamp onto a database whose canonical schema has just been laid.
 * A run without a token (globalSetup disabled) stamps nothing, which leaves
 * every worker on the full load path.
 *
 * @internal
 */
export async function stampCanonicalSchema(
  adapter: DatabaseAdapter,
  runToken = getEnv(RUN_TOKEN_ENV),
): Promise<void> {
  if (!runToken) return;
  await new InternalMetadata(adapter).createTableAndSetFlags("test", stampFor(runToken));
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
