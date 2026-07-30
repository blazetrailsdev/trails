/**
 * SQLite3 column — SQLite-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Column
 */

import { Column as BaseColumn } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  readonly autoIncrement: boolean;
  readonly rowid: boolean;
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
      primaryKey?: boolean;
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
      primaryKey: options.primaryKey,
    });
    this.autoIncrement = options.autoIncrement ?? false;
    this.rowid = options.rowid ?? false;
    this._generatedType = options.generatedType ?? null;
  }

  isAutoIncrementedByDb(): boolean {
    return this.autoIncrement || this.rowid;
  }

  isVirtual(): boolean {
    return this._generatedType !== null;
  }

  isVirtualStored(): boolean {
    return this.isVirtual() && this._generatedType === "stored";
  }

  override get hasDefault(): boolean {
    return super.hasDefault && !this.isVirtual();
  }

  /**
   * Mirrors: SQLite3::Column#== (sqlite3/column.rb:46) — the base comparison
   * plus `auto_increment?`. The `is_a?(Column)` guard there resolves to
   * SQLite3::Column (lexical scope), so a base Column never equals one of
   * these from this side.
   *
   * Rails' paired `hash` (:53) also folds in `rowid`, but `==` does not —
   * keep the asymmetry rather than "fixing" it. `eql?`/`hash` are both in
   * api-compare's `SKIP_GROUPS`.
   */
  override equals(other: unknown): boolean {
    return (
      other instanceof Column && super.equals(other) && this.autoIncrement === other.autoIncrement
    );
  }
}
