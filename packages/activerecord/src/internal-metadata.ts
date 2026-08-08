/**
 * Internal metadata — stores internal key-value data like environment name.
 *
 * Mirrors: ActiveRecord::InternalMetadata
 */

import { Temporal } from "@blazetrails/date";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool, NullPool } from "./connection-adapters/abstract/connection-pool.js";
import type { Base } from "./base.js";
import { EnvironmentStorageError } from "./migration.js";
import { ActiveRecordError } from "./errors.js";
import {
  Table,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  star,
} from "@blazetrails/arel";

let _base: typeof Base | undefined;

/**
 * @internal Receives `ActiveRecord::Base` from base.ts at module init. Rails
 * resolves the constant at call time via autoload (internal_metadata.rb:32), so base.rb
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

/**
 * Stand-in for InternalMetadata when metadata storage is disabled
 * (`use_metadata_table: false`). All methods short-circuit and the
 * physical `ar_internal_metadata` table is never touched.
 *
 * Mirrors: ActiveRecord::InternalMetadata::NullInternalMetadata
 * @internal
 */
export class NullInternalMetadata {
  async createTable(): Promise<void> {}
  async dropTable(): Promise<void> {}

  async get(_key: string): Promise<string | null> {
    return null;
  }

  /** @internal */
  async tableExists(): Promise<boolean> {
    return false;
  }

  get enabled(): boolean {
    return false;
  }
}

export class InternalMetadata {
  private _pool: ConnectionPool | NullPool;
  readonly arelTable: Table;

  get primaryKey(): string {
    return "key";
  }

  get valueKey(): string {
    return "value";
  }

  // Rails: "#{Base.table_name_prefix}#{Base.internal_metadata_table_name}
  // #{Base.table_name_suffix}" (internal_metadata.rb:32).
  get tableName(): string {
    const base = baseClass();
    return `${base.tableNamePrefix}${base.internalMetadataTableName}${base.tableNameSuffix}`;
  }

  /**
   * Mirrors `InternalMetadata#initialize` (`internal_metadata.rb:18-21`) — it
   * holds a pool.
   */
  constructor(pool: ConnectionPool | NullPool) {
    this._pool = pool;
    this.arelTable = new Table(this.tableName);
  }

  /** Mirrors `@pool.with_connection` (`internal_metadata.rb:41-45`). */
  private async _withConnection<T>(
    fn: (connection: DatabaseAdapter) => T | Promise<T>,
  ): Promise<T> {
    return await (this._pool as ConnectionPool).withConnection(fn);
  }

  /**
   * Mirrors ActiveRecord::InternalMetadata#enabled?
   * (`internal_metadata.rb:35-36`) — `@pool.db_config.use_metadata_table?`.
   *
   * Deviation: a `NullPool` answers `NULL_CONFIG`, whose every key is undefined
   * (Rails' `NullConfig#method_missing` returns nil), so Rails would read that
   * arm as disabled. Rails never gets there — its `InternalMetadata` is always
   * built from a real pool — while trails builds one over bare, NullPool-backed
   * adapters throughout the test suite and the trailties `db` commands, so the
   * absent flag has to keep `DatabaseConfig#useMetadataTable`'s default. It
   * converges once those call sites hold a pool
   * (`migration-context-collaborators-need-a-pool`).
   */
  get enabled(): boolean {
    const dbConfig = (this._pool as { dbConfig?: { useMetadataTable?: boolean } } | null)?.dbConfig;
    return dbConfig?.useMetadataTable !== false;
  }

  // Rails: create_table(table_name, id: false) { |t| t.string :key, **...; t.string
  // :value; t.timestamps } behind a table_exists? guard
  // (internal_metadata.rb:85-98). `t.timestamps` defaults to null: false, so the
  // resulting table matches the DDL this used to hand-build — but the column
  // types and quoting now come from the adapter instead of an adapterName branch.
  async createTable(): Promise<void> {
    if (!this.enabled) return;
    await this._withConnection(async (connection) => {
      if (await connection.tableExists(this.tableName)) return;
      await connection.createTable(this.tableName, { id: false }, (t) => {
        t.string("key", connection.internalStringOptionsForPrimaryKey());
        t.string("value");
        t.timestamps();
      });
    });
  }

  /**
   * Create the metadata table if needed and write the given environment
   * (and optional schema SHA1) in one call. Matches Rails'
   * `ActiveRecord::InternalMetadata#create_table_and_set_flags` — silently
   * returns when `enabled?` is false.
   */
  async createTableAndSetFlags(environment: string, schemaSha1?: string): Promise<void> {
    if (!this.enabled) return;
    await this._withConnection(async (connection) => {
      await this.createTable();
      await this.updateOrCreateEntry(connection, "environment", environment);
      if (schemaSha1 !== undefined) {
        await this.updateOrCreateEntry(connection, "schema_sha1", schemaSha1);
      }
    });
  }

  async dropTable(): Promise<void> {
    // Symmetric with createTable / createTableAndSetFlags: silently no-op
    // when metadata is disabled. Prevents a disabled instance from
    // reaching over and dropping ar_internal_metadata that another
    // config or adapter is actively using.
    if (!this.enabled) return;
    // Rails: drop_table table_name, if_exists: true (internal_metadata.rb:100-104).
    await this._withConnection((connection) =>
      connection.dropTable(this.tableName, { ifExists: true }),
    );
  }

  async get(key: string): Promise<string | null> {
    // When metadata is disabled, treat every key as unset without
    // probing ar_internal_metadata — callers shouldn't observe stale
    // rows from a previous run that had the flag enabled.
    if (!this.enabled) return null;
    return await this._withConnection(async (connection) => {
      const entry = await this.selectEntry(connection, key);
      if (!entry) return null;
      const value = entry[this.valueKey];
      if (value == null) return null;
      return String(value);
    });
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.enabled) {
      // Rails' `environment:set` raises EnvironmentStorageError when
      // internal_metadata is disabled; surface the same error here so
      // callers that attempt to write through a disabled instance fail
      // loudly rather than silently no-op. Imported statically from
      // migration.ts (the cycle is ESM-safe because EnvironmentStorageError is only used in method bodies).
      throw new EnvironmentStorageError();
    }
    await this._withConnection((connection) => this.updateOrCreateEntry(connection, key, value));
  }

  /** @internal */
  private async updateOrCreateEntry(
    connection: DatabaseAdapter,
    key: string,
    value: string,
  ): Promise<void> {
    const entry = await this.selectEntry(connection, key);
    if (entry) {
      if (entry[this.valueKey] !== value) {
        await this.updateEntry(connection, key, value);
      }
    } else {
      await this.createEntry(connection, key, value);
    }
  }

  async deleteAllEntries(): Promise<void> {
    // Symmetric with get() / tableExists() / count() / createTable() /
    // dropTable(): a disabled instance treats the store as empty — don't
    // run a DELETE that would either mutate a supposedly-invisible store
    // or throw against a missing table.
    if (!this.enabled) return;
    const dm = new DeleteManager();
    dm.from(this.arelTable);
    // Rails: connection.delete(dm, "#{self.class} Destroy") (internal_metadata.rb:58-62).
    await this._withConnection((connection) =>
      connection.delete(dm, `${this.constructor.name} Destroy`),
    );
  }

  async count(): Promise<number> {
    // Symmetric with get() / tableExists(): a disabled instance reports
    // an empty store, without probing ar_internal_metadata (which may
    // not exist, or may carry stale rows from a prior enabled run).
    if (!this.enabled) return 0;
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.NamedFunction("COUNT", [star]).as("cnt"));
    // Rails: connection.select_values(sm, "#{self.class} Count").first
    // (internal_metadata.rb:64-71).
    const values = await this._withConnection((connection) =>
      connection.selectValues(sm, `${this.constructor.name} Count`),
    );
    return Number(values[0] ?? 0);
  }

  /**
   * Mirrors: ActiveRecord::InternalMetadata#table_exists?
   * (`internal_metadata.rb:108-110`) — `@pool.schema_cache.data_source_exists?`.
   * Unlike `SchemaMigration#table_exists?` this reads through the pool's schema
   * cache, not a checked-out connection; Rails has that difference deliberately.
   * @internal
   */
  async tableExists(): Promise<boolean> {
    // When disabled, report the table as absent so callers don't
    // accidentally trust it. The physical table may still exist on disk
    // from a previous run; the flag is what drives semantic visibility.
    if (!this.enabled) return false;
    const schemaCache = (this._pool as ConnectionPool).schemaCache as {
      dataSourceExists(name: string): Promise<boolean | undefined>;
    };
    return (await schemaCache.dataSourceExists(this.tableName)) ?? false;
  }

  async deleteAll(): Promise<void> {
    return this.deleteAllEntries();
  }

  private currentTime(connection: DatabaseAdapter): string {
    // Format: "YYYY-MM-DD HH:mm:ss.SSS" — drop the trailing 'Z' and swap 'T' for ' '.
    // Truncate sub-ms (Rails uses ms-precise updated_at strings; default Temporal
    // rounding is halfExpand which would otherwise round up).
    const opts = { smallestUnit: "millisecond", roundingMode: "trunc" } as const;
    if (connection.defaultTimezone === "utc") {
      return Temporal.Now.instant().toString(opts).replace("T", " ").replace("Z", "");
    }
    return Temporal.Now.plainDateTimeISO().toString(opts).replace("T", " ");
  }

  private async selectEntry(
    connection: DatabaseAdapter,
    key: string,
  ): Promise<Record<string, unknown> | null> {
    const sm = new SelectManager(this.arelTable);
    sm.project(star);
    sm.where(this.arelTable.get(this.primaryKey).eq(key));
    sm.order(this.arelTable.get(this.primaryKey).asc());
    sm.take(1);
    // Rails: connection.select_all(sm, "#{self.class} Load").first
    // (internal_metadata.rb:155-160).
    const result = await connection.selectAll(sm, `${this.constructor.name} Load`);
    return result.first() ?? null;
  }

  private async createEntry(
    connection: DatabaseAdapter,
    key: string,
    value: string,
  ): Promise<void> {
    const im = new InsertManager(this.arelTable);
    im.insert([
      [this.arelTable.get(this.primaryKey), key],
      [this.arelTable.get(this.valueKey), value],
      [this.arelTable.get("created_at"), this.currentTime(connection)],
      [this.arelTable.get("updated_at"), this.currentTime(connection)],
    ]);
    await connection.insert(im, `${this.constructor.name} Create`, this.primaryKey, key);
  }

  private async updateEntry(
    connection: DatabaseAdapter,
    key: string,
    newValue: string,
  ): Promise<void> {
    const um = new UpdateManager();
    um.table(this.arelTable);
    um.set([
      [this.arelTable.get(this.valueKey), newValue],
      [this.arelTable.get("updated_at"), this.currentTime(connection)],
    ]);
    um.where(this.arelTable.get(this.primaryKey).eq(key));
    await connection.update(um, `${this.constructor.name} Update`);
  }
}
