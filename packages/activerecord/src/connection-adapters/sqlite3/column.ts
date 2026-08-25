/**
 * SQLite3 column — SQLite-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  private _autoIncrement: boolean;
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
    this._autoIncrement = options.autoIncrement ?? false;
    this.rowid = options.rowid ?? false;
    this._generatedType = options.generatedType ?? null;
  }

  /**
   * Mirrors `SQLite3::Column#hash` (`sqlite3/column.rb:53-58`), which folds
   * `auto_increment?` AND `rowid` in on top of `super` — `rowid` is in the hash
   * but not in `==` (`sqlite3/column.rb:47-51`).
   * @internal
   * Ruby's registry is a Hash keyed by the object itself, which works because
   * Rails pairs `==`/`eql?` with `hash`; a JS `Map` keys by identity, so the
   * port needs an explicit string key over exactly those attributes.
   */
  override deduplicateKey(): string {
    return JSON.stringify([super.deduplicateKey(), this.isAutoIncrement(), this.rowid]);
  }

  /** Mirrors: SQLite3::Column#auto_increment? (`sqlite3/column.rb:18-20`) */
  isAutoIncrement(): boolean {
    return this._autoIncrement;
  }

  /** Mirrors: SQLite3::Column#auto_incremented_by_db? (`sqlite3/column.rb:22-24`) */
  isAutoIncrementedByDb(): boolean {
    return this.isAutoIncrement() || this.rowid;
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
      other instanceof Column &&
      super.equals(other) &&
      this.isAutoIncrement() === other.isAutoIncrement()
    );
  }

  /**
   * Mirrors: SQLite3::Column#init_with (`sqlite3/column.rb:35-38`) —
   * `auto_increment` only, then `super`; `rowid` and `@generated_type` are
   * dropped by a round-trip upstream too.
   */
  override initWith(coder: ColumnCoder): void {
    this._autoIncrement = (coder["auto_increment"] as boolean) ?? false;
    super.initWith(coder);
  }

  /** @see Column#encodeWith — this subclass' half of the JSON class tag. */
  override encodeWith(coder: ColumnCoder): void {
    coder["auto_increment"] = this._autoIncrement;
    super.encodeWith(coder);
    coder["class"] = "SQLite3::Column";
  }
}
