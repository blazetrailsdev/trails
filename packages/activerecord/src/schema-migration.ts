/**
 * Schema migration — tracks which migrations have been run.
 *
 * Mirrors: ActiveRecord::SchemaMigration
 */

import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { ActiveRecordError } from "./errors.js";
import type { Base } from "./base.js";
import { Table, SelectManager, InsertManager, DeleteManager, Nodes, star } from "@blazetrails/arel";

// `base.js` is deliberately NOT imported for its value here. Rails resolves
// `ActiveRecord::Base` at call time via autoload (schema_migration.rb:50), so an
// import edge would be a trails invention — and a load-time edge back into
// `base.ts` puts it in an import cycle whose evaluation order then decides
// whether base.ts's own mixin wiring reads initialized bindings. base.ts
// pushes itself in at the end of its module body instead.
let _base: typeof Base | undefined;

/** @internal Called from base.ts at module init. */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

export class NullSchemaMigration {
  async createTable(): Promise<void> {}
  async dropTable(): Promise<void> {}

  async allVersions(): Promise<string[]> {
    return [];
  }

  async count(): Promise<number> {
    return 0;
  }

  async tableExists(): Promise<boolean> {
    return false;
  }
}

export class SchemaMigration {
  private _adapter: DatabaseAdapter;
  readonly arelTable: Table;

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
    this.arelTable = new Table(this.tableName);
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
    if (await this._adapter.tableExists(this.tableName)) return;
    await this._adapter.createTable(this.tableName, { id: false }, (t) => {
      t.string(this.primaryKey, this._adapter.internalStringOptionsForPrimaryKey());
    });
  }

  // Rails: drop_table table_name, if_exists: true (schema_migration.rb:64-66).
  async dropTable(): Promise<void> {
    await this._adapter.dropTable(this.tableName, { ifExists: true });
  }

  // Rails: connection.insert(im, "...", primary_key, version) — returns the
  // supplied id value, i.e. the version (schema_migration.rb:19-25).
  async createVersion(version: string): Promise<string> {
    const im = new InsertManager(this.arelTable);
    im.insert([[this.arelTable.get(this.primaryKey), version]]);
    await this._adapter.execute(this._adapter.toSql(im));
    return version;
  }

  async deleteVersion(version: string): Promise<void> {
    const dm = new DeleteManager();
    dm.from(this.arelTable);
    dm.where(this.arelTable.get(this.primaryKey).eq(version));
    await this._adapter.execute(this._adapter.toSql(dm));
  }

  async deleteAllVersions(): Promise<void> {
    const vers = await this.versions();
    for (const version of vers) {
      await this.deleteVersion(version);
    }
  }

  async versions(): Promise<string[]> {
    const sm = new SelectManager(this.arelTable);
    sm.project(this.arelTable.get(this.primaryKey));
    sm.order(this.arelTable.get(this.primaryKey).asc());
    const rows = await this._adapter.execute(this._adapter.toSql(sm));
    return rows.map((row) => String(row[this.primaryKey]).trim());
  }

  async allVersions(): Promise<string[]> {
    return this.versions();
  }

  async count(): Promise<number> {
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.NamedFunction("COUNT", [star]).as("cnt"));
    const rows = await this._adapter.execute(this._adapter.toSql(sm));
    return Number(rows[0]?.cnt ?? 0);
  }

  async tableExists(): Promise<boolean> {
    try {
      const sm = new SelectManager(this.arelTable);
      sm.project(new Nodes.Quoted(1));
      sm.take(1);
      await this._adapter.execute(this._adapter.toSql(sm));
      return true;
    } catch {
      return false;
    }
  }

  async recordVersion(version: string): Promise<void> {
    await this.createVersion(version);
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
