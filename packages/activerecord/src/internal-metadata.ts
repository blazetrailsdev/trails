/**
 * Internal metadata — stores internal key-value data like environment name.
 *
 * Mirrors: ActiveRecord::InternalMetadata
 */

import type { DatabaseAdapter } from "./adapter.js";
import { detectAdapterName } from "./adapter-name.js";
import { quoteIdentifier, quoteTableName } from "./connection-adapters/abstract/quoting.js";
import { EnvironmentStorageError } from "./migration-errors.js";
import {
  Table,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  star,
} from "@blazetrails/arel";

export class NullInternalMetadata {
  async createTable(): Promise<void> {}
  async dropTable(): Promise<void> {}

  async get(_key: string): Promise<string | null> {
    return null;
  }

  async tableExists(): Promise<boolean> {
    return false;
  }

  get enabled(): boolean {
    return false;
  }
}

export class InternalMetadata {
  static readonly TABLE_NAME = "ar_internal_metadata";
  private _adapter: DatabaseAdapter;
  readonly arelTable: Table;

  private get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return detectAdapterName(this._adapter);
  }

  private _q(name: string): string {
    return quoteIdentifier(name, this._adapterName);
  }

  get primaryKey(): string {
    return "key";
  }

  get valueKey(): string {
    return "value";
  }

  get tableName(): string {
    return InternalMetadata.TABLE_NAME;
  }

  private _enabled: boolean;

  constructor(adapter: DatabaseAdapter, options: { enabled?: boolean } = {}) {
    this._adapter = adapter;
    this.arelTable = new Table(this.tableName);
    this._enabled = options.enabled ?? true;
  }

  /**
   * Whether metadata storage is enabled for this configuration.
   *
   * Mirrors ActiveRecord::InternalMetadata#enabled? — false only when the
   * db_config opts out via `use_metadata_table: false`. Defaults to true.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  async createTable(): Promise<void> {
    if (!this._enabled) return;
    const tsType = this._adapterName === "postgres" ? "TIMESTAMP" : "DATETIME";
    const q = (n: string) => this._q(n);
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS ${quoteTableName(this.tableName, this._adapterName)} (` +
        `${q("key")} VARCHAR(255) NOT NULL PRIMARY KEY, ` +
        `${q("value")} VARCHAR(255), ` +
        `${q("created_at")} ${tsType} NOT NULL, ` +
        `${q("updated_at")} ${tsType} NOT NULL)`,
    );
  }

  /**
   * Create the metadata table if needed and write the given environment
   * (and optional schema SHA1) in one call. Matches Rails'
   * `ActiveRecord::InternalMetadata#create_table_and_set_flags` — silently
   * returns when `enabled?` is false.
   */
  async createTableAndSetFlags(environment: string, schemaSha1?: string): Promise<void> {
    if (!this._enabled) return;
    await this.createTable();
    await this.set("environment", environment);
    if (schemaSha1 !== undefined) await this.set("schema_sha1", schemaSha1);
  }

  async dropTable(): Promise<void> {
    // Symmetric with createTable / createTableAndSetFlags: silently no-op
    // when metadata is disabled. Prevents a disabled instance from
    // reaching over and dropping ar_internal_metadata that another
    // config or adapter is actively using.
    if (!this._enabled) return;
    await this._adapter.executeMutation(
      `DROP TABLE IF EXISTS ${quoteTableName(this.tableName, this._adapterName)}`,
    );
  }

  async get(key: string): Promise<string | null> {
    // When metadata is disabled, treat every key as unset without
    // probing ar_internal_metadata — callers shouldn't observe stale
    // rows from a previous run that had the flag enabled.
    if (!this._enabled) return null;
    const entry = await this.selectEntry(key);
    if (!entry) return null;
    const value = entry[this.valueKey];
    if (value == null) return null;
    return String(value);
  }

  async set(key: string, value: string): Promise<void> {
    if (!this._enabled) {
      // Rails' `environment:set` raises EnvironmentStorageError when
      // internal_metadata is disabled; surface the same error here so
      // callers that attempt to write through a disabled instance fail
      // loudly rather than silently no-op. Imported statically from
      // migration-errors.ts to avoid a circular dep with migration.ts.
      throw new EnvironmentStorageError();
    }
    const existing = await this.selectEntry(key);
    if (existing) {
      if (existing[this.valueKey] !== value) {
        await this.updateEntry(key, value);
      }
    } else {
      await this.createEntry(key, value);
    }
  }

  async deleteAllEntries(): Promise<void> {
    // Symmetric with get() / tableExists() / count() / createTable() /
    // dropTable(): a disabled instance treats the store as empty — don't
    // run a DELETE that would either mutate a supposedly-invisible store
    // or throw against a missing table.
    if (!this._enabled) return;
    const dm = new DeleteManager();
    dm.from(this.arelTable);
    await this._adapter.executeMutation(dm.toSql());
  }

  async count(): Promise<number> {
    // Symmetric with get() / tableExists(): a disabled instance reports
    // an empty store, without probing ar_internal_metadata (which may
    // not exist, or may carry stale rows from a prior enabled run).
    if (!this._enabled) return 0;
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.NamedFunction("COUNT", [star]).as("cnt"));
    const rows = await this._adapter.execute(sm.toSql());
    return Number(rows[0]?.cnt ?? 0);
  }

  async tableExists(): Promise<boolean> {
    // When disabled, report the table as absent so callers don't
    // accidentally trust it. The physical table may still exist on disk
    // from a previous run; the flag is what drives semantic visibility.
    if (!this._enabled) return false;
    try {
      const sm = new SelectManager(this.arelTable);
      sm.project(new Nodes.Quoted(1));
      sm.take(1);
      await this._adapter.execute(sm.toSql());
      return true;
    } catch {
      return false;
    }
  }

  async deleteAll(): Promise<void> {
    return this.deleteAllEntries();
  }

  private currentTime(): string {
    return new Date().toISOString().replace("T", " ").replace("Z", "");
  }

  private async selectEntry(key: string): Promise<Record<string, unknown> | null> {
    const sm = new SelectManager(this.arelTable);
    sm.project(star);
    sm.where(this.arelTable.get(this.primaryKey).eq(key));
    sm.order(this.arelTable.get(this.primaryKey).asc());
    sm.take(1);
    const rows = await this._adapter.execute(sm.toSql());
    return rows[0] ?? null;
  }

  private async createEntry(key: string, value: string): Promise<void> {
    const now = this.currentTime();
    const im = new InsertManager(this.arelTable);
    im.insert([
      [this.arelTable.get(this.primaryKey), key],
      [this.arelTable.get(this.valueKey), value],
      [this.arelTable.get("created_at"), now],
      [this.arelTable.get("updated_at"), now],
    ]);
    await this._adapter.executeMutation(im.toSql());
  }

  private async updateEntry(key: string, newValue: string): Promise<void> {
    const now = this.currentTime();
    const um = new UpdateManager();
    um.table(this.arelTable);
    um.set([
      [this.arelTable.get(this.valueKey), newValue],
      [this.arelTable.get("updated_at"), now],
    ]);
    um.where(this.arelTable.get(this.primaryKey).eq(key));
    await this._adapter.executeMutation(um.toSql());
  }
}
