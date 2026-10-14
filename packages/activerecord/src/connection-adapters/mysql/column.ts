import { registerConstant } from "@blazetrails/ruby-compat";
import { Column as BaseColumn } from "../column.js";
import { TypeMetadata } from "./type-metadata.js";

export class Column extends BaseColumn {
  /**
   * @noRailsEquivalent CONVERGEABLE deduplicable-new-runs-after-the-most-derived-constructor
   * @inventedArm if — CONVERGEABLE deduplicable-new-runs-after-the-most-derived-constructor
   */
  constructor(...args: ConstructorParameters<typeof BaseColumn>) {
    super(...args);
    if (new.target === Column) return this.deduplicate();
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
}

registerConstant("ActiveRecord::ConnectionAdapters::MySQL::Column", Column);
