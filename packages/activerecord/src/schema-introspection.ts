/**
 * Shared adapter-introspection helpers used by schema dumpers.
 *
 * Both `SchemaDumper` (DSL output — schema.ts/schema.js) and
 * `dumpSchemaColumns` (JSON output for trails-tsc --schema) need the
 * same "prefer the adapter's own tables() / columns() when available,
 * fall back to the portable SchemaStatements queries otherwise"
 * pattern. PostgreSQL and SQLite adapters implement these with
 * adapter-specific semantics (e.g. PG respects the current
 * `search_path`); SchemaStatements is the portable fallback.
 *
 * Keeping this in one module means future changes to introspection
 * semantics stay in one place and can't drift between the two dumpers.
 */

import type { DatabaseAdapter } from "./adapter.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import type { Column } from "./connection-adapters/column.js";

type AdapterWithTables = { tables(): Promise<string[]> };
type AdapterWithColumns = { columns(table: string): Promise<Column[]> };

function hasTables(a: unknown): a is AdapterWithTables {
  return typeof (a as AdapterWithTables).tables === "function";
}
function hasColumns(a: unknown): a is AdapterWithColumns {
  return typeof (a as AdapterWithColumns).columns === "function";
}

// Memoize `SchemaStatements` per-adapter so the fallback path doesn't
// reinstantiate on every call (and per-table when `adapter.columns()`
// is absent). WeakMap lets GC reclaim the helper when the adapter is
// disposed.
const SCHEMA_STATEMENTS = new WeakMap<object, SchemaStatements>();
function schemaStatementsFor(adapter: DatabaseAdapter): SchemaStatements {
  const key = adapter as unknown as object;
  let s = SCHEMA_STATEMENTS.get(key);
  if (!s) {
    s = new SchemaStatements(adapter);
    SCHEMA_STATEMENTS.set(key, s);
  }
  return s;
}

/**
 * Return the table names reported by the adapter. Uses
 * `adapter.tables()` when the adapter implements it, else falls back
 * to `new SchemaStatements(adapter).tables()` (memoized per adapter).
 */
export async function introspectTables(adapter: DatabaseAdapter): Promise<string[]> {
  if (hasTables(adapter)) return adapter.tables();
  return schemaStatementsFor(adapter).tables();
}

/**
 * Return the Column objects for `table`. Uses `adapter.columns()`
 * when implemented, else falls back to
 * `new SchemaStatements(adapter).columns(table)` (memoized per adapter
 * so a loop that dumps many tables reuses a single helper).
 */
export async function introspectColumns(
  adapter: DatabaseAdapter,
  table: string,
): Promise<Column[]> {
  if (hasColumns(adapter)) return adapter.columns(table);
  return schemaStatementsFor(adapter).columns(table);
}
