/**
 * Internal metadata — stores internal key-value data like environment name.
 *
 * Mirrors: ActiveRecord::InternalMetadata
 */

import { Temporal } from "@blazetrails/date";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool, NullPool } from "./connection-adapters/abstract/connection-pool.js";
import type { BoundSchemaReflection } from "./connection-adapters/schema-cache.js";
import { NoMethodError } from "@blazetrails/activemodel";
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
 * Mirrors: ActiveRecord::InternalMetadata::NullInternalMetadata
 * (`internal_metadata.rb:13-14`), an empty class. It is a null object in the
 * identity sense only — callers branch on which class they got rather than
 * calling methods that silently no-op.
 * @internal
 */
export class NullInternalMetadata {}

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
    return await this._pool.withConnection(fn);
  }

  /**
   * Mirrors ActiveRecord::InternalMetadata#enabled?
   * (`internal_metadata.rb:35-36`) — `@pool.db_config.use_metadata_table?`.
   *
   * A `NullPool` answers `NULL_CONFIG`, whose every key is undefined (Rails'
   * `NullConfig#method_missing` returns nil, `abstract/connection_pool.rb:17-22`),
   * so a pool-less collaborator reads as disabled here exactly as it does in
   * Ruby. The return type carries that nil the way Ruby's predicate does.
   */
  get enabled(): boolean | null | undefined {
    return this._pool.dbConfig.useMetadataTable;
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
    // Rails: return unless enabled?; drop_table table_name, if_exists: true
    // (internal_metadata.rb:100-104).
    if (!this.enabled) return;
    await this._withConnection((connection) =>
      connection.dropTable(this.tableName, { ifExists: true }),
    );
  }

  /** Mirrors `InternalMetadata#[]` (`internal_metadata.rb:47-54`). */
  async get(key: string): Promise<string | null> {
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
    const dm = new DeleteManager();
    dm.from(this.arelTable);
    // Rails: connection.delete(dm, "#{self.class} Destroy") (internal_metadata.rb:58-62).
    await this._withConnection((connection) =>
      connection.delete(dm, `${this.constructor.name} Destroy`),
    );
  }

  /**
   * `internal_metadata.rb:64-71`. Rails ends the body in `.first`; Ruby's `Enumerable#first` has no JS
   * array counterpart, so the single value is read as `values[0]`.
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
   * @missingRailsCall first — Enumerable#first; a JS array indexes as values[0].
   */
  async count(): Promise<number> {
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.Count([star]));
    const values = await this._withConnection((connection) =>
      connection.selectValues(sm, `${this.constructor.name} Count`),
    );
    return values[0] as number;
  }

  /**
   * Mirrors: ActiveRecord::InternalMetadata#table_exists?
   * (`internal_metadata.rb:108-110`) — `@pool.schema_cache.data_source_exists?`.
   * Unlike `SchemaMigration#table_exists?` this reads through the pool's schema
   * cache, not a checked-out connection; Rails has that difference deliberately.
   * @internal
   */
  async tableExists(): Promise<boolean> {
    const schemaCache: BoundSchemaReflection | null = this._pool.schemaCache;
    if (schemaCache === null) {
      // Ruby's NullPool#schema_cache answers nil
      // (`abstract/connection_pool.rb:38`), so the send in
      // `@pool.schema_cache.data_source_exists?` raises NoMethodError on nil;
      // JS would answer a TypeError, so raise Ruby's error here.
      throw new NoMethodError("undefined method 'data_source_exists?' for nil");
    }
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
