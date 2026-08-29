import { Temporal } from "@blazetrails/date";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool, NullPool } from "./connection-adapters/abstract/connection-pool.js";
import type { BoundSchemaReflection } from "./connection-adapters/schema-cache.js";
import { NoMethodError } from "@blazetrails/activemodel";
import type { Base } from "./base.js";
import { EnvironmentStorageError } from "./migration.js";
import { ActiveRecordError } from "./errors.js";
import { first } from "./ruby-first.js";
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

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

/** @internal */
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

  get tableName(): string {
    const base = baseClass();
    return `${base.tableNamePrefix}${base.internalMetadataTableName}${base.tableNameSuffix}`;
  }

  constructor(pool: ConnectionPool | NullPool) {
    this._pool = pool;
    this.arelTable = new Table(this.tableName);
  }

  private async _withConnection<T>(
    fn: (connection: DatabaseAdapter) => T | Promise<T>,
  ): Promise<T> {
    return await this._pool.withConnection(fn);
  }

  get enabled(): boolean | null | undefined {
    return this._pool.dbConfig.useMetadataTable;
  }

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
    if (!this.enabled) return;
    await this._withConnection((connection) =>
      connection.dropTable(this.tableName, { ifExists: true }),
    );
  }

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
    const dm = new DeleteManager(this.arelTable);
    await this._withConnection((connection) =>
      connection.delete(dm, `${this.constructor.name} Destroy`),
    );
  }

  async count(): Promise<number> {
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.Count([star()]));
    const values = await this._withConnection((connection) =>
      connection.selectValues(sm, `${this.constructor.name} Count`),
    );
    return first(values) as number;
  }

  async tableExists(): Promise<boolean> {
    const schemaCache: BoundSchemaReflection | null = this._pool.schemaCache;
    if (schemaCache === null) {
      throw new NoMethodError("undefined method 'data_source_exists?' for nil");
    }
    return (await schemaCache.dataSourceExists(this.tableName)) ?? false;
  }

  async deleteAll(): Promise<void> {
    return this.deleteAllEntries();
  }

  private currentTime(connection: DatabaseAdapter): string {
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
    sm.project(star());
    sm.where(this.arelTable.get(this.primaryKey).eq(new Nodes.BindParam(key)));
    sm.order(this.arelTable.get(this.primaryKey).asc());
    sm.take(1);
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
    const um = new UpdateManager(this.arelTable);
    um.set([
      [this.arelTable.get(this.valueKey), newValue],
      [this.arelTable.get("updated_at"), this.currentTime(connection)],
    ]);
    um.where(this.arelTable.get(this.primaryKey).eq(key));
    await connection.update(um, `${this.constructor.name} Update`);
  }
}
