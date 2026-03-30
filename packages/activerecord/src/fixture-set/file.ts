/**
 * ActiveRecord fixture loading and management.
 *
 * Mirrors: ActiveRecord::FixtureSet
 *
 * Fixtures provide a way to define test data in a declarative format
 * (typically YAML/JSON) and load it into the database for tests.
 */

import type { DatabaseAdapter } from "../adapter.js";
import { quoteIdentifier, quoteTableName } from "../connection-adapters/abstract/quoting.js";
import { detectAdapterName } from "../adapter-name.js";
import { type ReflectionProxy, HasManyThroughProxy } from "./table-row.js";
import { TableRows } from "./table-rows.js";
import { RenderContext } from "./render-context.js";
import { encryptFixtureData } from "../encryption/encrypted-fixtures.js";

export { identify, compositeIdentify } from "./identify.js";

/**
 * Mirrors: ActiveRecord::FixtureSet::File
 *
 * Reads and parses fixture data from a file (YAML in Rails, JSON/objects in TS).
 */
export class File {
  private _data: Record<string, Record<string, unknown>>;

  constructor(data: Record<string, Record<string, unknown>>) {
    this._data = data;
  }

  get rows(): Array<[string, Record<string, unknown>]> {
    return Object.entries(this._data);
  }

  get labels(): string[] {
    return Object.keys(this._data);
  }

  static parse(data: Record<string, Record<string, unknown>>): File {
    return new File(data);
  }
}

/**
 * A set of fixtures loaded from data (typically parsed from YAML).
 *
 * Mirrors: ActiveRecord::FixtureSet
 */
export class FixtureSet {
  readonly tableName: string;
  private _fixtures: Map<string, Record<string, unknown>>;
  private _renderContext?: RenderContext;
  private _encryptedAttributes?: string[];
  private _encrypt?: (value: unknown) => unknown;

  constructor(
    tableName: string,
    data: Record<string, Record<string, unknown>>,
    options: {
      renderContext?: RenderContext;
      encryptedAttributes?: string[];
      encrypt?: (value: unknown) => unknown;
    } = {},
  ) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`Invalid fixture data for "${tableName}": expected an object`);
    }
    this.tableName = tableName;
    this._renderContext = options.renderContext;
    this._encryptedAttributes = options.encryptedAttributes;
    this._encrypt = options.encrypt;
    if ((this._encryptedAttributes != null) !== (this._encrypt != null)) {
      throw new Error(
        `Invalid encryption configuration for fixtures on "${tableName}": ` +
          "`encryptedAttributes` and `encrypt` must be provided together.",
      );
    }
    this._fixtures = new Map();
    const defaults = data["DEFAULTS"] ?? {};
    for (const [label, attrs] of Object.entries(data)) {
      if (label === "DEFAULTS") continue;
      let row = { ...defaults, ...attrs };
      if (this._renderContext) {
        row = this._renderTemplates(row, label);
      }
      this._fixtures.set(label, row);
    }
  }

  private _renderTemplates(row: Record<string, unknown>, label: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" && value.includes("${")) {
        result[key] = this._renderContext!.render(value, { label });
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  get size(): number {
    return this._fixtures.size;
  }

  get(label: string): Record<string, unknown> | undefined {
    return this._fixtures.get(label);
  }

  forEach(callback: (label: string, fixture: Record<string, unknown>) => void): void {
    for (const [label, fixture] of this._fixtures) {
      callback(label, fixture);
    }
  }

  [Symbol.iterator](): IterableIterator<[string, Record<string, unknown>]> {
    return this._fixtures.entries();
  }

  labels(): string[] {
    return Array.from(this._fixtures.keys());
  }

  /**
   * Generate fixture rows with deterministic IDs.
   * If a fixture doesn't have a primary key value, one is generated
   * from the label using identify().
   */
  toRows(
    options: {
      primaryKey?: string;
      associations?: ReflectionProxy[];
    } = {},
  ): Array<Record<string, unknown>> {
    return this._buildRows(options).rows;
  }

  /**
   * Insert all fixture rows into the database.
   * Resolves association labels to foreign key IDs if associations are provided.
   *
   * Mirrors: ActiveRecord::FixtureSet#insert
   */
  async insertAll(
    adapter: DatabaseAdapter,
    options: { primaryKey?: string; associations?: ReflectionProxy[] } = {},
  ): Promise<void> {
    const { rows: rawRows, joinRowsByTable } = this._buildRows(options);
    const rows = this._applyEncryption(rawRows);
    if (rows.length === 0) return;
    await this._insertRows(adapter, rows);
    for (const [table, batch] of joinRowsByTable) {
      await this._insertRows(adapter, batch, table);
    }
  }

  /**
   * Delete all rows from the fixture's table, then insert fixtures.
   * Callers should wrap in a transaction if atomicity is needed.
   *
   * Mirrors: ActiveRecord::FixtureSet#create_fixtures (truncate + insert)
   */
  async loadInto(
    adapter: DatabaseAdapter,
    options: { primaryKey?: string; associations?: ReflectionProxy[] } = {},
  ): Promise<void> {
    const { rows: rawRows, joinRowsByTable } = this._buildRows(options);
    const rows = this._applyEncryption(rawRows);
    const adapterName = detectAdapterName(adapter);
    const quotedTable = quoteTableName(this.tableName, adapterName);
    const joinTablesToClear = new Set(joinRowsByTable.keys());
    if (options.associations) {
      for (const assoc of options.associations) {
        if (assoc instanceof HasManyThroughProxy) {
          joinTablesToClear.add(assoc.joinTable);
        }
      }
    }
    for (const table of [...joinTablesToClear].sort()) {
      await adapter.executeMutation(`DELETE FROM ${quoteTableName(table, adapterName)}`);
    }
    await adapter.executeMutation(`DELETE FROM ${quotedTable}`);
    await this._insertRows(adapter, rows);
    for (const [table, batch] of joinRowsByTable) {
      await this._insertRows(adapter, batch, table);
    }
  }

  private _buildRows(options: { primaryKey?: string; associations?: ReflectionProxy[] } = {}): {
    rows: Array<Record<string, unknown>>;
    joinRowsByTable: Map<string, Array<Record<string, unknown>>>;
  } {
    const data: Record<string, Record<string, unknown>> = {};
    for (const [label, attrs] of this._fixtures) {
      data[label] = attrs;
    }
    const tableRows = new TableRows(this.tableName, data, options);
    const rows = tableRows.toRecords();
    const joinRowsByTable = new Map<string, Array<Record<string, unknown>>>();
    for (const jr of tableRows.joinRows()) {
      let batch = joinRowsByTable.get(jr.table);
      if (!batch) {
        batch = [];
        joinRowsByTable.set(jr.table, batch);
      }
      batch.push(jr.row);
    }
    return { rows, joinRowsByTable };
  }

  private _applyEncryption(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    if (this._encryptedAttributes && this._encrypt) {
      return rows.map((row) => encryptFixtureData(row, this._encryptedAttributes!, this._encrypt!));
    }
    return rows;
  }

  private async _insertRows(
    adapter: DatabaseAdapter,
    rows: Array<Record<string, unknown>>,
    tableName?: string,
  ): Promise<void> {
    if (rows.length === 0) return;
    const adapterName = detectAdapterName(adapter);
    const quotedTable = quoteTableName(tableName ?? this.tableName, adapterName);

    for (const row of rows) {
      const rowColumns = Object.keys(row);
      if (rowColumns.length === 0) continue;
      const quotedCols = rowColumns.map((c) => quoteIdentifier(c, adapterName)).join(", ");
      const placeholders = rowColumns.map(() => "?").join(", ");
      const values = rowColumns.map((c) => row[c]);
      await adapter.executeMutation(
        `INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${placeholders})`,
        values,
      );
    }
  }
}
