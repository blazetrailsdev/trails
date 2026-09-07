/** @internal */
import { getEnv, hexdigest } from "@blazetrails/activesupport";
import { getOsAsync, File } from "@blazetrails/ruby-compat";
import type {
  AbstractAdapter as DatabaseAdapter,
  AdapterName,
} from "../connection-adapters/abstract-adapter.js";
import { SchemaCache } from "../connection-adapters/schema-cache.js";
import { BOOKKEEPING_TABLE_NAMES } from "./drop-all-tables.js";
import { supportsExpressionIndex } from "./schema-types.js";
import { TEMP_DB_PREFIX } from "./sqlite-template.js";
import { typeRegistryKeyFor } from "./type-registry-key.js";

export const SCHEMA_CACHE_DUMP_ENV = "AR_TEST_SCHEMA_CACHE_DUMP";

export const SCHEMA_CACHE_FINGERPRINT_ENV = "AR_TEST_SCHEMA_CACHE_FINGERPRINT";

export function templateSchemaFingerprint(): string | null {
  return getEnv(SCHEMA_CACHE_FINGERPRINT_ENV) ?? null;
}

export async function schemaCacheDumpPathFor(runToken: string): Promise<string> {
  const os = await getOsAsync();
  return File.join(os.tmpdir(), `${TEMP_DB_PREFIX}schema-cache-${runToken}.json`);
}

export async function dumpTemplateSchemaCache(
  adapter: DatabaseAdapter,
  pool: unknown,
  runToken: string,
): Promise<{ filename: string; fingerprint: string } | null> {
  const cache = adapter.internalSchemaCache;
  if (!cache) return null;
  await cache.addAll(pool);
  for (const table of BOOKKEEPING_TABLE_NAMES) {
    cache.clearDataSourceCacheBang(adapter, table);
  }
  const filename = await schemaCacheDumpPathFor(runToken);
  await cache.dumpTo(filename);
  return {
    filename,
    fingerprint: fingerprintOf(await schemaShapes(adapter), dumpedTables(cache.marshalDump())),
  };
}

export function dumpedTables(marshalled: unknown[]): ReadonlySet<string> {
  return new Set(Object.keys((marshalled[4] as Record<string, boolean>) ?? {}));
}

export async function schemaShapes(adapter: DatabaseAdapter): Promise<Map<string, string>> {
  const shapes = new Map<string, string>();
  for (const sql of await shapeQueriesFor(adapter)) {
    for (const row of (await adapter.execute(sql)) as { name: string; col: string | null }[]) {
      const name = String(row.name);
      shapes.set(name, `${shapes.get(name) ?? ""}\n${row.col ?? ""}`);
    }
  }
  return shapes;
}

export function fingerprintOf(shapes: Map<string, string>, tables: ReadonlySet<string>): string {
  const parts: string[] = [];
  for (const table of [...tables].sort()) {
    const shape = shapes.get(table);
    if (shape === undefined) return MISSING_TABLE;
    parts.push(`${table}\u0000${shape}`);
  }
  return hexdigest(parts.join("\u0001"));
}

const MISSING_TABLE = "missing-table";

const SHAPE_QUERIES: Record<AdapterName, string[]> = {
  sqlite3: [
    `SELECT tbl_name AS name, type || ' ' || coalesce(sql, '') AS col
     FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  ],
  postgresql: [
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
            CONCAT(INDEX_NAME, ' ', SEQ_IN_INDEX, ' ', COALESCE(COLUMN_NAME, ''), ' ', NON_UNIQUE, ' ',
                   COALESCE(COLLATION, ''), ' ', COALESCE(SUB_PART, ''), ' ',
                   INDEX_TYPE, ' ', COALESCE(INDEX_COMMENT, ''), ' ', /*EXPRESSION*/'') AS col
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  ],
};

async function shapeQueriesFor(adapter: DatabaseAdapter): Promise<string[]> {
  const typeRegistryKey = typeRegistryKeyFor(adapter);
  const queries: string[] = (typeRegistryKey && SHAPE_QUERIES[typeRegistryKey]) || [];
  if (typeRegistryKey !== "mysql2") return queries;
  const expression = (await supportsExpressionIndex(adapter)) ? "COALESCE(EXPRESSION, '')" : "''";
  return queries.map((sql) => sql.replace("/*EXPRESSION*/''", expression));
}

export async function templateSchemaCache(): Promise<SchemaCache | null> {
  if (loaded === undefined) {
    const filename = getEnv(SCHEMA_CACHE_DUMP_ENV);
    loaded = filename === undefined ? null : await SchemaCache._loadFrom(filename);
  }
  return loaded;
}

let loaded: SchemaCache | null | undefined;
