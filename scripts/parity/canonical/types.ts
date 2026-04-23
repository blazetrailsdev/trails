export type CanonicalType =
  | "string"
  | "text"
  | "integer"
  | "bigint"
  | "float"
  | "decimal"
  | "datetime"
  | "date"
  | "time"
  | "boolean"
  | "binary"
  | "json";

export interface CanonicalColumn {
  name: string;
  type: CanonicalType;
  /** true when the column is nullable */
  null: boolean;
  /** Literal default value; null when there is no default */
  default: string | number | boolean | null;
  limit: number | null;
  precision: number | null;
  scale: number | null;
}

export interface CanonicalIndex {
  name: string;
  /** Column names in index declaration order (at least one) */
  columns: [string, ...string[]];
  unique: boolean;
  /** Partial-index predicate, or null */
  where: string | null;
}

export interface CanonicalTable {
  name: string;
  /** string = single-column PK, tuple of ≥2 = composite PK, null = no PK */
  primaryKey: string | [string, string, ...string[]] | null;
  /** Columns in declaration order */
  columns: CanonicalColumn[];
  /** Explicit indexes sorted by name ASC; sqlite_autoindex_* excluded */
  indexes: CanonicalIndex[];
}

export interface CanonicalSchema {
  version: 1;
  /** User tables sorted by name ASC */
  tables: CanonicalTable[];
}
