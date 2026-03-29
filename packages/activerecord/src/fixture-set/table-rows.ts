/**
 * Table rows — processes all fixture rows for a single table.
 *
 * Mirrors: ActiveRecord::FixtureSet::TableRows
 */

import { TableRow, type ReflectionProxy } from "./table-row.js";

export class TableRows {
  readonly tableName: string;
  private _rows: TableRow[];

  constructor(
    tableName: string,
    fixtures: Record<string, Record<string, unknown>>,
    options: { primaryKey?: string; associations?: ReflectionProxy[] } = {},
  ) {
    this.tableName = tableName;
    this._rows = [];
    const defaults = fixtures["DEFAULTS"] ?? {};
    for (const [label, row] of Object.entries(fixtures)) {
      if (label === "DEFAULTS") continue;
      this._rows.push(new TableRow(label, { ...defaults, ...row }, options));
    }
  }

  get rows(): TableRow[] {
    return [...this._rows];
  }

  get size(): number {
    return this._rows.length;
  }

  toRecords(): Array<Record<string, unknown>> {
    return this._rows.map((r) => r.row);
  }

  [Symbol.iterator](): IterableIterator<TableRow> {
    return this._rows[Symbol.iterator]();
  }
}
