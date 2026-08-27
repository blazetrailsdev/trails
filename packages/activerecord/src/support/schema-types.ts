import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { ReferentialAction } from "../connection-adapters/abstract/schema-definitions.js";

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

export type PgPrimitiveColumnSpec = "citext" | "hstore" | "uuid" | "interval" | "oid";

export type AnyPrimitiveColumnSpec = PrimitiveColumnSpec | PgPrimitiveColumnSpec;

export type ColumnSpec =
  | AnyPrimitiveColumnSpec
  | {
      type: AnyPrimitiveColumnSpec;
      limit?: number;
      precision?: number | null;
      scale?: number;
      references?: string;
      null?: boolean;
      default?: unknown;
      defaultFunction?: string;
      primary?: boolean;
      array?: boolean;
    };

export interface IndexSpec {
  columns: string | string[];
  unique?: boolean;
  where?: string;
  name?: string;
  order?: string | Record<string, string>;
  length?: number | Record<string, number>;
  nullsNotDistinct?: boolean;
  using?: string;
  type?: string;
  adapters?: readonly string[];
}

export interface ForeignKeySpec {
  toTable: string;
  column: string;
  primaryKey?: string;
  name?: string;
  onDelete?: ReferentialAction;
  deferrable?: "immediate" | "deferred" | false;
}

export interface WrappedTableSchema {
  columns: Record<string, ColumnSpec>;
  primaryKey?: string[] | false;
  indexes?: IndexSpec[];
  foreignKeys?: ForeignKeySpec[];
}
export type TableSchema = Record<string, ColumnSpec> | WrappedTableSchema;
export type Schema = Record<string, TableSchema>;

/** @internal */
const WRAPPER_KEYS = new Set(["columns", "primaryKey", "indexes", "foreignKeys"]);

export function isWrappedSchema(table: TableSchema): table is WrappedTableSchema {
  if (!table || typeof table !== "object") return false;
  const candidate = (table as { columns?: unknown }).columns;
  if (!candidate || typeof candidate !== "object") return false;
  const hasPk = "primaryKey" in table;
  const hasIndexes = "indexes" in table;
  const hasForeignKeys = "foreignKeys" in table;
  if (!hasPk && !hasIndexes && !hasForeignKeys) return false;
  if (hasPk) {
    const pk = (table as { primaryKey?: unknown }).primaryKey;
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

export function serialIdType(spec: ColumnSpec | undefined, adapterName: string): string {
  const type = typeof spec === "string" ? spec : spec?.type;
  const isBig = type === "big_integer";
  if (adapterName === "postgres") return isBig ? "bigserial" : "serial";
  if (adapterName === "sqlite") return "integer";
  return isBig ? "bigint" : "integer";
}

export function columnsOf(table: TableSchema): Record<string, ColumnSpec> {
  return isWrappedSchema(table) ? table.columns : table;
}

export async function supportsExpressionIndex(adapter: DatabaseAdapter): Promise<boolean> {
  const a = adapter as { supportsExpressionIndex?: () => Promise<boolean> };
  if (typeof a.supportsExpressionIndex !== "function") return false;
  try {
    return await a.supportsExpressionIndex();
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
  citext: "citext",
  hstore: "hstore",
  uuid: "uuid",
  interval: "interval",
  oid: "oid",
};

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

/** @internal */
export const COLUMN_TYPE_MAP_SQLITE: Record<PrimitiveColumnSpec, string> = {
  ...COLUMN_TYPE_MAP_MYSQL,
};
