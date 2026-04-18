/**
 * Emits a JSON map from a live adapter consumed by
 * `trails-tsc --schema <path>` so the virtualizer can inject `declare`
 * members for schema-only columns.
 *
 * Output shape (per column):
 *   `{ type: <railsType>, null: boolean, arrayElementType?: <railsType> }`
 *
 * - `type`: Rails type string (`string`, `integer`, `datetime`, ...).
 * - `null`: true when the column lacks a NOT NULL constraint, rendered
 *   as `Type | null` by trails-tsc.
 * - `arrayElementType`: present for array columns, renders
 *   `ElementTsType[]` instead of `unknown[]`.
 *
 * The virtualizer also accepts the legacy `{ column: "<railsType>" }`
 * shape for backwards compatibility with hand-authored JSON, but this
 * dumper always emits the rich object shape.
 *
 * Not in Rails — this is the bridge that gives TypeScript IDE
 * autocomplete parity with Rails' runtime method_missing.
 */

import type { DatabaseAdapter } from "./adapter.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";

export interface DumpSchemaColumnsOptions {
  /**
   * Tables to skip. Always includes `schema_migrations` and
   * `ar_internal_metadata` — those are bookkeeping tables Rails never
   * maps to user models.
   */
  ignoreTables?: readonly string[];
}

/**
 * Rich column shape emitted for trails-tsc consumption. The virtualizer
 * accepts either `string` (legacy, just a Rails type) or this full
 * object form — the dumper emits the object form so nullability and
 * array element types can shape the generated TypeScript declares.
 */
export interface DumpColumnSchema {
  /** Rails type name (`string`, `integer`, `datetime`, `array`, ...). */
  type: string;
  /** True when the column is nullable (i.e. the generated type gets `| null`). */
  null: boolean;
  /**
   * For array columns, the Rails type of the array's element. trails-tsc
   * renders `ElementTsType[]` instead of `unknown[]` when present.
   */
  arrayElementType?: string;
}

const ALWAYS_IGNORED = new Set(["schema_migrations", "ar_internal_metadata"]);

type AdapterColumn = {
  name: string;
  sqlTypeMetadata?: { type?: string | null; sqlType?: string | null } | null;
  sqlType?: string | null;
  type?: string | null;
  null?: boolean | null;
};

type AdapterWithTables = { tables(): Promise<string[]> };
type AdapterWithColumns = { columns(table: string): Promise<AdapterColumn[]> };

function hasTables(a: unknown): a is AdapterWithTables {
  return typeof (a as AdapterWithTables).tables === "function";
}
function hasColumns(a: unknown): a is AdapterWithColumns {
  return typeof (a as AdapterWithColumns).columns === "function";
}

export async function dumpSchemaColumns(
  adapter: DatabaseAdapter,
  options: DumpSchemaColumnsOptions = {},
): Promise<Record<string, Record<string, DumpColumnSchema>>> {
  // Prefer the adapter's own `tables()` / `columns()` when present —
  // PostgreSQL and SQLite adapters implement them with adapter-
  // specific semantics (e.g. PG respects the current `search_path`).
  // SchemaStatements is the portable fallback for adapters that don't.
  let schema: SchemaStatements | undefined;
  const schemaStatements = () => (schema ??= new SchemaStatements(adapter));

  const ignore = new Set([...ALWAYS_IGNORED, ...(options.ignoreTables ?? [])]);

  const rawTables = hasTables(adapter) ? await adapter.tables() : await schemaStatements().tables();
  const tables = rawTables.filter((t) => !ignore.has(t)).sort();

  const out: Record<string, Record<string, DumpColumnSchema>> = Object.create(null);
  for (const table of tables) {
    const cols = hasColumns(adapter)
      ? await adapter.columns(table)
      : await schemaStatements().columns(table);
    const colMap: Record<string, DumpColumnSchema> = Object.create(null);
    const sorted = [...cols].sort((a, b) => a.name.localeCompare(b.name));
    for (const col of sorted) {
      colMap[col.name] = buildColumnSchema(col);
    }
    out[table] = colMap;
  }
  return out;
}

function buildColumnSchema(col: AdapterColumn): DumpColumnSchema {
  const type = normalizeRailsType(col);
  // Rails' column introspection returns `null: true` unless the column
  // has a NOT NULL constraint. Default to true when introspection
  // didn't populate it, matching Rails' conservative default.
  const nullable = col.null !== false;
  const schema: DumpColumnSchema = { type, null: nullable };

  // For PG array types, record the element type so trails-tsc can emit
  // `ElementTsType[]` instead of `unknown[]`.
  if (type === "array") {
    const fullSqlType = (col.sqlTypeMetadata?.sqlType ?? col.sqlType ?? "").toLowerCase();
    const m = fullSqlType.match(/^(.+?)\s*\[\]\s*$/);
    if (m && m[1]) {
      const elementRails = normalizeRailsType({
        name: col.name,
        sqlType: m[1],
      });
      if (elementRails && elementRails !== "array") {
        schema.arrayElementType = elementRails;
      }
    }
  }
  return schema;
}

/**
 * Normalize a column's type to the Rails alphabet trails-tsc's
 * ATTRIBUTE_TYPE_MAP keys on (`string`, `integer`, `datetime`, `text`,
 * `boolean`, ...). Prefers `sqlTypeMetadata.type` when the adapter
 * populated it; otherwise maps common SQL types to their Rails
 * equivalents. Unmapped types pass through lowercased — trails-tsc
 * falls back to `unknown` when it sees a key it doesn't recognize.
 */
function normalizeRailsType(col: AdapterColumn): string {
  // MySQL reports booleans as `tinyint(1)`. `sqlTypeMetadata.type` is the
  // unparameterized base ("tinyint") → would map to integer, losing the
  // boolean semantics. Rails treats any tinyint(1) as boolean.
  const fullSqlType = (col.sqlTypeMetadata?.sqlType ?? col.sqlType ?? "").toLowerCase();
  if (/^\s*tinyint\s*\(\s*1\s*\)/.test(fullSqlType)) return "boolean";

  // PostgreSQL array types are only reliably visible in the full SQL
  // type string (`int4[]`, `character varying[]`). The PG
  // SchemaStatements fallback exposes internal UDT names like `_int4`
  // on sqlTypeMetadata.type, which would bypass a naive
  // "candidate.endsWith('[]')" check — so detect off the full SQL
  // string instead.
  if (fullSqlType.trim().endsWith("[]")) return "array";

  // Try each candidate through the SQL_TO_RAILS map, returning the
  // first hit. PG adapter fallback sets sqlTypeMetadata.type to UDT
  // names (`timestamptz`, `_int4`) while sqlTypeMetadata.sqlType
  // carries the human-readable SQL (`timestamp with time zone`) — so
  // prefer sqlType-bearing candidates first.
  const candidates = [
    col.sqlTypeMetadata?.sqlType,
    col.sqlType,
    col.sqlTypeMetadata?.type,
    col.type,
  ];

  let fallbackBase: string | undefined;
  for (const candidate of candidates) {
    const raw = candidate?.toLowerCase().trim();
    if (!raw) continue;

    // Strip the first `(precision[, scale])` block from the string, even
    // when the type name is MULTI-WORD (`character varying(255)` →
    // `character varying`) or has trailing suffix text
    // (`timestamp(3) without time zone` → `timestamp without time zone`).
    const base = raw.replace(/\s*\([^)]*\)/, "").trim();
    fallbackBase ??= base;

    const railsType = SQL_TO_RAILS[base];
    if (railsType) return railsType;
  }

  return fallbackBase ?? "value";
}

// Common SQL → Rails type names. Covers the types adapters most
// frequently return raw (when SqlTypeMetadata.type isn't populated),
// including PG-specific variants like `int4` / `varchar` and MySQL's
// `tinyint(1)` → boolean pattern (handled via base="tinyint" →
// "integer" — MySQL's connector often supplies metadata explicitly for
// tinyint(1) booleans so we leave that path alone).
const SQL_TO_RAILS: Record<string, string> = {
  // strings
  varchar: "string",
  "character varying": "string",
  char: "string",
  character: "string",
  // large text
  text: "text",
  longtext: "text",
  mediumtext: "text",
  tinytext: "text",
  // integers
  int: "integer",
  int2: "integer",
  int4: "integer",
  int8: "big_integer",
  integer: "integer",
  smallint: "integer",
  bigint: "big_integer",
  tinyint: "integer",
  mediumint: "integer",
  // floats / decimals
  float: "float",
  "double precision": "float",
  double: "float",
  real: "float",
  numeric: "decimal",
  decimal: "decimal",
  // booleans
  bool: "boolean",
  boolean: "boolean",
  // dates / times
  date: "date",
  datetime: "datetime",
  timestamp: "datetime",
  "timestamp without time zone": "datetime",
  "timestamp with time zone": "datetime",
  time: "time",
  "time without time zone": "time",
  "time with time zone": "time",
  // binary
  blob: "binary",
  bytea: "binary",
  binary: "binary",
  varbinary: "binary",
  // PG extras
  uuid: "uuid",
  json: "json",
  jsonb: "jsonb",
  hstore: "hstore",
  inet: "inet",
  cidr: "cidr",
  citext: "citext",
};
