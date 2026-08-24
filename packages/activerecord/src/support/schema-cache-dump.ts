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
import { getEnv, getOsAsync, hexdigest } from "@blazetrails/activesupport";
import { getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { SchemaCache } from "../connection-adapters/schema-cache.js";
import { TEMP_DB_PREFIX } from "./sqlite-template.js";

/** Env var: absolute path of the boot-produced schema-cache dump. */
export const SCHEMA_CACHE_DUMP_ENV = "AR_TEST_SCHEMA_CACHE_DUMP";

/**
 * Env var: {@link fingerprintOf} over the schema the dump describes, as it was
 * when the dump was taken. A worker replays the dump only against a database
 * that still fingerprints the same.
 */
export const SCHEMA_CACHE_FINGERPRINT_ENV = "AR_TEST_SCHEMA_CACHE_FINGERPRINT";

/** The boot fingerprint, or `null` when this run produced no dump. */
export function templateSchemaFingerprint(): string | null {
  return getEnv(SCHEMA_CACHE_FINGERPRINT_ENV) ?? null;
}

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
): Promise<{ filename: string; fingerprint: string } | null> {
  const cache = adapter.internalSchemaCache;
  if (!cache) return null;
  await cache.addAll(pool);
  const filename = await schemaCacheDumpPathFor(runToken);
  cache.dumpTo(filename);
  return {
    filename,
    fingerprint: fingerprintOf(await schemaShapes(adapter), dumpedTables(cache)),
  };
}

/** The table names a cache describes — its `@data_sources` (`schema_cache.rb:416`). */
export function dumpedTables(cache: SchemaCache): ReadonlySet<string> {
  const dataSources = cache.marshalDump()[4] as Record<string, boolean>;
  return new Set(Object.keys(dataSources ?? {}));
}

/**
 * Every table's shape, in one query per lane.
 *
 * The boot dump describes the schema as globalSetup laid it, and the between-file
 * reset truncates the canonical tables rather than re-laying them
 * (`drop-all-tables.ts` `resetTestTables`) — so a file that leaves an
 * `addColumn` / `changeColumn` / `renameColumn` behind changes a canonical
 * table's shape without changing the table *set*, and the next file must not be
 * answered from the dump. Rails has no equivalent check because it never faces
 * a stale dump: every DDL path invalidates the cache entry as it runs
 * (`abstract/schema_statements.rb:306`, `:542`, and PostgreSQL's own clears at
 * `postgresql/schema_statements.rb:460-467`, `:523-524`), which trails also
 * does — but only within the process that ran the DDL, and the dump outlives it.
 *
 * One query, not one per table: reflecting each table to check it would cost
 * exactly what the dump exists to avoid.
 */
export async function schemaShapes(adapter: DatabaseAdapter): Promise<Map<string, string>> {
  const sql = SHAPE_QUERIES[adapter.adapterName];
  if (sql === undefined) return new Map();
  const shapes = new Map<string, string>();
  for (const row of (await adapter.execute(sql)) as { name: string; col: string | null }[]) {
    const name = String(row.name);
    shapes.set(name, `${shapes.get(name) ?? ""}\n${row.col ?? ""}`);
  }
  return shapes;
}

/**
 * Digest the shapes of `tables` alone, so tables the dump never described — a
 * bespoke table a file laid in its own `beforeAll` — cannot make the dump look
 * stale. `null` when a table the dump describes is no longer there.
 */
export function fingerprintOf(shapes: Map<string, string>, tables: ReadonlySet<string>): string {
  const parts: string[] = [];
  for (const table of [...tables].sort()) {
    const shape = shapes.get(table);
    if (shape === undefined) return MISSING_TABLE;
    parts.push(`${table}\u0000${shape}`);
  }
  return hexdigest(parts.join("\u0001"));
}

/** The fingerprint of a schema that has lost a table the dump described. */
const MISSING_TABLE = "missing-table";

const SHAPE_QUERIES: Record<string, string> = {
  sqlite: `SELECT name, sql AS col FROM sqlite_master
           WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`,
  postgres: `SELECT table_name AS name,
                    column_name || ' ' || data_type || ' ' ||
                      coalesce(character_maximum_length::text, '') || ' ' ||
                      is_nullable || ' ' || coalesce(column_default, '') AS col
             FROM information_schema.columns
             WHERE table_schema = ANY (current_schemas(false))
             ORDER BY table_name, ordinal_position`,
  mysql2: `SELECT TABLE_NAME AS name,
                  CONCAT(COLUMN_NAME, ' ', COLUMN_TYPE, ' ', IS_NULLABLE, ' ',
                         COALESCE(COLUMN_DEFAULT, '')) AS col
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
           ORDER BY TABLE_NAME, ORDINAL_POSITION`,
};

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
