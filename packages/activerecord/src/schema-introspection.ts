/**
 * Shared adapter-introspection helpers used by schema dumpers.
 *
 * Adapter-introspection helpers used by `SchemaDumper` (DSL output —
 * `db/schema.ts`) and related tooling. Every adapter carries `tables()` /
 * `columns()` / `indexes()` / `primaryKey()` from Rails'
 * `include SchemaStatements`, so these call straight through; PostgreSQL and
 * SQLite adapters override them with adapter-specific semantics (e.g. PG
 * respects the current `search_path`).
 *
 * Keeping this in one module means future changes to introspection
 * semantics stay in one place.
 */

import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { Column } from "./connection-adapters/column.js";

/** Minimal index descriptor shared by all adapters. */
export interface IntrospectedIndex {
  name: string;
  // A string for expression indexes (the raw expression), an array of column
  // names otherwise — mirrors Rails' IndexDefinition#columns.
  columns: string | string[];
  unique: boolean;
  /** Partial-index predicate; undefined when adapter does not surface it. */
  where?: string;
  /**
   * Per-column sort directions (e.g. `{ name: "desc" }`), or a single
   * direction applied to the whole index. Mirrors Rails'
   * `IndexDefinition#orders`; undefined when the adapter does not surface it.
   */
  orders?: Record<string, string> | string;
}

/** Return the table names reported by the adapter. */
export async function introspectTables(adapter: DatabaseAdapter): Promise<string[]> {
  return adapter.tables();
}

/** Return the Column objects for `table`. */
export async function introspectColumns(
  adapter: DatabaseAdapter,
  table: string,
): Promise<Column[]> {
  return adapter.columns(table);
}

/**
 * Return index descriptors for `table`. Adapter-specific semantics (like
 * SQLite's `origin === "c"` filter that excludes constraint-generated
 * autoindexes) are applied by the adapter's own override.
 */
export async function introspectIndexes(
  adapter: DatabaseAdapter,
  table: string,
): Promise<IntrospectedIndex[]> {
  return adapter.indexes(table) as Promise<IntrospectedIndex[]>;
}

/**
 * Return primary key column names for `table` in PK-position order (matching
 * Rails' `PRAGMA table_info` pk-field sort).
 *
 * Returns an empty array when the table has no primary key.
 */
export async function introspectPrimaryKey(
  adapter: DatabaseAdapter,
  table: string,
): Promise<string[]> {
  const pk = await adapter.primaryKey(table);
  if (pk === null) return [];
  return Array.isArray(pk) ? pk : [pk];
}
