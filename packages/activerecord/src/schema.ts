import { getEnv, isPresent } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Current } from "./migration.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { DatabaseConfigurations } from "./database-configurations.js";

/**
 * Info hash accepted by `Schema.define`. Mirrors the Ruby
 * positional-hash arg used by Rails' `Schema.define(info = {}, &block)`.
 */
export interface SchemaDefineInfo {
  /** Schema version to mark as migrated (calls assume_migrated_upto_version). */
  version?: string | number;
  /** Environment label stored in ar_internal_metadata. Defaults to TRAILS_ENV (or NODE_ENV fallback). */
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
 * file; `Schema.define(fn)` hands the block a Schema instance
 * that already exposes Migration's full DSL.
 *
 * Usage:
 *
 *   await Schema.define(async (schema) => {
 *     await schema.createTable("users", (t) => {
 *       t.string("name");
 *     });
 *     await schema.addIndex("users", "name");
 *   });
 *
 *   await Schema.define({ version: 20240101000000 }, async (schema) => { ... });
 */
export class Schema<A extends DatabaseAdapter = DatabaseAdapter> extends Current<A> {
  /**
   * Mirrors: ActiveRecord::Schema::Definition::ClassMethods#define
   * (schema.rb:50-52) — `new.define(info, &block)`.
   */
  static async define<A extends DatabaseAdapter = DatabaseAdapter>(
    fn: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void>;
  static async define<A extends DatabaseAdapter = DatabaseAdapter>(
    info: SchemaDefineInfo,
    fn: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void>;
  static async define<A extends DatabaseAdapter = DatabaseAdapter>(
    infoOrFn: SchemaDefineInfo | ((schema: Schema<A>) => void | Promise<void>),
    fnOpt?: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void> {
    const {
      info,
      block,
    }: { info: SchemaDefineInfo; block: (s: Schema<A>) => void | Promise<void> } =
      typeof infoOrFn === "function"
        ? { info: {}, block: infoOrFn }
        : { info: infoOrFn, block: fnOpt! };

    await new Schema<A>().define(info, block);
  }

  /**
   * Mirrors: ActiveRecord::Schema::Definition#define (schema.rb:54-62) — the
   * whole definition runs inside `connection_pool.with_connection do |connection|`,
   * the block against this Schema instance (Ruby's `instance_eval`), and
   * `assume_migrated_upto_version` on the yielded connection.
   */
  async define(
    info: SchemaDefineInfo,
    block: (schema: Schema<A>) => void | Promise<void>,
  ): Promise<void> {
    await this.connectionPool.withConnection(async (connection) => {
      this.connection = connection;
      await block(this as Schema<A>);

      const schemaMigration = new SchemaMigration(this.connectionPool);
      await schemaMigration.createTable();
      if (isPresent(info.version)) {
        await connection.assumeMigratedUptoVersion(info.version!);
      }
      // Rails reads `connection_pool.migration_context.current_environment`;
      // trails resolves the same label through the chain the rest of the
      // migration stack uses (explicit → TRAILS_ENV → NODE_ENV → default).
      const currentEnvironment =
        info.environment ??
        getEnv("TRAILS_ENV") ??
        getEnv("NODE_ENV") ??
        DatabaseConfigurations.defaultEnv;
      const internalMetadata = new InternalMetadata(this.connectionPool);
      await internalMetadata.createTableAndSetFlags(currentEnvironment);
    });
  }

  constructor(adapter?: A) {
    super();
    this.connection = adapter;
  }
}

/**
 * Mirrors: ActiveRecord::Schema::Definition
 */
export interface Definition {
  define(info: SchemaDefineInfo, block: (schema: Schema) => void | Promise<void>): Promise<void>;
}
