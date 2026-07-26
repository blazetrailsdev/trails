import { SchemaDumper } from "../schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
// Load the adapter-layer dumper so `SchemaDumper.create` resolves the
// ConnectionAdapters subclass (the single `column_spec` emitter) for the plain
// `SchemaSource`s this helper dumps — mirroring Rails, whose dump factory is the
// adapter-layer `ConnectionAdapters::SchemaDumper.create`. `SchemaDumper` above
// stays the base class so its `ignoreTables` static is the one this helper
// saves/restores. The import registers the subclass as a side effect.
import "../connection-adapters/abstract/schema-dumper.js";

/**
 * Test-only schema-dump helpers. Mirrors Rails'
 * `ActiveRecord::SchemaDumpingHelper` (test/support/schema_dumping_helper.rb).
 *
 * Rails captures `SchemaDumper.dump(pool)` stdout; our dumper returns the
 * generated DSL string directly, so there is no `capture_io`. The
 * `SchemaDumper.ignore_tables` save/restore dance is faithful — both helpers
 * scope the global filter to a single dump and always restore it (even on
 * throw), so concurrent suites don't observe a mutated baseline.
 */

/**
 * Timeout for a whole-database dump (`dumpAllTableSchema`). The shared handler
 * DB carries ~330 canonical tables, and on PostgreSQL under CI fork load that
 * full dump runs just past vitest's 5s default and flakes. 30s is the ceiling
 * both full-dump suites apply; single-table `dumpTableSchema` cases stay on the
 * default because they ignore every table but the one named.
 */
export const FULL_DUMP_TIMEOUT_MS = 30_000;

/**
 * Dump only the named `tables` from `source`, as a schema-DSL string.
 *
 * Mirrors `SchemaDumpingHelper#dump_table_schema(*tables)`: ignore every data
 * source except the requested ones, then run a full dump. The `source` doubles
 * as Rails' connection (it enumerates the data sources) and as the dump target.
 */
export async function dumpTableSchema(source: SchemaSource, ...tables: string[]): Promise<string> {
  const oldIgnoreTables = SchemaDumper.ignoreTables;
  // Rails: `connection.data_sources - tables` (tables + views). Prefer the
  // adapter's `dataSources()` so views are also ignored; fall back to `tables()`
  // for a bare `SchemaSource` that only enumerates base tables.
  const enumerated = source as { dataSources?: () => Promise<string[]> };
  const dataSources = enumerated.dataSources
    ? await enumerated.dataSources()
    : await source.tables();
  SchemaDumper.ignoreTables = dataSources.filter((name) => !tables.includes(name));
  try {
    return await SchemaDumper.dump(source);
  } finally {
    SchemaDumper.ignoreTables = oldIgnoreTables;
  }
}

/**
 * Dump the whole schema, optionally ignoring `ignoreTables`, as a DSL string.
 *
 * Mirrors `SchemaDumpingHelper#dump_all_table_schema(ignore_tables = [])`.
 */
export async function dumpAllTableSchema(
  source: SchemaSource,
  ignoreTables: (string | RegExp)[] = [],
): Promise<string> {
  const oldIgnoreTables = SchemaDumper.ignoreTables;
  SchemaDumper.ignoreTables = ignoreTables;
  try {
    return await SchemaDumper.dump(source);
  } finally {
    SchemaDumper.ignoreTables = oldIgnoreTables;
  }
}
