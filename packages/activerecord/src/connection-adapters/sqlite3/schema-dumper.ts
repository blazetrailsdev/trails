/**
 * SQLite3 schema dumper — SQLite-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper
 */

import type { ColumnInfo } from "../../schema-dumper.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  virtualStored?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
}

export class SchemaDumper extends AbstractSchemaDumper {
  /** @internal */
  protected override virtualTables(lines: string[]): void | Promise<void> {
    return super.virtualTables(lines);
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === "integer";
  }

  /** @internal */
  protected override isExplicitPrimaryKeyDefault(column: Column): boolean {
    return !!column.bigint;
  }

  /** @internal */
  protected override prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column);
    if (column.virtual) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = !!column.virtualStored;
      return { type: JSON.stringify(this.schemaType(column)), ...spec };
    }
    return spec;
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: Column): string {
    return JSON.stringify(column.defaultFunction ?? null);
  }
}
