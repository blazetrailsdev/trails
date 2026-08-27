import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { TypeMetadata } from "./type-metadata.js";

export class Column extends BaseColumn {
  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: TypeMetadata | null = null,
    null_: boolean = true,
    options: {
      collation?: string | null;
      comment?: string | null;
      defaultFunction?: string | null;
    } = {},
  ) {
    super(name, defaultValue, sqlTypeMetadata, null_, {
      collation: options.collation,
      comment: options.comment,
      defaultFunction: options.defaultFunction,
    });
  }

  get extra(): string | null {
    return (this.sqlTypeMetadata as TypeMetadata | null)?.extra ?? null;
  }

  isUnsigned(): boolean {
    return /\bunsigned(?: zerofill)?$/.test(this.sqlType ?? "");
  }

  isCaseSensitive(): boolean {
    return this.collation != null && !this.collation.endsWith("_ci");
  }

  isAutoIncrement(): boolean {
    return this.extra === "auto_increment";
  }

  isAutoIncrementedByDb(): boolean {
    return this.isAutoIncrement();
  }

  isVirtual(): boolean {
    return /\b(?:VIRTUAL|STORED|PERSISTENT)\b/.test(this.extra ?? "");
  }

  override encodeWith(coder: ColumnCoder): void {
    super.encodeWith(coder);
    coder["class"] = "MySQL::Column";
  }
}
