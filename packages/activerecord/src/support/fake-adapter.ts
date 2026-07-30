import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Column } from "../connection-adapters/column.js";
import type { SqlTypeMetadata } from "../connection-adapters/sql-type-metadata.js";
import { register } from "../connection-adapters.js";

export interface MergeColumnOptions {
  default?: unknown;
  null?: boolean;
}

/** Mirrors: FakeActiveRecordAdapter */
export class FakeActiveRecordAdapter extends AbstractAdapter {
  static readonly columns = new Map<string, Column[]>();

  /**
   * Rails' `attr_accessor :data_sources` replaces the inherited
   * `data_sources` method with a plain attribute; Ruby allows the reshape,
   * TS does not (AbstractAdapter declares `dataSources(): Promise<string[]>`).
   * The suppression keeps the Rails superclass chain and the Rails member
   * name — the alternatives are interposing a base class that drops the
   * member, or renaming it, and both lose what this port exists to preserve.
   */
  // @ts-expect-error -- deliberate Ruby-style member reshape, see above
  dataSources: string[];
  primaryKeys: Record<string, string>;

  private readonly _fakeColumns: Map<string, Column[]>;

  /**
   * Mirrors: FakeActiveRecordAdapter#initialize, minus the forwarding. Rails is
   * `def initialize(...)` + bare `super`, passing the adapter's whole argument
   * list up; trails' AbstractAdapter constructor takes none
   * (abstract-adapter.ts:706), so there is nothing to forward and the signature
   * is zero-arg. Behaviourally identical to the field initializers this
   * replaced — it exists to put the three assignments in Rails' order.
   */
  constructor() {
    super();
    this.dataSources = [];
    this.primaryKeys = {};
    this._fakeColumns = FakeActiveRecordAdapter.columns;
  }

  /**
   * Mirrors: FakeActiveRecordAdapter#primary_key. Synchronous in-memory
   * lookup where AbstractAdapter's reaches the database and returns a
   * promise; same deliberate reshape as `dataSources` above.
   */
  // @ts-expect-error -- deliberate Ruby-style member reshape, see dataSources
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
      new Column(String(name), options.default, this.fetchTypeMetadata(sqlType), options.null),
    );
  }

  /**
   * Mirrors: FakeActiveRecordAdapter#columns. Synchronous in-memory lookup
   * where AbstractAdapter's reaches the database and returns a promise; same
   * deliberate reshape as `dataSources` above.
   */
  // @ts-expect-error -- deliberate Ruby-style member reshape, see dataSources
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

  private fetchTypeMetadata(sqlType: string | null): SqlTypeMetadata {
    return this.schemaStatements().fetchTypeMetadata(sqlType);
  }
}

/** Mirrors: activerecord/test/cases/helper.rb:46 */
export function registerFakeAdapter(): void {
  register("fake", async () => FakeActiveRecordAdapter as unknown as new () => AbstractAdapter);
}
