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
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  override deduplicateKey(): string {
    return JSON.stringify([super.deduplicateKey(), this.isAutoIncrement(), this.rowid]);
  }

  isAutoIncrement(): boolean {
    return this._autoIncrement;
  }

  isAutoIncrementedByDb(): boolean {
    return this.isAutoIncrement() || this.rowid;
  }

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

  override initWith(coder: ColumnCoder): void {
    this._autoIncrement = (coder["auto_increment"] as boolean) ?? false;
    super.initWith(coder);
  }

  override encodeWith(coder: ColumnCoder): void {
    coder["auto_increment"] = this._autoIncrement;
    super.encodeWith(coder);
    coder["class"] = "SQLite3::Column";
  }
}
