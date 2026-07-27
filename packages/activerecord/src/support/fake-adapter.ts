/**
 * TS mirror of Rails' test-support `FakeActiveRecordAdapter`
 * (activerecord/test/support/fake_adapter.rb).
 *
 * Registered suite-wide under the name `"fake"` — the trails analogue of
 * `cases/helper.rb:46`'s
 * `ActiveRecord::ConnectionAdapters.register("fake", "FakeActiveRecordAdapter", …)`.
 * Models that only need a column list without a real database (Rails' `Contact`
 * via `ContactFakeColumns`) connect through it.
 */

import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Column } from "../connection-adapters/column.js";
import type { SqlTypeMetadata } from "../connection-adapters/sql-type-metadata.js";
import { register } from "../connection-adapters.js";

/**
 * Rails' fake adapter deliberately redefines inherited members with
 * incompatible shapes: `attr_accessor :data_sources` turns the `data_sources`
 * *method* into a plain attribute, and `primary_key` / `columns` become
 * synchronous in-memory lookups where AbstractAdapter's hit the database.
 * TS forbids narrowing an inherited member that way, so the base is widened
 * with those three members dropped — the alternative is renaming them, which
 * would lose the Rails names this port exists to preserve.
 */
const FakeAdapterBase = AbstractAdapter as unknown as new () => Omit<
  AbstractAdapter,
  "dataSources" | "primaryKey" | "columns" | "active"
>;

interface MergeColumnOptions {
  default?: unknown;
  null?: boolean;
}

/**
 * Mirrors: FakeActiveRecordAdapter
 *
 * Rails keeps the synthetic column list in a class-level
 * `@columns = Hash.new { |h, k| h[k] = [] }` that every instance shares
 * (`@columns = self.class.columns` in `initialize`), so columns merged through
 * one connection are visible to the next. The static `columns` map below is
 * that shared hash.
 */
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
    const columns = this._fakeColumns.get(tableName) ?? [];
    columns.push(
      new Column(
        String(name),
        options.default,
        this.fetchTypeMetadata(sqlType ?? ""),
        options.null,
      ),
    );
    this._fakeColumns.set(tableName, columns);
  }

  /** Mirrors: FakeActiveRecordAdapter#columns */
  columns(tableName: string): Column[] {
    const existing = this._fakeColumns.get(tableName);
    if (existing) return existing;
    // Ruby's `Hash.new { |h, k| h[k] = [] }` default block: reading an unknown
    // table installs (and returns) a live empty array, so a later
    // `merge_column` on the same key appends to what the reader received.
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

register("fake", async () => FakeActiveRecordAdapter as unknown as new () => AbstractAdapter);
