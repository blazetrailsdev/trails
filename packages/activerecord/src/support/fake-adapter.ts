import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Column } from "../connection-adapters/column.js";
import type { SqlTypeMetadata } from "../connection-adapters/sql-type-metadata.js";
import { register } from "../connection-adapters.js";

/**
 * Rails' fake adapter redefines inherited members with incompatible shapes:
 * `attr_accessor :data_sources` turns the `data_sources` method into a plain
 * attribute, and `primary_key` / `columns` / `active?` become synchronous
 * in-memory lookups where AbstractAdapter's reach the database. TS forbids
 * narrowing an inherited member that way, so the base is widened with those
 * members dropped — the alternative is renaming them, which would lose the
 * Rails names this port exists to preserve.
 */
const FakeAdapterBase = AbstractAdapter as unknown as new () => Omit<
  AbstractAdapter,
  "dataSources" | "primaryKey" | "columns" | "active"
>;

interface MergeColumnOptions {
  default?: unknown;
  null?: boolean;
}

/** Mirrors: FakeActiveRecordAdapter */
export class FakeActiveRecordAdapter extends FakeAdapterBase {
  static readonly columns = new Map<string, Column[]>();

  dataSources: string[] = [];
  primaryKeys: Record<string, string> = {};

  private readonly _fakeColumns = FakeActiveRecordAdapter.columns;

  /** Mirrors: FakeActiveRecordAdapter#primary_key */
  primaryKey(table: string): string {
    return this.primaryKeys[table] ?? "id";
  }

  /** Mirrors: FakeActiveRecordAdapter#merge_column */
  mergeColumn(
    tableName: string,
    name: string,
    sqlType: string | null = null,
    options: MergeColumnOptions = {},
  ): void {
    this.columns(tableName).push(
      new Column(
        String(name),
        options.default,
        this.fetchTypeMetadata(sqlType ?? ""),
        options.null,
      ),
    );
  }

  /** Mirrors: FakeActiveRecordAdapter#columns */
  columns(tableName: string): Column[] {
    const existing = this._fakeColumns.get(tableName);
    if (existing) return existing;
    const created: Column[] = [];
    this._fakeColumns.set(tableName, created);
    return created;
  }

  /** Mirrors: FakeActiveRecordAdapter#data_source_exists? */
  dataSourceExists(): boolean {
    return true;
  }

  /** Mirrors: FakeActiveRecordAdapter#active? */
  get active(): boolean {
    return true;
  }

  private fetchTypeMetadata(sqlType: string): SqlTypeMetadata {
    return (this as unknown as AbstractAdapter).schemaStatements().fetchTypeMetadata(sqlType);
  }
}

/** Mirrors: activerecord/test/cases/helper.rb:46 */
export function registerFakeAdapter(): void {
  register("fake", async () => FakeActiveRecordAdapter as unknown as new () => AbstractAdapter);
}
