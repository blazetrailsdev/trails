/**
 * Schema migration — tracks which migrations have been run.
 *
 * Mirrors: ActiveRecord::SchemaMigration
 */

import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool, NullPool } from "./connection-adapters/abstract/connection-pool.js";
import { ActiveRecordError } from "./errors.js";
import { first } from "./ruby-first.js";
import type { Base } from "./base.js";
import { Table, SelectManager, InsertManager, DeleteManager, Nodes, star } from "@blazetrails/arel";

let _base: typeof Base | undefined;

/**
 * @internal Receives `ActiveRecord::Base` from base.ts at module init. Rails
 * resolves the constant at call time via autoload (schema_migration.rb:50), so base.rb
 * is not required here; in ESM a value import of `base.js` would instead be a
 * load-time edge putting base.ts in an import cycle, leaving its own
 * module-evaluation-time mixin wiring dependent on the graph's entry order.
 */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

export class NullSchemaMigration {}

export class SchemaMigration {
  private _pool: ConnectionPool | NullPool;
  readonly arelTable: Table;

  /**
   * Mirrors `SchemaMigration#initialize` (`schema_migration.rb:14-17`) — it
   * holds a pool.
   */
  constructor(pool: ConnectionPool | NullPool) {
    this._pool = pool;
    this.arelTable = new Table(this.tableName);
  }

  /** Mirrors `@pool.with_connection` (`schema_migration.rb:22-24`). */
  private async _withConnection<T>(
    fn: (connection: DatabaseAdapter) => T | Promise<T>,
  ): Promise<T> {
    return await this._pool.withConnection(fn);
  }

  get primaryKey(): string {
    return "version";
  }

  // Rails: "#{Base.table_name_prefix}#{Base.schema_migrations_table_name}
  // #{Base.table_name_suffix}" (schema_migration.rb:50).
  get tableName(): string {
    const base = baseClass();
    return `${base.tableNamePrefix}${base.schemaMigrationsTableName}${base.tableNameSuffix}`;
  }

  // Rails: create_table(table_name, id: false) { |t| t.string :version,
  // **connection.internal_string_options_for_primary_key } behind a
  // table_exists? guard (schema_migration.rb:53-61). Going through create_table
  // — rather than hand-built DDL — is what gets the adapter's own
  // TableDefinition and identifier quoting.
  async createTable(): Promise<void> {
    await this._withConnection(async (connection) => {
      if (await connection.tableExists(this.tableName)) return;
      await connection.createTable(this.tableName, { id: false }, (t) => {
        t.string(this.primaryKey, connection.internalStringOptionsForPrimaryKey());
      });
    });
  }

  // Rails: drop_table table_name, if_exists: true (schema_migration.rb:64-66).
  async dropTable(): Promise<void> {
    await this._withConnection((connection) =>
      connection.dropTable(this.tableName, { ifExists: true }),
    );
  }

  // Rails: connection.insert(im, "...", primary_key, version) — answers the
  // supplied id value, i.e. the version (schema_migration.rb:19-25).
  async createVersion(version: string): Promise<string> {
    const im = new InsertManager(this.arelTable);
    im.insert([[this.arelTable.get(this.primaryKey), version]]);
    return (await this._withConnection((connection) =>
      connection.insert(im, `${this.constructor.name} Create`, this.primaryKey, version),
    )) as string;
  }

  // Rails: connection.delete(dm, "#{self.class} Destroy") (schema_migration.rb:27-33).
  async deleteVersion(version: string): Promise<void> {
    const dm = new DeleteManager(this.arelTable);
    dm.where(this.arelTable.get(this.primaryKey).eq(version));
    await this._withConnection((connection) =>
      connection.delete(dm, `${this.constructor.name} Destroy`),
    );
  }

  async deleteAllVersions(): Promise<void> {
    // Rails checks the connection in eagerly around the whole walk
    // (`schema_migration.rb:35-42`) rather than once per `delete_version`.
    await this._withConnection(async () => {
      const vers = await this.versions();
      for (const version of vers) {
        await this.deleteVersion(version);
      }
    });
  }

  async versions(): Promise<string[]> {
    const sm = new SelectManager(this.arelTable);
    sm.project(this.arelTable.get(this.primaryKey));
    sm.order(this.arelTable.get(this.primaryKey).asc());
    return (await this._withConnection((connection) =>
      connection.selectValues(sm, `${this.constructor.name} Load`),
    )) as string[];
  }

  async allVersions(): Promise<string[]> {
    return this.versions();
  }

  /**
   * `schema_migration.rb:91-98`. Rails ends the body in `.first`, ported as `ruby-first.ts`'s
   * `first(values)` since JS arrays have no `first`.
   *
   * `COUNT(*)` always yields exactly one row, and Rails' `.first` would answer
   * `nil` for an empty set, not zero, so there is no `?? 0` fallback.
   *
   * PG's `int8` decode answers a `bigint` past `Number.MAX_SAFE_INTEGER`, so
   * the value is a `number` here only because neither `schema_migrations` nor
   * `ar_internal_metadata` can hold 2^53 rows. Ruby's Integer is arbitrary
   * precision and needs no such reading; this carries the bignum under a
   * `number` the way `IntegerType#narrowBigInt` (`integer.ts:218-221`) does.
   *
   */
  async count(): Promise<number> {
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.Count([star]));
    const values = await this._withConnection((connection) =>
      connection.selectValues(sm, `${this.constructor.name} Count`),
    );
    return first(values) as number;
  }

  // Rails: connection.data_source_exists?(table_name) (schema_migration.rb:100-104).
  async tableExists(): Promise<boolean | null> {
    return await this._withConnection((connection) => connection.dataSourceExists(this.tableName));
  }

  static normalizeMigrationNumber(number: string | number): string {
    const n = parseInt(String(number), 10);
    return String(isNaN(n) ? 0 : n).padStart(3, "0");
  }

  async normalizedVersions(): Promise<string[]> {
    const vers = await this.versions();
    return vers.map((v) => SchemaMigration.normalizeMigrationNumber(v));
  }

  async integerVersions(): Promise<number[]> {
    const vers = await this.versions();
    return vers.map((v) => {
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    });
  }
}
