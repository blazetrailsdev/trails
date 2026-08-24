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
import { BOOKKEEPING_TABLE_NAMES } from "./drop-all-tables.js";
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
  // `resetTestTables` drops `schema_migrations` / `ar_internal_metadata`
  // unconditionally between files and lets whoever needs them recreate them
  // (`drop-all-tables.ts`), so a dump that described them would re-assert a
  // dropped table as present — the stale `data_source_exists?` entry that
  // reset's own `clearBang()` exists to prevent (`internal_metadata.rb:108-110`)
  // — and would fingerprint-fail every file besides.
  for (const table of BOOKKEEPING_TABLE_NAMES) {
    cache.clearDataSourceCacheBang(adapter, table);
  }
  const filename = await schemaCacheDumpPathFor(runToken);
  cache.dumpTo(filename);
  return {
    filename,
    fingerprint: fingerprintOf(await schemaShapes(adapter), dumpedTables(cache.marshalDump())),
  };
}

/**
 * The table names a dump describes — `marshal_dump`'s fifth element, its
 * `@data_sources` hash (`schema_cache.rb:416-418`).
 */
export function dumpedTables(marshalled: unknown[]): ReadonlySet<string> {
  return new Set(Object.keys((marshalled[4] as Record<string, boolean>) ?? {}));
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
 * Whole-database queries, not one per table: reflecting each table to check it
 * would cost exactly what the dump exists to avoid.
 */
export async function schemaShapes(adapter: DatabaseAdapter): Promise<Map<string, string>> {
  const shapes = new Map<string, string>();
  for (const sql of SHAPE_QUERIES[adapter.adapterName] ?? []) {
    for (const row of (await adapter.execute(sql)) as { name: string; col: string | null }[]) {
      const name = String(row.name);
      shapes.set(name, `${shapes.get(name) ?? ""}\n${row.col ?? ""}`);
    }
  }
  return shapes;
}

/**
 * Digest the shapes of `tables` alone, so tables the dump never described — a
 * bespoke table a file laid in its own `beforeAll` — cannot make the dump look
 * stale. A table the dump describes that is no longer there can never match.
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

/**
 * What a lane hashes, in whole-database form: the projection its own
 * `columnDefinitions` reflects a Column from, plus its indexes — everything a
 * cached entry holds and DDL can change, so no alteration to a dumped table can
 * leave the fingerprint intact.
 *
 * sqlite needs one query for both: `sqlite_master.sql` is the `CREATE`
 * statement itself, which carries collation and every column attribute, and its
 * index rows carry `tbl_name`. PostgreSQL's column projection is
 * `postgresql/schema-statements-class.ts:605-614` — type, default, notnull,
 * oid, typmod, identity, generated, collation and comment, the fields
 * `PostgreSQL::Column` stores. MySQL's is `SHOW FULL FIELDS`
 * (`abstract-mysql-adapter.ts:1904`) read out of `information_schema`, whose
 * `COLLATION_NAME` / `EXTRA` / `COLUMN_COMMENT` are its `Collation` / `Extra` /
 * `Comment`. Its index rows carry `STATISTICS.COLLATION` because that is where
 * `IndexDefinition#orders` comes from — `"D"` is a descending column
 * (`mysql/schema_statements.rb:43`, `:47`) — alongside `SUB_PART`
 * (`lengths`) and `INDEX_TYPE` (`using`); MySQL 8's `EXPRESSION` is left out
 * because MariaDB's `STATISTICS` has no such column, and the canonical schema
 * has no functional index for it to describe. PostgreSQL and sqlite
 * need no such spelling out: `pg_indexes.indexdef` and `sqlite_master.sql` are
 * the index's own DDL, `DESC` and all.
 */
const SHAPE_QUERIES: Record<string, string[]> = {
  sqlite: [
    `SELECT tbl_name AS name, type || ' ' || coalesce(sql, '') AS col
     FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  ],
  postgres: [
    `SELECT t.relname AS name,
            a.attname || ' ' ||
              pg_catalog.format_type(a.atttypid, a.atttypmod) || ' ' ||
              coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ' ' ||
              a.attnotnull::text || ' ' || a.atttypid::text || ' ' ||
              a.atttypmod::text || ' ' || a.attidentity::text || ' ' ||
              a.attgenerated::text || ' ' ||
              coalesce(col.collname, '') || ' ' || coalesce(pgd.description, '') AS col
     FROM pg_attribute a
     JOIN pg_class t ON t.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     LEFT JOIN pg_type pt ON a.atttypid = pt.oid
     LEFT JOIN pg_collation col ON a.attcollation = col.oid AND a.attcollation <> pt.typcollation
     LEFT JOIN pg_description pgd
       ON pgd.objoid = a.attrelid AND pgd.classoid = 'pg_class'::regclass AND pgd.objsubid = a.attnum
     WHERE n.nspname = ANY (current_schemas(false))
       AND t.relkind IN ('r', 'v', 'm', 'p', 'f')
       AND a.attnum > 0
       AND NOT a.attisdropped
     ORDER BY t.relname, a.attnum`,
    `SELECT tablename AS name, indexdef AS col
     FROM pg_indexes
     WHERE schemaname = ANY (current_schemas(false))
     ORDER BY tablename, indexname`,
  ],
  mysql2: [
    `SELECT TABLE_NAME AS name,
            CONCAT(COLUMN_NAME, ' ', COLUMN_TYPE, ' ', IS_NULLABLE, ' ',
                   COALESCE(COLLATION_NAME, ''), ' ', COLUMN_KEY, ' ',
                   COALESCE(COLUMN_DEFAULT, ''), ' ', EXTRA, ' ', COLUMN_COMMENT) AS col
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    `SELECT TABLE_NAME AS name,
            CONCAT(INDEX_NAME, ' ', SEQ_IN_INDEX, ' ', COLUMN_NAME, ' ', NON_UNIQUE, ' ',
                   COALESCE(COLLATION, ''), ' ', COALESCE(SUB_PART, ''), ' ',
                   INDEX_TYPE, ' ', COALESCE(INDEX_COMMENT, '')) AS col
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  ],
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
