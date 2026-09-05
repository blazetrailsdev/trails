import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Column } from "../connection-adapters/column.js";
import type { SqlTypeMetadata } from "../connection-adapters/sql-type-metadata.js";
import { SchemaStatements } from "../connection-adapters/abstract/schema-statements.js";
import { register } from "../connection-adapters.js";

export interface MergeColumnOptions {
  default?: unknown;
  null?: boolean;
}

export class FakeActiveRecordAdapter extends AbstractAdapter {
  static readonly columns = new Map<string, Column[]>();

  // @ts-expect-error -- attr_accessor :data_sources reshapes the inherited method into an attribute
  dataSources: string[];
  primaryKeys: Record<string, string>;

  readonly #columns: Map<string, Column[]>;

  constructor() {
    super();
    this.dataSources = [];
    this.primaryKeys = {};
    this.#columns = (this.constructor as typeof FakeActiveRecordAdapter).columns;
  }

  // @ts-expect-error -- synchronous in-memory lookup where the inherited one returns a promise
  primaryKey(table: string): string {
    return this.primaryKeys[table] ?? "id";
  }

  mergeColumn(
    tableName: string,
    name: string,
    sqlType: string | null = null,
    options: MergeColumnOptions = {},
  ): void {
    this.columns(tableName).push(
      new Column(name, options.default, this.fetchTypeMetadata(sqlType), options.null),
    );
  }

  // @ts-expect-error -- synchronous in-memory lookup where the inherited one returns a promise
  columns(tableName: string): Column[] {
    const existing = this.#columns.get(tableName);
    if (existing) return existing;
    const created: Column[] = [];
    this.#columns.set(tableName, created);
    return created;
  }

  async dataSourceExists(): Promise<boolean> {
    return true;
  }

  async active(): Promise<boolean> {
    return true;
  }

  private fetchTypeMetadata(sqlType: string | null): SqlTypeMetadata {
    return SchemaStatements.prototype.fetchTypeMetadata.call(
      this as unknown as SchemaStatements,
      sqlType,
    );
  }
}

export function registerFakeAdapter(): void {
  register("fake", async () => FakeActiveRecordAdapter as unknown as new () => AbstractAdapter);
}
