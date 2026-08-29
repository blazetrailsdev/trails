import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool, NullPool } from "./connection-adapters/abstract/connection-pool.js";
import { ActiveRecordError } from "./errors.js";
import { first } from "./ruby-first.js";
import type { Base } from "./base.js";
import { Table, SelectManager, InsertManager, DeleteManager, Nodes, star } from "@blazetrails/arel";

let _base: typeof Base | undefined;

/** @internal */
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

  constructor(pool: ConnectionPool | NullPool) {
    this._pool = pool;
    this.arelTable = new Table(this.tableName);
  }

  private async _withConnection<T>(
    fn: (connection: DatabaseAdapter) => T | Promise<T>,
  ): Promise<T> {
    return await this._pool.withConnection(fn);
  }

  get primaryKey(): string {
    return "version";
  }

  get tableName(): string {
    const base = baseClass();
    return `${base.tableNamePrefix}${base.schemaMigrationsTableName}${base.tableNameSuffix}`;
  }

  async createTable(): Promise<void> {
    await this._withConnection(async (connection) => {
      if (await connection.tableExists(this.tableName)) return;
      await connection.createTable(this.tableName, { id: false }, (t) => {
        t.string(this.primaryKey, connection.internalStringOptionsForPrimaryKey());
      });
    });
  }

  async dropTable(): Promise<void> {
    await this._withConnection((connection) =>
      connection.dropTable(this.tableName, { ifExists: true }),
    );
  }

  async createVersion(version: string): Promise<string> {
    const im = new InsertManager(this.arelTable);
    im.insert([[this.arelTable.get(this.primaryKey), version]]);
    return (await this._withConnection((connection) =>
      connection.insert(im, `${this.constructor.name} Create`, this.primaryKey, version),
    )) as string;
  }

  async deleteVersion(version: string): Promise<void> {
    const dm = new DeleteManager(this.arelTable);
    dm.where(this.arelTable.get(this.primaryKey).eq(version));
    await this._withConnection((connection) =>
      connection.delete(dm, `${this.constructor.name} Destroy`),
    );
  }

  async deleteAllVersions(): Promise<void> {
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

  async count(): Promise<number> {
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.Count([star()]));
    const values = await this._withConnection((connection) =>
      connection.selectValues(sm, `${this.constructor.name} Count`),
    );
    return first(values) as number;
  }

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
