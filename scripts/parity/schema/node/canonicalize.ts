/**
 * Lowers a native dump (raw adapter introspection data) into the neutral
 * CanonicalSchema format defined in scripts/parity/canonical/schema.schema.json.
 *
 * Pure function — no I/O, no side effects.
 */

import type {
  CanonicalColumn,
  CanonicalIndex,
  CanonicalSchema,
  CanonicalTable,
  CanonicalType,
} from "../../canonical/types.js";

export interface NativeColumn {
  name: string;
  /** Raw SQL type string as returned by PRAGMA table_info (e.g. "INTEGER", "TEXT"). */
  sqlType: string;
  primaryKey: boolean;
  /** true = nullable */
  null: boolean;
  /** Raw default string from PRAGMA table_info dflt_value, or null. */
  default: string | null;
  limit: number | null;
  precision: number | null;
  scale: number | null;
}

export interface NativeIndex {
  name: string;
  columns: string[];
  unique: boolean;
  where?: string | null;
}

export interface NativeTable {
  /** Columns in declaration order (as returned by introspectColumns). */
  columns: NativeColumn[];
  indexes: NativeIndex[];
  /**
   * Primary key column names in PK-position order (from adapter.primaryKey,
   * which sorts by PRAGMA table_info `pk` field). Empty array = no PK.
   */
  primaryKeyColumns: string[];
}

/** Output shape of dump.ts — keyed by table name. */
export type NativeDump = Record<string, NativeTable>;

// SQLite PRAGMA type strings → canonical CanonicalType.
// Keys are lowercased. Only types that appear in SQLite fixtures are
// required here; extend when adding PG/MySQL fixtures.
const SQL_TO_CANONICAL: Record<string, CanonicalType> = {
  integer: "integer",
  int: "integer",
  bigint: "bigint",
  text: "text",
  varchar: "string",
  "character varying": "string",
  real: "float",
  float: "float",
  double: "float",
  "double precision": "float",
  numeric: "decimal",
  decimal: "decimal",
  blob: "binary",
  binary: "binary",
  bytea: "binary",
  boolean: "boolean",
  bool: "boolean",
  datetime: "datetime",
  timestamp: "datetime",
  date: "date",
  time: "time",
  json: "json",
  jsonb: "json",
};

const FILTERED_TABLES = new Set(["schema_migrations", "ar_internal_metadata"]);
const AUTOINDEX_PREFIX = "sqlite_autoindex_";

function toCanonicalType(sqlType: string, table: string, column: string): CanonicalType {
  const base = sqlType
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)/, "");
  const mapped = SQL_TO_CANONICAL[base];
  if (!mapped) {
    throw new Error(
      `canonicalize: unknown SQL type "${sqlType}" on ${table}.${column} — add it to SQL_TO_CANONICAL`,
    );
  }
  return mapped;
}

/** Coerce a raw PRAGMA dflt_value string to a canonical scalar. */
function coerceDefault(raw: string | null): string | number | boolean | null {
  if (raw === null) return null;
  // Strip surrounding single quotes: 'hello' → "hello"
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "NULL") return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && raw.trim() !== "") return n;
  return raw;
}

function canonicalizeTable(name: string, native: NativeTable): CanonicalTable {
  // Primary key — use primaryKeyColumns (pk-position order from adapter.primaryKey)
  // rather than filtering columns array, so composite PK ordering matches Rails.
  const pkCols = native.primaryKeyColumns;
  const primaryKey: CanonicalTable["primaryKey"] =
    pkCols.length === 0
      ? null
      : pkCols.length === 1
        ? pkCols[0]!
        : (pkCols as [string, string, ...string[]]);

  // Columns in declaration order (D1)
  const columns: CanonicalColumn[] = native.columns.map((col) => ({
    name: col.name,
    type: toCanonicalType(col.sqlType, name, col.name),
    null: col.null,
    default: coerceDefault(col.default),
    limit: col.limit,
    precision: col.precision,
    scale: col.scale,
  }));

  // Indexes: filter autoindexes (D3), sort by name (D1)
  const indexes: CanonicalIndex[] = native.indexes
    .filter((idx) => !idx.name.startsWith(AUTOINDEX_PREFIX))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((idx) => {
      if (idx.columns.length === 0) {
        throw new Error(`canonicalize: index "${idx.name}" on table "${name}" has no columns`);
      }
      return {
        name: idx.name,
        columns: idx.columns as [string, ...string[]],
        unique: idx.unique,
        where: idx.where ?? null,
      };
    });

  return { name, primaryKey, columns, indexes };
}

/**
 * Lower a NativeDump into a CanonicalSchema.
 *
 * - Filters schema_migrations / ar_internal_metadata (D2).
 * - Sorts tables by name (D1).
 * - Preserves column declaration order (D1).
 * - Filters sqlite_autoindex_* (D3).
 * - Throws on unknown SQL types (D4).
 */
export function canonicalize(native: NativeDump): CanonicalSchema {
  const tables: CanonicalTable[] = Object.keys(native)
    .filter((name) => !FILTERED_TABLES.has(name))
    .sort()
    .map((name) => canonicalizeTable(name, native[name]!));

  return { version: 1, tables };
}
