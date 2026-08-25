/**
 * SQLite3 column — SQLite-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  autoIncrement: boolean;
  rowid: boolean;
  private _generatedType: "stored" | "virtual" | null;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: {
      sqlType?: string | null;
      type?: string;
      precision?: number | null;
      limit?: number | null;
      scale?: number | null;
    } = {},
    null_: boolean = true,
    options: {
      collation?: string | null;
      defaultFunction?: string | null;
      autoIncrement?: boolean;
      rowid?: boolean;
      generatedType?: "stored" | "virtual" | null;
    } = {},
  ) {
    const meta = new SqlTypeMetadata({
      sqlType: sqlTypeMetadata.sqlType ?? undefined,
      type: sqlTypeMetadata.type,
      precision: sqlTypeMetadata.precision ?? undefined,
      limit: sqlTypeMetadata.limit ?? undefined,
      scale: sqlTypeMetadata.scale ?? undefined,
    });
    super(name, defaultValue, meta, null_, {
      collation: options.collation,
      defaultFunction: options.defaultFunction,
    });
    this.autoIncrement = options.autoIncrement ?? false;
    this.rowid = options.rowid ?? false;
    this._generatedType = options.generatedType ?? null;
  }

  isAutoIncrementedByDb(): boolean {
    return this.autoIncrement || this.rowid;
  }

  /**
   * Mirrors: SQLite3::Column#virtual? — `!@generated_type.nil?`
   * (`sqlite3/column.rb:24-26`). A coder that never carried the key leaves the
   * ivar absent, which `!= null` reads the way Ruby reads nil.
   */
  isVirtual(): boolean {
    return this._generatedType != null;
  }

  isVirtualStored(): boolean {
    return this.isVirtual() && this._generatedType === "stored";
  }

  override get hasDefault(): boolean {
    return super.hasDefault && !this.isVirtual();
  }

  override equals(other: unknown): boolean {
    return (
      other instanceof Column && super.equals(other) && this.autoIncrement === other.autoIncrement
    );
  }

  /**
   * Mirrors: SQLite3::Column#init_with (`sqlite3/column.rb:35-38`) —
   * `auto_increment` only, then `super`; `rowid` and `@generated_type` are
   * dropped by a round-trip upstream too.
   */
  override initWith(coder: ColumnCoder): void {
    this.autoIncrement = (coder["auto_increment"] as boolean) ?? false;
    super.initWith(coder);
  }

  /** @see Column#encodeWith — this subclass' half of the JSON class tag. */
  override encodeWith(coder: ColumnCoder): void {
    coder["auto_increment"] = this.autoIncrement;
    super.encodeWith(coder);
    coder["class"] = "SQLite3::Column";
  }
}
