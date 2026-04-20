import type { DatabaseAdapter } from "./adapter.js";
import { Current } from "./migration.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { DatabaseConfigurations } from "./database-configurations.js";

/**
 * Look up an optional pool property without exposing the concrete
 * ConnectionPool type (pool is accessed via `(adapter as any).pool`
 * throughout the schema/migration stack; mirror that here).
 */
function adapterPool(adapter: DatabaseAdapter):
  | {
      dbConfig?: { useMetadataTable?: boolean };
    }
  | undefined {
  return (adapter as unknown as { pool?: { dbConfig?: { useMetadataTable?: boolean } } }).pool;
}

/**
 * Info hash accepted by `Schema.define`. Mirrors the Ruby
 * positional-hash arg used by Rails' `Schema.define(info = {}, &block)`.
 */
export interface SchemaDefineInfo {
  /** Schema version to mark as migrated (calls assume_migrated_upto_version). */
  version?: string | number;
  /** Environment label stored in ar_internal_metadata. Defaults to NODE_ENV. */
  environment?: string;
}

/**
 * Schema — programmatically defines a database schema using the same
 * DSL as migrations (createTable, addIndex, addColumn, dropTable, etc.).
 *
 * Mirrors: ActiveRecord::Schema — in Rails this is
 * `class Schema < Migration::Current`, so Schema inherits every
 * schema-manipulation method from Migration. Pairing with Rails here
 * means we don't duplicate a second, shallower `createTable` in this
 * file; `Schema.define(adapter, fn)` hands the block a Schema instance
 * that already exposes Migration's full DSL.
 *
 * Usage:
 *
 *   await Schema.define(adapter, async (schema) => {
 *     await schema.createTable("users", (t) => {
 *       t.string("name");
 *     });
 *     await schema.addIndex("users", "name");
 *   });
 *
 *   await Schema.define(adapter, { version: 20240101000000 }, async (schema) => { ... });
 */
export class Schema extends Current {
  /**
   * Mirrors: ActiveRecord::Schema.define. Runs the block against a
   * Schema instance (exposing Migration's DSL), then — matching
   * Rails — creates the `schema_migrations` and
   * `ar_internal_metadata` tables, sets the environment flag, and
   * (if an `info.version` is given) records that version in
   * `schema_migrations` via `assume_migrated_upto_version`.
   */
  static async define(
    adapter: DatabaseAdapter,
    fn: (schema: Schema) => void | Promise<void>,
  ): Promise<void>;
  static async define(
    adapter: DatabaseAdapter,
    info: SchemaDefineInfo,
    fn: (schema: Schema) => void | Promise<void>,
  ): Promise<void>;
  static async define(
    adapter: DatabaseAdapter,
    infoOrFn: SchemaDefineInfo | ((schema: Schema) => void | Promise<void>),
    fnOpt?: (schema: Schema) => void | Promise<void>,
  ): Promise<void> {
    const { info, fn }: { info: SchemaDefineInfo; fn: (s: Schema) => void | Promise<void> } =
      typeof infoOrFn === "function" ? { info: {}, fn: infoOrFn } : { info: infoOrFn, fn: fnOpt! };

    const schema = new Schema(adapter);
    await fn(schema);

    // Mirrors Rails' Schema::Definition#define post-block work:
    //   connection_pool.schema_migration.create_table
    //   connection.assume_migrated_upto_version(info[:version]) if info[:version]
    //   connection_pool.internal_metadata.create_table_and_set_flags(env)
    const schemaMigration = new SchemaMigration(adapter);
    await schemaMigration.createTable();
    if (info.version !== undefined) {
      // Go through SchemaStatements#assumeMigratedUptoVersion (reached
      // via the inherited Migration.schema getter) so the known
      // migration list is pulled from pool.migrationContext.migrations
      // — matches Rails' `connection.assume_migrated_upto_version`
      // (see connection-adapters/abstract/schema-statements.ts:1157).
      // Bypassing that path and calling SchemaMigration directly would
      // only record the target version without backfilling the
      // migrations between.
      await schema.schema.assumeMigratedUptoVersion(info.version);
    }
    // Honour the use_metadata_table / useMetadataTable opt-out so
    // schema loading doesn't create / stamp ar_internal_metadata when
    // the db_config has it disabled. Rails routes this through
    // `connection_pool.internal_metadata` which respects
    // db_config.use_metadata_table; we read it off pool.dbConfig here
    // (the rest of the migration stack uses the same shape — see
    // migration.ts:1440).
    const enabled = adapterPool(adapter)?.dbConfig?.useMetadataTable !== false;
    // Environment fallback chain: explicit info.environment → NODE_ENV
    // → DatabaseConfigurations.defaultEnv (which itself defaults to
    // "development" but can be overridden by the app, e.g. via
    // trailties boot). Using defaultEnv over a hard-coded literal
    // keeps Schema.define consistent with how Migrator and other
    // migration-stack pieces resolve the current environment.
    const environment =
      info.environment ?? process.env.NODE_ENV ?? DatabaseConfigurations.defaultEnv;
    const internalMetadata = new InternalMetadata(adapter, { enabled });
    await internalMetadata.createTableAndSetFlags(environment);
  }

  constructor(adapter: DatabaseAdapter) {
    super();
    this.adapter = adapter;
  }
}

/**
 * Mirrors: ActiveRecord::Schema::Definition
 */
export interface Definition {
  define(adapter: DatabaseAdapter, fn: (schema: Schema) => void | Promise<void>): Promise<void>;
}
