// Residual schema-type vocabulary left after RFC 0059 phase 4 deleted the
// `defineSchema` DSL (PR #4587). This file no longer defines or emits any
// schema — it holds only the `ColumnSpec` / `Schema` / `IndexSpec` type family
// and the small pure helpers (`COLUMN_TYPE_MAP_*`, `serialIdType`, `columnsOf`,
// `supportsExpressionIndex`, `isWrappedSchema`) that `canonical-schema.ts` and
// the `TEST_SCHEMA` importers still consume.

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

export type PrimitiveColumnSpec =
  | "string"
  | "text"
  | "integer"
  | "big_integer"
  | "float"
  | "decimal"
  | "boolean"
  | "datetime"
  | "date"
  | "time"
  | "binary"
  | "json";

/**
 * PostgreSQL-only column types. Using one of these against a non-PG adapter
 * throws — there is no useful fallback (e.g. SQLite has no HSTORE), and
 * silently swapping in a different type would let test schemas drift away
 * from the production DDL they're meant to mirror.
 */
export type PgPrimitiveColumnSpec = "citext" | "hstore" | "uuid" | "interval" | "oid";

export type AnyPrimitiveColumnSpec = PrimitiveColumnSpec | PgPrimitiveColumnSpec;

export type ColumnSpec =
  | AnyPrimitiveColumnSpec
  | {
      type: AnyPrimitiveColumnSpec;
      limit?: number;
      /**
       * Decimal/numeric total digits (mirrors Rails' `precision:`).
       * Pass `null` to suppress the MySQL auto-precision-6 upgrade and emit a
       * bare `DATETIME` column — required when pairing with a `DEFAULT
       * CURRENT_TIMESTAMP` function default (mirrors Rails `precision: nil`).
       */
      precision?: number | null;
      /** Decimal/numeric fractional digits (mirrors Rails' `scale:`). */
      scale?: number;
      references?: string;
      null?: boolean;
      default?: unknown;
      /** SQL expression emitted verbatim as `DEFAULT <expr>` (e.g. `"CURRENT_TIMESTAMP"`). */
      defaultFunction?: string;
      primary?: boolean;
      /**
       * PostgreSQL array column (`INTEGER[]`, `TEXT[]`, etc.). PG-only;
       * setting `array: true` against a non-PG adapter throws.
       */
      array?: boolean;
    };

/**
 * A table-level index, mirroring Rails' `t.index`. `columns` is a column name,
 * a list of names, or a raw expression string (e.g. `"(lower(external_id))"`)
 * kept verbatim with the name derived from its `\w+` runs. Pass `where` for a
 * partial index.
 */
export interface IndexSpec {
  columns: string | string[];
  unique?: boolean;
  where?: string;
  name?: string;
  /**
   * Sort order, mirroring Rails' `t.index order:`. A scalar (`"desc"`) applies
   * to every column; a per-column map (`{ rating: "desc" }`) targets one. Only
   * emitted where the adapter supports index sort order (all three do); the
   * dumper collapses a uniform map back to the scalar Rails form.
   */
  order?: string | Record<string, string>;
  /**
   * Sub-part prefix length, mirroring Rails' `t.index length:`. Scalar or
   * per-column map. MySQL-only DDL — other adapters drop the option (matching
   * Rails' `quoted_columns_for_index`).
   */
  length?: number | Record<string, number>;
  /**
   * Emit a `NULLS NOT DISTINCT` unique index (Rails `nulls_not_distinct:`).
   * PostgreSQL ≥ 15 only; unsupported adapters drop the clause.
   */
  nullsNotDistinct?: boolean;
  /** Index access method, mirroring Rails' `t.index using:` (e.g. `"btree"`). */
  using?: string;
  /** Index type keyword, mirroring Rails' `t.index type:` (e.g. MySQL `"fulltext"`). */
  type?: string;
  /**
   * Restrict the index to these adapters, mirroring schema.rb's inline
   * `if ActiveRecord::TestCase.current_adapter?(...)` gate (e.g. the MySQL-only
   * `full_name_index`, schema.rb:426). Omitted = all adapters.
   */
  adapters?: readonly string[];
}

/**
 * A table-level foreign key, mirroring Rails' `t.foreign_key :to_table,
 * column:, primary_key:, name:`. Emitted inline in the CREATE TABLE — the only
 * form SQLite accepts (it has no `ALTER TABLE … ADD CONSTRAINT`).
 */
export interface ForeignKeySpec {
  toTable: string;
  column: string;
  primaryKey?: string;
  name?: string;
}

export interface WrappedTableSchema {
  columns: Record<string, ColumnSpec>;
  /**
   * Table-level primary key. `string[]` builds a composite PK constraint
   * over the listed columns (which are also marked NOT NULL, matching
   * Rails semantics — SQLite otherwise lets NULLs slip through composite
   * PKs). `false` builds the table without a PK. A single-string form is
   * intentionally not supported — pass `[name]` for a single-column
   * non-`id` primary key. Omit to keep the default auto-increment `id`.
   *
   * Together with {@link indexes}, this disambiguates the wrapper shape from
   * the legacy `Record<colName, ColumnSpec>` shape: a wrapper carries `columns`
   * plus at least one of `primaryKey` / `indexes`.
   */
  primaryKey?: string[] | false;
  /**
   * Table-level indexes, emitted via `add_index` after the table is created
   * (mirrors Rails' `t.index`). Names default to Rails' `index_<table>_on_<cols>`.
   */
  indexes?: IndexSpec[];
  /**
   * Table-level foreign keys, emitted inline in the CREATE TABLE (mirrors
   * Rails' `t.foreign_key`).
   */
  foreignKeys?: ForeignKeySpec[];
}
export type TableSchema = Record<string, ColumnSpec> | WrappedTableSchema;
export type Schema = Record<string, TableSchema>;

/** @internal */
const WRAPPER_KEYS = new Set(["columns", "primaryKey", "indexes", "foreignKeys"]);

/** @internal */
export function isWrappedSchema(table: TableSchema): table is WrappedTableSchema {
  // The wrapper and the legacy `Record<colName, ColumnSpec>` shape both
  // permit a key called `columns`, so discrimination needs an unambiguous
  // signal. We use the presence of `primaryKey` — the wrapper's sole
  // purpose is to set a table-level PK, so making it required also
  // collapses the only ambiguity: a legacy single-column table
  // `{ columns: { type: "string" } }` is structurally identical to a
  // wrapper with one column named `type`, but it cannot have `primaryKey`,
  // so it stays unambiguously legacy.
  //
  // Rule:
  //   1. `columns` is present and an object map.
  //   2. At least one of `primaryKey` / `indexes` / `foreignKeys` is present
  //      (the disambiguator from the legacy shape).
  //   3. Any present `primaryKey` / `indexes` / `foreignKeys` is wrapper-shaped.
  //   4. No other top-level keys.
  if (!table || typeof table !== "object") return false;
  const candidate = (table as { columns?: unknown }).columns;
  if (!candidate || typeof candidate !== "object") return false;
  const hasPk = "primaryKey" in table;
  const hasIndexes = "indexes" in table;
  const hasForeignKeys = "foreignKeys" in table;
  if (!hasPk && !hasIndexes && !hasForeignKeys) return false;
  if (hasPk) {
    const pk = (table as { primaryKey?: unknown }).primaryKey;
    // Validate primaryKey is the wrapper-shaped value; otherwise this is a
    // legacy table that happens to have a column called `primaryKey`.
    if (pk !== false && !Array.isArray(pk)) return false;
    if (Array.isArray(pk) && !pk.every((v) => typeof v === "string")) return false;
  }
  if (hasIndexes && !Array.isArray((table as { indexes?: unknown }).indexes)) return false;
  if (hasForeignKeys && !Array.isArray((table as { foreignKeys?: unknown }).foreignKeys)) {
    return false;
  }
  for (const key of Object.keys(table)) {
    if (!WRAPPER_KEYS.has(key)) return false;
  }
  return true;
}

/**
 * The `createTable({ id: { type } })` value for a single-column serial PK,
 * preserving the declared INTEGER width across adapters:
 *   - PG: `integer` → `serial` (INT4), `big_integer` → `bigserial` (INT8).
 *   - MySQL: `integer` → INT, `big_integer` → BIGINT (both AUTO_INCREMENT).
 *   - SQLite: always `integer` — only `INTEGER PRIMARY KEY` aliases the rowid,
 *     so a `bigint` declaration would lose auto-increment.
 *
 * @internal
 */
export function serialIdType(spec: ColumnSpec | undefined, adapterName: string): string {
  const type = typeof spec === "string" ? spec : spec?.type;
  const isBig = type === "big_integer";
  if (adapterName === "postgres") return isBig ? "bigserial" : "serial";
  if (adapterName === "sqlite") return "integer";
  return isBig ? "bigint" : "integer";
}

/** @internal */
export function columnsOf(table: TableSchema): Record<string, ColumnSpec> {
  return isWrappedSchema(table) ? table.columns : table;
}

/**
 * Whether the adapter supports expression indexes. The getter reads
 * `databaseVersion` synchronously (SQLite ≥ 3.9, MySQL ≥ 8.0.13, never MariaDB),
 * which throws before the version cache is populated — so prime it via the
 * async `getDatabaseVersion()` first. A missing/throwing getter is treated as
 * unsupported, so we skip the expression index rather than emit invalid DDL.
 *
 * @internal
 */
export async function supportsExpressionIndex(adapter: DatabaseAdapter): Promise<boolean> {
  const a = adapter as {
    supportsExpressionIndex?: () => boolean;
    getDatabaseVersion?: () => Promise<unknown>;
  };
  if (typeof a.supportsExpressionIndex !== "function") return false;
  try {
    if (typeof a.getDatabaseVersion === "function") await a.getDatabaseVersion();
    return a.supportsExpressionIndex();
  } catch {
    return false;
  }
}

/** @internal */
export const COLUMN_TYPE_MAP_PG: Record<AnyPrimitiveColumnSpec, string> = {
  string: "string",
  text: "text",
  integer: "integer",
  big_integer: "bigint",
  float: "float",
  decimal: "decimal",
  boolean: "boolean",
  datetime: "datetime",
  date: "date",
  time: "time",
  binary: "binary",
  json: "json",
  // PG-only types — passed straight through to PostgreSQLAdapter#typeToSql,
  // which routes them via NATIVE_DATABASE_TYPES.
  citext: "citext",
  hstore: "hstore",
  uuid: "uuid",
  interval: "interval",
  oid: "oid",
};

// MySQL/MariaDB accepts native DATETIME/DATE/TIME/JSON columns. AR serializes
// Temporal.PlainTime values for TIME columns, so time attributes round-trip
// with the correct type. Without native TIME, an introspected TIME-as-VARCHAR
// resolves to StringType and multiparameter time assignment yields a raw string
// (same problem that "date: string" caused before PR #4141 fixed it for DATE).
// json maps to the native MySQL JSON column: mysql2 emits `json` via
// MysqlSchemaCreation#typeToSql and registers `json` -> JsonType in its type
// map (abstract-mysql-adapter.ts), so introspected canonical json columns
// (e.g. admin_users.json_options) resolve to JsonType and round-trip on
// mysql:8 — the same StringType deviation that afflicted DATE/TIME. `binary`
// routes through the native BLOB mapping so encrypted binary attributes
// round-trip (BinaryData-wrapped ciphertext needs a binary column). PG-only
// types are deliberately absent — this map is keyed by `PrimitiveColumnSpec`,
// which excludes them.
/** @internal */
export const COLUMN_TYPE_MAP_MYSQL: Record<PrimitiveColumnSpec, string> = {
  string: "string",
  text: "text",
  integer: "integer",
  big_integer: "bigint",
  float: "float",
  decimal: "decimal",
  boolean: "boolean",
  datetime: "datetime",
  date: "date",
  time: "time",
  binary: "binary",
  json: "json",
};

// SQLite has type affinity rules but accepts native datetime/date/time/json
// type names — they store as TEXT/BLOB under the hood while preserving the
// declared type for schema reflection (so the type registry resolves to
// SQLiteDateTimeType/DateType/TimeType/JsonType on load). datetime/date/time/
// json all now inherit the native names from COLUMN_TYPE_MAP_MYSQL; `binary`
// inherits the BLOB mapping likewise.
/** @internal */
export const COLUMN_TYPE_MAP_SQLITE: Record<PrimitiveColumnSpec, string> = {
  ...COLUMN_TYPE_MAP_MYSQL,
};
