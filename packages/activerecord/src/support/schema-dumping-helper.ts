// Dump through the adapter-layer dumper — Rails' only construction path is
// `connection.create_schema_dumper`, i.e. `ConnectionAdapters::SchemaDumper.create`
// (connection_adapters/abstract/schema_dumper.rb:8-10), the subclass that defines
// `column_spec`. The base class is still where `ignoreTables` lives, and static
// inheritance means the value this helper sets there is what the instance reads.
import { SchemaDumper as BaseSchemaDumper } from "../schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { SchemaDumper } from "../connection-adapters/abstract/schema-dumper.js";

/**
 * Test-only schema-dump helpers. Mirrors Rails'
 * `ActiveRecord::SchemaDumpingHelper` (test/support/schema_dumping_helper.rb).
 *
 * Rails captures `SchemaDumper.dump(pool)` stdout; our dump stream is the
 * array of generated DSL lines, so there is no `capture_io`. The
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
 * Dump only the named `tables` from `pool`, as a schema-DSL string.
 *
 * Mirrors `SchemaDumpingHelper#dump_table_schema(*tables)`: ignore every data
 * source except the requested ones, then run a full dump. Rails reads its
 * `pool` off `ActiveRecord::Base.connection_pool`; trails takes it as the
 * leading argument, and it doubles as Rails' `connection` (it enumerates the
 * data sources) and as the dump target.
 */
export async function dumpTableSchema(pool: SchemaSource, ...tables: string[]): Promise<string> {
  const oldIgnoreTables = BaseSchemaDumper.ignoreTables;
  // Rails: `connection.data_sources - tables` (tables + views). Prefer the
  // adapter's `dataSources()` so views are also ignored; fall back to `tables()`
  // for a bare `SchemaSource` that only enumerates base tables.
  const enumerated = pool as { dataSources?: () => Promise<string[]> };
  const dataSources = enumerated.dataSources ? await enumerated.dataSources() : await pool.tables();
  BaseSchemaDumper.ignoreTables = dataSources.filter((name) => !tables.includes(name));
  try {
    return (await SchemaDumper.dump(pool)).join("\n");
  } finally {
    BaseSchemaDumper.ignoreTables = oldIgnoreTables;
  }
}

/**
 * Dump the whole schema, optionally ignoring `ignoreTables`, as a DSL string.
 *
 * Mirrors `SchemaDumpingHelper#dump_all_table_schema(ignore_tables = [])`.
 */
export async function dumpAllTableSchema(
  pool: SchemaSource,
  ignoreTables: (string | RegExp)[] = [],
): Promise<string> {
  const oldIgnoreTables = BaseSchemaDumper.ignoreTables;
  BaseSchemaDumper.ignoreTables = ignoreTables;
  try {
    return (await SchemaDumper.dump(pool)).join("\n");
  } finally {
    BaseSchemaDumper.ignoreTables = oldIgnoreTables;
  }
}
