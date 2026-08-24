/**
 * The boot-time schema-cache dump — Rails' `db:schema:cache:dump` for the test
 * suite.
 *
 * Rails dumps the schema cache once (`SchemaCache#dump_to`,
 * `schema_cache.rb:406`) and every process that boots afterwards loads it
 * (`SchemaCache._load_from`, `schema_cache.rb:228`) rather than re-reflecting
 * the database. trails' fixtures path used to re-reflect per test *file*:
 * `SchemaCache#add` issues four introspection queries per table
 * (`dataSourceExists` / `primaryKeys` / `columns` / `indexes`,
 * `schema_cache.rb:292-300`), which over the ~200 canonical tables is ~800
 * queries and ~0.3s on every file.
 *
 * The canonical schema is laid into the template database once at boot
 * (`template-global-setup.ts`) and cloned into every worker slot, so one
 * reflection of it describes every database the run will touch — exactly the
 * precondition a dump needs. globalSetup takes it, and the per-file warm loads
 * it.
 *
 * @internal Boot/template setup and the fixtures warm only.
 */
import { getEnv, getOsAsync } from "@blazetrails/activesupport";
import { getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { SchemaCache } from "../connection-adapters/schema-cache.js";
import { TEMP_DB_PREFIX } from "./sqlite-template.js";

/** Env var: absolute path of the boot-produced schema-cache dump. */
export const SCHEMA_CACHE_DUMP_ENV = "AR_TEST_SCHEMA_CACHE_DUMP";

/**
 * Path of this run's dump. Carries {@link TEMP_DB_PREFIX} and the run token so
 * `sweepRunDbFiles` collects it with the run's databases.
 */
export async function schemaCacheDumpPathFor(runToken: string): Promise<string> {
  const path = await getPathAsync();
  const os = await getOsAsync();
  return path.join(os.tmpdir(), `${TEMP_DB_PREFIX}schema-cache-${runToken}.json`);
}

/**
 * Reflect the freshly-laid template schema and dump it. Returns the dump's
 * path, or `null` when the adapter carries no schema cache to dump.
 */
export async function dumpTemplateSchemaCache(
  adapter: DatabaseAdapter,
  pool: unknown,
  runToken: string,
): Promise<string | null> {
  const cache = adapter.internalSchemaCache;
  if (!cache) return null;
  await cache.addAll(pool);
  const filename = await schemaCacheDumpPathFor(runToken);
  cache.dumpTo(filename);
  return filename;
}

/**
 * The boot dump, or `null` when this run produced none (no globalSetup, or a
 * lane that skipped the template build). Read once per module graph — vitest
 * reloads the graph per test file, so this is one file read and parse per file
 * in place of ~800 queries.
 */
export function templateSchemaCache(): SchemaCache | null {
  if (loaded === undefined) {
    const filename = getEnv(SCHEMA_CACHE_DUMP_ENV);
    loaded = filename === undefined ? null : SchemaCache._loadFrom(filename);
  }
  return loaded;
}

let loaded: SchemaCache | null | undefined;
